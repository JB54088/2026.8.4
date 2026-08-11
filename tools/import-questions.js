const fs = require("fs");
const path = require("path");
const {
  normalizeQuestion: normalizeQuestionModel,
  isPracticeQuestionReady
} = require("../public/question-model.js");

const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "db.json");

const usage = `
Usage:
  node tools/import-questions.js path/to/questions.json
  node tools/import-questions.js path/to/questions.csv

Required fields:
  id,subjects,chapterId,chapterName,point,reason,type,level,stem,answer,source

Optional fields:
  options,aliases,explanation,formula,formulaFormat,stemFormat,book,bookSection,problemNo
  practiceStatus,knowledgePointId,knowledgePointName,errorTypes,trainingLevel,similarGroupId,reviewer,reviewedAt

CSV notes:
  subjects/options/aliases use | as separator.
`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift().map((item) => item.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function normalizeQuestion(raw, index) {
  const split = (value) => Array.isArray(value)
    ? value
    : String(value || "").split("|").map((item) => item.trim()).filter(Boolean);
  const question = {
    id: String(raw.id || `${raw.book || "import"}_${raw.problemNo || index + 1}`).trim(),
    subjects: split(raw.subjects),
    chapterId: String(raw.chapterId || "").trim(),
    chapterName: String(raw.chapterName || "").trim(),
    point: String(raw.point || "").trim(),
    reason: String(raw.reason || "待标注").trim(),
    type: String(raw.type || "").trim(),
    level: String(raw.level || "待分层").trim(),
    difficulty: raw.difficulty ? Number(raw.difficulty) : undefined,
    stem: String(raw.stem || "").trim(),
    stemFormat: String(raw.stemFormat || "").trim(),
    formula: String(raw.formula || "").trim(),
    formulaFormat: String(raw.formulaFormat || "").trim(),
    options: split(raw.options),
    answer: String(raw.answer || "").trim(),
    aliases: split(raw.aliases),
    explanation: String(raw.explanation || "").trim(),
    source: String(raw.source || raw.book || "授权导入题库").trim(),
    sourceType: String(raw.sourceType || "teacher_original").trim(),
    sourceName: String(raw.sourceName || raw.source || raw.book || "授权导入题库").trim(),
    sourceYear: raw.sourceYear ? Number(raw.sourceYear) : null,
    sourceQuestionNo: String(raw.sourceQuestionNo || raw.problemNo || "").trim(),
    book: String(raw.book || "").trim(),
    bookSection: String(raw.bookSection || "").trim(),
    problemNo: String(raw.problemNo || "").trim(),
    practiceMeta: raw.practiceMeta && typeof raw.practiceMeta === "object" ? raw.practiceMeta : undefined,
    practiceStatus: String(raw.practiceStatus || "").trim(),
    knowledgePointId: String(raw.knowledgePointId || "").trim(),
    knowledgePointName: String(raw.knowledgePointName || "").trim(),
    errorTypes: split(raw.errorTypes || raw.errorTypeCodes || ""),
    trainingLevel: String(raw.trainingLevel || "").trim(),
    similarGroupId: String(raw.similarGroupId || "").trim(),
    reviewer: String(raw.reviewer || "").trim(),
    reviewedAt: String(raw.reviewedAt || "").trim()
  };
  const missing = ["subjects", "chapterId", "chapterName", "point", "type", "stem", "answer", "source"]
    .filter((field) => Array.isArray(question[field]) ? !question[field].length : !question[field]);
  if (missing.length) throw new Error(`Question ${index + 1} missing fields: ${missing.join(", ")}`);
  if (!["choice", "fill", "solution", "subjective"].includes(question.type)) {
    throw new Error(`Question ${index + 1} has invalid type: ${question.type}`);
  }
  if (question.type === "choice" && question.options.length < 2) {
    throw new Error(`Question ${index + 1} is choice but has fewer than 2 options`);
  }
  const normalized = normalizeQuestionModel(question);
  if (normalized.practiceMeta.status === "published" && !isPracticeQuestionReady(normalized)) {
    throw new Error(`Question ${index + 1} 标记为 published，但未通过题库可刷校验：请补齐知识点、错误类型、答案、解析和审核状态`);
  }
  return normalized;
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error(usage);
    process.exit(1);
  }
  const absolute = path.resolve(input);
  const text = fs.readFileSync(absolute, "utf8");
  const ext = path.extname(absolute).toLowerCase();
  const raw = ext === ".json" ? JSON.parse(text) : parseCsv(text);
  const imported = raw.map(normalizeQuestion);
  const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  const byId = new Map(db.questions.map((question) => [question.id, question]));
  imported.forEach((question) => byId.set(question.id, question));
  db.questions = Array.from(byId.values());
  db.meta.lastImportAt = new Date().toISOString();
  db.meta.lastImportCount = imported.length;
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
  console.log(`Imported ${imported.length} questions. Total: ${db.questions.length}`);
}

main();
