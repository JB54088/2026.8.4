const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const inputFile = process.env.QUESTION_DB || path.join(ROOT, "data", "db.json");
const outputFile = process.env.QUESTION_CATALOG || path.join(ROOT, "data", "question-catalog.json");

if (!fs.existsSync(inputFile)) throw new Error(`题库数据库不存在：${inputFile}`);
const db = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const questions = Array.isArray(db.questions) ? db.questions : [];
if (!questions.length) throw new Error("没有可导出的题目");

const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "ai-math-coach-question-bank",
  questionCount: questions.length,
  questions
};
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(catalog, null, 2), "utf8");
console.log(JSON.stringify({ outputFile, questionCount: questions.length, bytes: fs.statSync(outputFile).size }));
