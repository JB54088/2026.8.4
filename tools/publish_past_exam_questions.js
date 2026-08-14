#!/usr/bin/env node

/**
 * 将真题候选发布到正式 past-exam-questions.json。
 * 默认只校验和预览；必须显式传 --apply 才会写入正式题库。
 *
 * --trial 是一个明确的试运行通道：它会把原页文本和原页图片链接导入
 * 刷题池，但保留 answerStatus=pending_review，因此提交后不会自动判分。
 */

const fs = require("fs");
const path = require("path");
const {
  normalizeQuestion: normalizeQuestionModel,
  isPracticeQuestionReady
} = require("../public/question-model.js");
const { createQuestionRepository } = require("../question-repository.js");

const ROOT = path.join(__dirname, "..");
const DEFAULT_INPUT = path.join(ROOT, "data", "past-exam-staging", "probability-pilot.json");
const DEFAULT_OUTPUT = path.join(ROOT, "data", "past-exam-questions.json");

function usage() {
  return `Usage:
  node tools/publish_past_exam_questions.js [staging.json] [--apply] [--trial] [--output questions.json]

Normal publish requires all of these values:
  publishStatus=published
  reviewStatus=teacher_reviewed
  answerStatus=reviewed

Trial publish (--trial) imports the selected candidates with the original page
image link and keeps the answer pending, so the practice flow can be tested
without pretending that OCR answers have been reviewed.

Without --apply the command only validates and reports the result.`;
}

function parseArgs(argv) {
  const positional = [];
  let apply = false;
  let trial = false;
  let outputPath = DEFAULT_OUTPUT;
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
    if (arg === "--trial") {
      trial = true;
      continue;
    }
    if (arg === "--output") {
      outputPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    positional.push(arg);
  }
  return { inputPath: path.resolve(positional[0] || DEFAULT_INPUT), outputPath, apply, trial };
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split("|").map((item) => item.trim()).filter(Boolean);
}

function trialChoiceOptions(text) {
  const matches = [...String(text || "").matchAll(/[（(]\s*([A-D])\s*[）)]\s*([\s\S]*?)(?=\s*[（(]\s*[A-D]\s*[）)]|$)/g)];
  const options = matches
    .map((match) => `${match[1]}. ${match[2].replace(/\s+/g, " ").trim()}`.trim())
    .filter((option) => option.length > 3);
  return options.length >= 2 ? options.slice(0, 4) : ["A（请对照原页）", "B（请对照原页）", "C（请对照原页）", "D（请对照原页）"];
}

