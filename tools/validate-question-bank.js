#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  QUESTION_SCHEMA_VERSION,
  normalizeQuestionList,
  isPracticeQuestionReady
} = require("../public/question-model.js");
const { createQuestionRepository } = require("../question-repository.js");

const root = path.join(__dirname, "..");
const inputArgument = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "";
const dbPath = process.env.QUESTION_DB_PATH
  ? path.resolve(root, process.env.QUESTION_DB_PATH)
  : path.join(root, "data", "questions.sqlite");
const sourcePath = process.env.QUESTION_SOURCE_PATH
  ? path.resolve(root, process.env.QUESTION_SOURCE_PATH)
  : path.join(root, "data", "question-bank-source.json");
let questions;
let inputLabel;
let repository;

if (inputArgument) {
  const inputPath = path.resolve(inputArgument);
  const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  questions = Array.isArray(source) ? source : source.questions;
  inputLabel = inputPath;
} else if (fs.existsSync(dbPath)) {
  repository = createQuestionRepository({ dbPath, sourcePath });
  questions = repository.all();
  inputLabel = dbPath;
} else {
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  questions = Array.isArray(source) ? source : source.questions;
  inputLabel = sourcePath;
}

if (!Array.isArray(questions)) throw new Error("输入文件必须是题目数组或包含 questions 数组的 db.json");

const normalized = normalizeQuestionList(questions);
const ids = new Set();
const duplicateIds = [];
normalized.forEach((question) => {
  if (ids.has(question.id)) duplicateIds.push(question.id);
  ids.add(question.id);
});
const published = normalized.filter((question) => question.practiceMeta.status === "published");
const invalidPublished = published.filter((question) => !isPracticeQuestionReady(question));
const practiceReady = normalized.filter((question) => isPracticeQuestionReady(question));
const directPractice = practiceReady.filter((question) => question.sourceType === "past_exam" && question.allowUnreviewedPractice === true);
const counts = normalized.reduce((map, question) => {
  const status = question.practiceMeta.status;
  map[status] = (map[status] || 0) + 1;
  return map;
}, {});

console.log(`校验来源：${inputLabel}`);
console.log(`题目总数：${normalized.length}`);
console.log(`schemaVersion：${QUESTION_SCHEMA_VERSION}`);
console.log(`标注状态：${JSON.stringify(counts)}`);
console.log(`已发布可刷：${published.length - invalidPublished.length}`);
console.log(`可直接刷题：${practiceReady.length}`);
console.log(`未审核真题直刷：${directPractice.length}`);
if (duplicateIds.length) {
  console.error(`题目 id 重复：${duplicateIds.slice(0, 30).join(", ")}`);
  process.exitCode = 1;
}
if (invalidPublished.length) {
  console.error(`已发布但校验失败：${invalidPublished.length}`);
  invalidPublished.slice(0, 30).forEach((question) => console.error(`  - ${question.id}`));
  process.exitCode = 1;
}
if (repository) repository.close();
