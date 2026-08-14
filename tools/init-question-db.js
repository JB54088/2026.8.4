#!/usr/bin/env node

const path = require("path");
const {
  createQuestionRepository
} = require("../question-repository.js");

const root = path.join(__dirname, "..");
const dbPath = process.env.QUESTION_DB_PATH
  ? path.resolve(root, process.env.QUESTION_DB_PATH)
  : path.join(root, "data", "questions.sqlite");
const sourcePath = process.env.QUESTION_SOURCE_PATH
  ? path.resolve(root, process.env.QUESTION_SOURCE_PATH)
  : path.join(root, "data", "question-bank-source.json");
const rebuild = process.argv.includes("--rebuild");

const repository = createQuestionRepository({
  dbPath,
  sourcePath,
  initializeIfEmpty: true,
  rebuild
});

const stats = repository.stats();
console.log(JSON.stringify({
  dbPath: stats.dbPath,
  questionCount: stats.count,
  status: stats.status,
  meta: stats.meta
}, null, 2));
repository.close();
