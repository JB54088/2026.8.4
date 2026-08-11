#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  QUESTION_SCHEMA_VERSION,
  normalizeQuestionList,
  isPracticeQuestionReady
} = require("../public/question-model.js");

const root = path.join(__dirname, "..");
const inputPath = path.resolve(process.argv[2] || path.join(root, "data", "db.json"));
const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const questions = Array.isArray(source) ? source : source.questions;
if (!Array.isArray(questions)) throw new Error("输入文件必须是题目数组或包含 questions 数组的 db.json");

const normalized = normalizeQuestionList(questions);
const published = normalized.filter((question) => question.practiceMeta.status === "published");
const invalidPublished = published.filter((question) => !isPracticeQuestionReady(question));
const counts = normalized.reduce((map, question) => {
  const status = question.practiceMeta.status;
  map[status] = (map[status] || 0) + 1;
  return map;
}, {});

console.log(`题目总数：${normalized.length}`);
console.log(`schemaVersion：${QUESTION_SCHEMA_VERSION}`);
console.log(`标注状态：${JSON.stringify(counts)}`);
console.log(`已发布可刷：${published.length - invalidPublished.length}`);
if (invalidPublished.length) {
  console.error(`已发布但校验失败：${invalidPublished.length}`);
  invalidPublished.slice(0, 30).forEach((question) => console.error(`  - ${question.id}`));
  process.exitCode = 1;
}
