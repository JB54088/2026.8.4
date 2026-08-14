const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const {
  QUESTION_SCHEMA_VERSION,
  normalizeQuestion,
  normalizeQuestionList,
  isPracticeQuestionReady
} = require("./public/question-model.js");

const QUESTION_DB_SCHEMA_VERSION = 1;

function ensureParentDirectory(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function readQuestionSource(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`题库源文件不存在：${sourcePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const questions = Array.isArray(raw) ? raw : raw?.questions;
  if (!Array.isArray(questions)) {
    throw new Error(`题库源文件必须是题目数组或包含 questions 数组：${sourcePath}`);
  }
  return questions;
}

function normalizedQuestionList(questions) {
  const normalized = normalizeQuestionList(questions);
  const ids = new Set();
  normalized.forEach((question, index) => {
    if (!question.id) throw new Error(`第 ${index + 1} 道题缺少 id`);
    if (ids.has(question.id)) throw new Error(`题目 id 重复：${question.id}`);
    ids.add(question.id);
    if (question.schemaVersion !== QUESTION_SCHEMA_VERSION) {
      throw new Error(`题目 ${question.id} 的 schemaVersion 不是 ${QUESTION_SCHEMA_VERSION}`);
    }
    if (question.practiceMeta?.status === "published" && !isPracticeQuestionReady(question)) {
      throw new Error(`题目 ${question.id} 标记为 published，但未通过题库可刷校验`);
    }
  });
  return normalized;
}

function sourceHash(sourcePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
}

function createSchema(database) {
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS question_db_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      subjects_json TEXT NOT NULL,
      section_id TEXT NOT NULL,
      section_name TEXT NOT NULL,
      type TEXT NOT NULL,
      difficulty INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      practice_status TEXT NOT NULL,
      knowledge_point_id TEXT NOT NULL,
      training_level TEXT NOT NULL,
      similar_group_id TEXT NOT NULL,
      question_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_questions_section_id ON questions(section_id);
    CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);
    CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
    CREATE INDEX IF NOT EXISTS idx_questions_source_type ON questions(source_type);
    CREATE INDEX IF NOT EXISTS idx_questions_practice_status ON questions(practice_status);
    CREATE INDEX IF NOT EXISTS idx_questions_knowledge_point ON questions(knowledge_point_id);
    CREATE INDEX IF NOT EXISTS idx_questions_training_level ON questions(training_level);
    CREATE INDEX IF NOT EXISTS idx_questions_section_status ON questions(section_id, practice_status);
  `);
}

function questionRow(question, updatedAt = new Date().toISOString()) {
  const normalized = normalizeQuestion(question);
  return [
    normalized.id,
    JSON.stringify(normalized.subjects || []),
    normalized.sectionId || "",
    normalized.sectionName || "",
    normalized.type || "subjective",
    Number(normalized.difficulty || 3),
    normalized.sourceSpec?.type || normalized.sourceType || "teacher_original",
    normalized.practiceMeta?.status || normalized.practiceStatus || "needs_review",
    normalized.practiceMeta?.knowledgePointId || normalized.knowledgePointId || "",
    normalized.practiceMeta?.trainingLevel || normalized.trainingLevel || "same_type",
    normalized.practiceMeta?.similarGroupId || normalized.similarGroupId || "",
    JSON.stringify(normalized),
    updatedAt
  ];
}

function rowQuestion(row) {
  try {
    return normalizeQuestion(JSON.parse(row.question_json));
  } catch (error) {
    throw new Error(`题目 ${row.id} 的数据库内容损坏：${error.message}`);
  }
}

function setMeta(database, values) {
  const statement = database.prepare(`
    INSERT INTO question_db_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const transaction = database.transaction((entries) => {
    entries.forEach(([key, value]) => statement.run(key, String(value)));
  });
  transaction(Object.entries(values));
}

function getMeta(database) {
  return Object.fromEntries(database.prepare("SELECT key, value FROM question_db_meta").all().map((row) => [row.key, row.value]));
}

function resetQuestions(database) {
  database.exec("DELETE FROM questions; DELETE FROM question_db_meta;");
}

function createQuestionRepository({ dbPath, sourcePath, initializeIfEmpty = false, rebuild = false }) {
  ensureParentDirectory(dbPath);
  const database = new Database(dbPath);
  createSchema(database);

  const repository = {
    database,
    dbPath,
    sourcePath,
    count() {
      return database.prepare("SELECT COUNT(*) AS count FROM questions").get().count;
    },
    meta() {
      return getMeta(database);
    },
    all() {
      return database.prepare("SELECT question_json FROM questions ORDER BY rowid").all().map(rowQuestion);
    },
    findById(id) {
      const row = database.prepare("SELECT * FROM questions WHERE id = ?").get(id);
      return row ? rowQuestion(row) : null;
    },
    upsert(questions, { source = "manual", sourceHashValue = "" } = {}) {
      const normalized = normalizedQuestionList(questions);
      const statement = database.prepare(`
        INSERT INTO questions (
          id, subjects_json, section_id, section_name, type, difficulty,
          source_type, practice_status, knowledge_point_id, training_level,
          similar_group_id, question_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          subjects_json = excluded.subjects_json,
          section_id = excluded.section_id,
          section_name = excluded.section_name,
          type = excluded.type,
          difficulty = excluded.difficulty,
          source_type = excluded.source_type,
          practice_status = excluded.practice_status,
          knowledge_point_id = excluded.knowledge_point_id,
          training_level = excluded.training_level,
          similar_group_id = excluded.similar_group_id,
          question_json = excluded.question_json,
          updated_at = excluded.updated_at
      `);
      const updatedAt = new Date().toISOString();
      const transaction = database.transaction((items) => {
        items.forEach((question) => statement.run(...questionRow(question, updatedAt)));
      });
      transaction(normalized);
      setMeta(database, {
        databaseSchemaVersion: QUESTION_DB_SCHEMA_VERSION,
        questionSchemaVersion: QUESTION_SCHEMA_VERSION,
        questionCount: this.count(),
        lastImportAt: updatedAt,
        lastImportCount: normalized.length,
        lastImportSource: source,
        sourceHash: sourceHashValue || getMeta(database).sourceHash || ""
      });
      return normalized.length;
    },
    initializeFromSource({ force = false } = {}) {
      const existingCount = this.count();
      if (existingCount > 0 && !force) return { imported: 0, count: existingCount, initialized: false };
      const raw = readQuestionSource(sourcePath);
      const hash = sourceHash(sourcePath);
      if (force) resetQuestions(database);
      const imported = this.upsert(raw, { source: sourcePath, sourceHashValue: hash });
      return { imported, count: this.count(), initialized: true };
    },
    stats() {
      const status = database.prepare("SELECT practice_status AS status, COUNT(*) AS count FROM questions GROUP BY practice_status").all();
      return {
        count: this.count(),
        status: Object.fromEntries(status.map((row) => [row.status, row.count])),
        meta: this.meta(),
        dbPath
      };
    },
    close() {
      database.close();
    }
  };

  if (rebuild) repository.initializeFromSource({ force: true });
  else if (initializeIfEmpty) repository.initializeFromSource();
  return repository;
}

module.exports = {
  QUESTION_DB_SCHEMA_VERSION,
  createQuestionRepository,
  readQuestionSource,
  normalizedQuestionList,
  sourceHash
};