function normalizedQuestion(candidate, index, source, { trial = false } = {}) {
  const type = String(candidate.type || candidate.suggestedType || "").trim();
  const candidateSubjects = asArray(candidate.subjects);
  const subjects = candidateSubjects.length ? candidateSubjects : trial ? ["数学一", "数学三"] : [];
  const candidateOptions = asArray(candidate.options);
  const options = candidateOptions.length
    ? candidateOptions
    : trial && type === "choice"
      ? trialChoiceOptions(candidate.rawTextExcerpt)
      : [];
  const question = {
    id: String(candidate.id || "").trim(),
    subjects,
    chapterId: String(candidate.chapterId || candidate.suggestedChapterId || "").trim(),
    chapterName: String(candidate.chapterName || candidate.suggestedChapterName || "").trim(),
    point: String(candidate.point || (trial ? candidate.sourceLabel || "真题试运行" : "")).trim(),
    reason: String(candidate.reason || (trial ? "真题专项试运行" : "真题专项训练")).trim(),
    type,
    level: String(candidate.level || (trial ? "历年真题（试运行）" : "历年真题")).trim(),
    difficulty: Number(candidate.difficulty || 4),
    stem: String(candidate.stem || (trial ? candidate.rawTextExcerpt : "")).trim(),
    options,
    answer: trial ? "" : String(candidate.answer || "").trim(),
    answerStatus: trial ? "pending_review" : String(candidate.answerStatus || "").trim(),
    aliases: asArray(candidate.aliases),
    explanation: String(candidate.explanation || (trial
      ? "试运行导入：答案和解析尚未人工校对，请通过“查看原页”核对本题。"
      : "")).trim(),
    sourceType: "past_exam",
    source: String(candidate.source || source.title || "真题分类概率").trim(),
    sourceBook: source.title || "真题分类概率",
    sourceSection: String(candidate.sourceSection || candidate.suggestedChapterName || "").trim(),
    sourceYear: candidate.sourceYear == null ? (candidate.yearHint == null ? null : Number(candidate.yearHint)) : Number(candidate.sourceYear),
    sourceMathType: String(candidate.sourceMathType || (trial ? "数学一、数学三" : "")).trim(),
    sourceQuestionNo: String(candidate.sourceQuestionNo || candidate.sourceLabel || "").trim(),
    sourcePage: Number(candidate.sourcePage || 0),
    sourcePageImage: String(candidate.sourcePageImage || "").trim(),
    stemImage: String(candidate.stemImage || "").trim(),
    reviewStatus: trial ? "trial_imported" : "teacher_reviewed",
    publishStatus: "published",
    qualityTier: trial ? "past_exam_trial" : "exam_standard",
    practiceStatus: trial ? "needs_review" : "published",
    knowledgePointId: String(candidate.knowledgePointId || "").trim(),
    knowledgePointName: String(candidate.knowledgePointName || candidate.point || (trial ? candidate.sourceLabel : "")).trim(),
    errorTypes: asArray(candidate.errorTypes || candidate.errorType || candidate.reason || (trial ? "transfer" : "")),
    trainingLevel: String(candidate.trainingLevel || "").trim(),
    similarGroupId: String(candidate.similarGroupId || "").trim(),
    reviewer: String(candidate.reviewer || "").trim(),
    reviewedAt: String(candidate.reviewedAt || "").trim()
  };

  const required = trial
    ? ["id", "chapterId", "chapterName", "point", "type", "stem", "sourcePage"]
    : ["id", "chapterId", "chapterName", "point", "type", "stem", "answer", "sourcePage"];
  const missing = required.filter((field) => !question[field]);
  if (!question.subjects.length) missing.push("subjects");
  if (!question.explanation) missing.push("explanation");
  if (!trial && question.answerStatus !== "reviewed") missing.push("answerStatus=reviewed");
  if (!["choice", "fill", "solution", "subjective"].includes(question.type)) {
    missing.push(`type=${question.type || "empty"}`);
  }
  if (question.type === "choice" && question.options.length < 2) missing.push("options");
  if (missing.length) {
    throw new Error(`第 ${index + 1} 条 ${question.id || "未命名题"} 不可发布：${missing.join(", ")}`);
  }
  const normalized = normalizeQuestionModel(question);
  if (!trial && !isPracticeQuestionReady(normalized)) {
    throw new Error(`第 ${index + 1} 条 ${question.id || "未命名题"} 未通过已发布题库校验`);
  }
  return normalized;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const staging = JSON.parse(fs.readFileSync(args.inputPath, "utf8"));
  const candidates = Array.isArray(staging.candidates) ? staging.candidates : [];
  const publishable = [];
  const rejected = [];

  candidates.forEach((candidate, index) => {
    if (args.trial) {
      try {
        publishable.push(normalizedQuestion(candidate, index, staging, { trial: true }));
      } catch (error) {
        rejected.push(error.message);
      }
      return;
    }
    if (candidate.publishStatus !== "published") return;
    if (candidate.reviewStatus !== "teacher_reviewed") {
      rejected.push(`${candidate.id || index + 1}: reviewStatus 不是 teacher_reviewed`);
      return;
    }
    try {
      publishable.push(normalizedQuestion(candidate, index, staging));
    } catch (error) {
      rejected.push(error.message);
    }
  });

  console.log(`候选总数：${candidates.length}`);
  console.log(`符合发布状态：${publishable.length}`);
  console.log(`不符合校验：${rejected.length}`);
  if (rejected.length) rejected.slice(0, 20).forEach((message) => console.log(`  - ${message}`));
  if (!args.apply) {
    console.log(args.trial
      ? "试运行预览：未写入正式题库；使用 --trial --apply 写入可刷但不自动判分的题目。"
      : "预览模式：未写入正式题库。补齐审核字段后使用 --apply 发布。");
    return;
  }
  if (rejected.length) throw new Error("存在未通过校验的待发布候选，已停止写入。");
  if (!publishable.length) throw new Error(args.trial ? "没有可导入的试运行真题。" : "没有可发布的已审核真题。");

  const existing = fs.existsSync(args.outputPath)
    ? JSON.parse(fs.readFileSync(args.outputPath, "utf8"))
    : [];
  const byId = new Map(existing.map((question) => [question.id, question]));
  publishable.forEach((question) => byId.set(question.id, question));
  const next = Array.from(byId.values());
  fs.writeFileSync(args.outputPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  const repository = createQuestionRepository({
    dbPath: process.env.QUESTION_DB_PATH
      ? path.resolve(ROOT, process.env.QUESTION_DB_PATH)
      : path.join(ROOT, "data", "questions.sqlite"),
    sourcePath: process.env.QUESTION_SOURCE_PATH
      ? path.resolve(ROOT, process.env.QUESTION_SOURCE_PATH)
      : path.join(ROOT, "data", "question-bank-source.json"),
    initializeIfEmpty: true
  });
  repository.upsert(publishable, { source: args.inputPath });
  repository.close();
  console.log(`${args.trial ? "已导入试运行真题" : "已发布真题"} ${publishable.length} 道：${args.outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error(usage());
  process.exit(1);
}
