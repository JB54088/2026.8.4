#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "data", "question-bank-source.json");
const legacyPath = path.join(root, "data", "db.json");

function readQuestions(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return { raw, questions: Array.isArray(raw) ? raw : raw.questions };
}

function writeQuestions(file, raw, questions) {
  const next = Array.isArray(raw) ? questions : { ...raw, questions };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

const source = readQuestions(sourcePath);
const legacy = readQuestions(legacyPath);
const isGenerated = (question) => String(question?.id || "").startsWith("gen_");
const sourceQuestions = source.questions.filter((question) => !isGenerated(question));
const legacyQuestions = legacy.questions.filter((question) => !isGenerated(question));

if (sourceQuestions.length !== legacyQuestions.length) {
  throw new Error(`题库副本数量不一致：source=${sourceQuestions.length} legacy=${legacyQuestions.length}`);
}

writeQuestions(sourcePath, source.raw, sourceQuestions);
writeQuestions(legacyPath, legacy.raw, legacyQuestions);

console.log(JSON.stringify({
  removed: source.questions.length - sourceQuestions.length,
  remaining: sourceQuestions.length,
  sourcePath,
  legacyPath
}, null, 2));
