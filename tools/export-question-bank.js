#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  normalizedQuestionList
} = require("../question-repository.js");

const root = path.join(__dirname, "..");
const inputPath = path.resolve(process.argv[2] || path.join(root, "data", "db.json"));
const outputPath = path.resolve(process.argv[3] || path.join(root, "data", "question-bank-source.json"));

if (!fs.existsSync(inputPath)) throw new Error(`输入文件不存在：${inputPath}`);
const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const questions = Array.isArray(raw) ? raw : raw?.questions;
if (!Array.isArray(questions)) throw new Error("输入文件必须是题目数组或包含 questions 数组的 db.json");

const normalized = normalizedQuestionList(questions);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(normalized, null, 2), "utf8");
console.log(`Exported ${normalized.length} questions to ${path.relative(root, outputPath)}`);
