#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const inputFiles = process.argv.slice(2).length
  ? process.argv.slice(2).map((file) => path.resolve(file))
  : [
      path.join(root, "data", "question-bank-source.json"),
      path.join(root, "data", "past-exam-questions.json")
    ];

function categoryFor(type) {
  if (type === "choice") return ["choice", "选择题"];
  if (type === "fill") return ["fill", "填空题"];
  if (type === "solution" || type === "subjective") return ["major", "大题"];
  throw new Error(`无法识别题型：${type || "空值"}`);
}

function annotateFile(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const questions = Array.isArray(raw) ? raw : raw?.questions;
  if (!Array.isArray(questions)) throw new Error(`题库文件不是题目数组：${file}`);

  const counts = {};
  questions.forEach((question, index) => {
    const type = String(question.type || question.questionType || "").trim().toLowerCase();
    const [category, label] = categoryFor(type);
    question.questionCategory = category;
    question.questionCategoryLabel = label;
    counts[label] = (counts[label] || 0) + 1;
    if (!question.id) throw new Error(`${file} 第 ${index + 1} 道题缺少 id`);
  });

  const output = `${JSON.stringify(raw, null, 2)}\n`;
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, output, "utf8");
  fs.renameSync(temporary, file);
  console.log(`${file}: ${questions.length} 题，${JSON.stringify(counts)}`);
}

inputFiles.forEach(annotateFile);
