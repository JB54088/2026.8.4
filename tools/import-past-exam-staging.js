#!/usr/bin/env node

/**
 * 将 extract_past_exam_questions.py 生成的 staging JSON 导入当前题库。
 *
 * 默认只做规范化和重复检查；必须显式传 --apply 才会写入 SQLite，并把
 * SQLite 中的完整规范化题目同步回 question-bank-source.json。staging 中
 * 的题目通常是 needs_review，因此默认不会进入可刷题池。需要直接试刷时，
 * 可显式传 --open-practice；该开关只给本批 past_exam 记录增加未审核试刷标记，
 * 不会伪造答案或解析。
 */

const fs = require("fs");
const path = require("path");
const {
  createQuestionRepository,
  normalizedQuestionList
} = require("../question-repository.js");

const ROOT = path.join(__dirname, "..");
const DEFAULT_INPUT = path.join(ROOT, "data", "past-exam-staging", "extracted-1987-2025.json");
const DEFAULT_DB = path.join(ROOT, "data", "questions.sqlite");
const DEFAULT_SOURCE = path.join(ROOT, "data", "question-bank-source.json");

function usage() {
  return `Usage:
  node tools/import-past-exam-staging.js [staging.json] [--open-practice] [--apply]

默认只预览；--apply 才会写入当前 SQLite 和 question-bank-source.json。
--open-practice 允许本批未审核真题直接进入刷题池，答案和解析仍保持待补录状态。`;
}

function parseArgs(argv) {
  const positional = [];
  let apply = false;
  let openPractice = false;
  let dbPath = process.env.QUESTION_DB_PATH
    ? path.resolve(ROOT, process.env.QUESTION_DB_PATH)
    : DEFAULT_DB;
  let sourcePath = process.env.QUESTION_SOURCE_PATH
    ? path.resolve(ROOT, process.env.QUESTION_SOURCE_PATH)
    : DEFAULT_SOURCE;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--open-practice") {
      openPractice = true;
      continue;
    }
    if (arg === "--db") {
      dbPath = path.resolve(argv[++index]);
      continue;
    }
    if (arg === "--source") {
      sourcePath = path.resolve(argv[++index]);
      continue;
    }
    positional.push(arg);
  }
  return {
    inputPath: path.resolve(positional[0] || DEFAULT_INPUT),
    dbPath,
    sourcePath,
    apply,
    openPractice
  };
}

function readStaging(inputPath) {
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const questions = Array.isArray(raw) ? raw : raw?.questions;
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error("staging 文件必须是非空题目数组或包含 questions 数组");
  }
  return { raw, questions };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.inputPath)) throw new Error(`staging 文件不存在：${args.inputPath}`);
  const { raw, questions } = readStaging(args.inputPath);
  const inputQuestions = args.openPractice
    ? questions.map((question) => ({ ...question, allowUnreviewedPractice: true }))
    : questions;
  const normalized = normalizedQuestionList(inputQuestions);
  const ids = new Set(normalized.map((question) => question.id));
  const sourceTypeCounts = normalized.reduce((counts, question) => {
    const status = question.practiceMeta?.status || "needs_review";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});

  const repository = createQuestionRepository({
    dbPath: args.dbPath,
    sourcePath: args.sourcePath,
    initializeIfEmpty: true
  });
  const existingIds = normalized.filter((question) => repository.findById(question.id)).map((question) => question.id);

  console.log(`输入文件：${args.inputPath}`);
  console.log(`候选题：${normalized.length}；唯一 ID：${ids.size}；状态：${JSON.stringify(sourceTypeCounts)}`);
  console.log(`未审核试刷：${args.openPractice ? "已开启" : "未开启"}`);
  console.log(`将覆盖已有同 ID 记录：${existingIds.length}`);

  if (!args.apply) {
    repository.close();
    console.log("预览模式：未写入 SQLite 或 canonical source。使用 --apply 执行导入。");
    return;
  }

  repository.upsert(normalized, { source: args.inputPath });
  const allQuestions = repository.all();
  repository.close();
  writeJson(args.sourcePath, allQuestions);

  console.log(`已写入 SQLite：${args.dbPath}`);
  console.log(`已同步 canonical source：${args.sourcePath}`);
  console.log(`题库总数：${allQuestions.length}`);
  if (raw?.reviewFlagCounts) {
    console.log(`待审核标记：${JSON.stringify(raw.reviewFlagCounts)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error(usage());
  process.exit(1);
}
