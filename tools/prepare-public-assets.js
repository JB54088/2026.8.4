#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const katexRoot = path.join(root, "node_modules", "katex", "dist");
const publicRoot = path.join(root, "public", "vendor", "katex");
const questionBankSource = path.join(root, "data", "question-bank-source.json");
const publicQuestionBank = path.join(root, "public", "question-bank.json");

if (!fs.existsSync(katexRoot)) {
  throw new Error("未找到 KaTeX 依赖，请先运行 npm install");
}

fs.mkdirSync(publicRoot, { recursive: true });
fs.copyFileSync(path.join(katexRoot, "katex.min.js"), path.join(publicRoot, "katex.min.js"));
fs.copyFileSync(path.join(katexRoot, "katex.min.css"), path.join(publicRoot, "katex.min.css"));

const sourceFonts = path.join(katexRoot, "fonts");
const targetFonts = path.join(publicRoot, "fonts");
fs.mkdirSync(targetFonts, { recursive: true });
fs.readdirSync(sourceFonts).forEach((file) => {
  fs.copyFileSync(path.join(sourceFonts, file), path.join(targetFonts, file));
});

if (!fs.existsSync(questionBankSource)) {
  throw new Error("未找到题库源文件 data/question-bank-source.json");
}
fs.copyFileSync(questionBankSource, publicQuestionBank);

console.log("Prepared local KaTeX assets in public/vendor/katex");
console.log("Published canonical question bank to public/question-bank.json");
