#!/usr/bin/env node

/**
 * 将 extract_past_exam_answers.py 生成的答案 staging JSON 匹配回题库。
 *
 * 优先按 questionId（该 ID 来自 sourceBook + sourceExampleNo 的精确匹配）更新。
 * 对历史概率题候选记录，仅按其明确的例题号回连到同一 sourceBook 的答案记录；
 * 不按题干相似度猜题。默认预览；--apply 才会写 SQLite 和 canonical source。
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  createQuestionRepository,
  normalizedQuestionList,
  readQuestionSource
} = require("../question-repository.js");

const ROOT = path.join(__dirname, "..");
const DEFAULT_ANSWERS = path.join(ROOT, "data", "past-exam-staging", "answers-matched-1987-2025.json");
const DEFAULT_DB = path.join(ROOT, "data", "questions.sqlite");
const DEFAULT_SOURCE = path.join(ROOT, "data", "question-bank-source.json");
const DEFAULT_REPORT = path.join(ROOT, "data", "past-exam-staging", "answers-import-report.json");

function usage() {
  return `Usage:
  node tools/import_past_exam_answers.js [answers-matched.json] [--apply]

默认只预览；--apply 才会写入 SQLite 和 question-bank-source.json。`;
}

function parseArgs(argv) {
  const positional = [];
  let apply = false;
  let dbPath = process.env.QUESTION_DB_PATH
    ? path.resolve(ROOT, process.env.QUESTION_DB_PATH)
    : DEFAULT_DB;
  let sourcePath = process.env.QUESTION_SOURCE_PATH
    ? path.resolve(ROOT, process.env.QUESTION_SOURCE_PATH)
    : DEFAULT_SOURCE;
  let reportPath = DEFAULT_REPORT;

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
    if (arg === "--db") {
      dbPath = path.resolve(argv[++index]);
      continue;
    }
    if (arg === "--source") {
      sourcePath = path.resolve(argv[++index]);
      continue;
    }
    if (arg === "--report") {
      reportPath = path.resolve(argv[++index]);
      continue;
    }
    positional.push(arg);
  }

  return {
    answersPath: path.resolve(positional[0] || DEFAULT_ANSWERS),
    dbPath,
    sourcePath,
    reportPath,
    apply
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readAnswers(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!raw || !Array.isArray(raw.matches)) throw new Error("答案 staging JSON 缺少 matches 数组");
  return raw;
}

function sourceHash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function isConcreteAnswer(match) {
  const value = String(match.answer || "").trim();
  if (!value || /^(见解析|略|待提取|答案待补录)$/i.test(value)) return false;
  return [
    "answer_text_extracted",
    "choice_key_extracted",
    "choice_key_extracted_from_adjacent_line",
    "choice_key_extracted_without_marker",
    "answer_extracted_without_marker",
    "explicit_text_answer"
  ].includes(match.answerExtractionStatus);
}

function answerFromMatch(match) {
  const value = String(match.answer || "").trim();
  if (value === "见解析" && match.questionType === "choice") return "";
  return value;
}

function shouldReplaceExplanation(value) {
  return !value || /试运行导入|标准答案待人工校对|请对照原页|答案和解析尚未人工校对/.test(value);
}

function legacyAnswerMatchKey(question) {
  // 早期概率题候选记录没有新题库 questionId，但保留了“例 NNNN”。
  // 只对这个已知来源执行例题号回连，避免把不同章节的题号混用。
  if (question.sourceBook !== "真题分类概率") return "";
  const raw = `${question.sourceQuestionNo || ""} ${question.stem || ""}`;
  const match = raw.match(/例\s*[：:]?\s*(\d{4})/);
  return match ? `${question.sourceBook}::${match[1]}` : "";
}

function mergeAnswer(question, match) {
  const answer = answerFromMatch(match) || "见解析";
  const concrete = isConcreteAnswer(match) && Boolean(answerFromMatch(match));
  const existingAliases = Array.isArray(question.aliases) ? question.aliases : [];
  const matchedAliases = Array.isArray(match.aliases) ? match.aliases : [];
  const aliases = [...new Set([...existingAliases, ...matchedAliases].map((item) => String(item).trim()).filter(Boolean))];
  const sourcePdf = String(match.sourcePdf || "");
  const page = Number(match.answerPage || match.examplePage || 0) || null;
  const explanation = String(match.explanation || "").trim();
  let nextExplanation = question.explanation || "";
  if (explanation) nextExplanation = explanation;
  else if (shouldReplaceExplanation(nextExplanation)) {
    nextExplanation = `答案已从 ${sourcePdf} 第 ${page || "?"} 页按例题编号匹配；该题解析正文未从 PDF 文字层单独抽取。`;
  }

  return {
    ...question,
    answer,
    aliases,
    answerStatus: concrete ? "matched_from_answer_pdf" : "pending_review",
    answerMatchStatus: concrete ? "matched_from_answer_pdf" : "matched_from_answer_pdf_inferred",
    answerMatchKey: String(match.matchKey || ""),
    answerSourcePdf: sourcePdf,
    answerSourcePage: page,
    answerSourceExampleNo: Number(match.sourceExampleNo) || null,
    answerExamplePage: Number(match.examplePage) || null,
    answerSourceText: String(match.answerSourceText || ""),
    answerExtractionStatus: String(match.answerExtractionStatus || "unknown"),
    answerHasMarker: Boolean(match.hasAnswerMarker),
    answerHasExplanationMarker: Boolean(match.hasExplanationMarker),
    answerFormat: "text",
    explanation: nextExplanation,
    explanationFormat: "text",
    answerReviewStatus: concrete ? "matched_from_answer_pdf" : "matched_from_answer_pdf_pending_validation"
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.answersPath)) throw new Error(`答案 staging 文件不存在：${args.answersPath}`);
  if (!fs.existsSync(args.sourcePath)) throw new Error(`题库源文件不存在：${args.sourcePath}`);

  const answerRaw = readAnswers(args.answersPath);
  const canonicalRaw = readQuestionSource(args.sourcePath);
  const canonical = normalizedQuestionList(canonicalRaw);
  const byQuestionId = new Map();
  const duplicateMatchIds = [];
  answerRaw.matches.forEach((match) => {
    if (!match.questionId) return;
    if (byQuestionId.has(match.questionId)) duplicateMatchIds.push(match.questionId);
    byQuestionId.set(match.questionId, match);
  });
  if (duplicateMatchIds.length) throw new Error(`答案匹配结果存在重复 questionId：${duplicateMatchIds.slice(0, 20).join(", ")}`);

  const byMatchKey = new Map();
  answerRaw.matches.forEach((match) => {
    if (!match.matchKey) return;
    if (byMatchKey.has(match.matchKey)) throw new Error(`答案匹配结果存在重复 matchKey：${match.matchKey}`);
    byMatchKey.set(match.matchKey, match);
  });
  const matchForQuestion = (question) => (
    byQuestionId.get(question.id) || byMatchKey.get(legacyAnswerMatchKey(question)) || null
  );
  const matchedEntries = canonical
    .map((question) => ({ question, match: matchForQuestion(question) }))
    .filter((entry) => entry.match);
  const matchedQuestions = matchedEntries.map((entry) => entry.question);
  const directMatchedQuestionIds = new Set(canonical.filter((question) => byQuestionId.has(question.id)).map((question) => question.id));
  const legacyAliasMatchedQuestions = matchedQuestions.filter((question) => !directMatchedQuestionIds.has(question.id));
  const missingQuestionIds = canonical
    .filter((question) => question.sourceType === "past_exam" && question.allowUnreviewedPractice === true && !matchForQuestion(question))
    .map((question) => question.id);
  const missingAnswerQuestions = canonical.filter((question) => !String(question.answer || "").trim() && !matchForQuestion(question));
  const unmatchedPastExamQuestions = canonical.filter((question) => question.sourceType === "past_exam" && !matchForQuestion(question));
  const updated = canonical.map((question) => {
    const match = matchForQuestion(question);
    return match ? mergeAnswer(question, match) : question;
  });
  const normalized = normalizedQuestionList(updated);
  const concrete = matchedEntries.filter((entry) => isConcreteAnswer(entry.match));
  const inferred = matchedEntries.filter((entry) => !isConcreteAnswer(entry.match));
  const explanationFromPdf = matchedEntries.filter((entry) => String(entry.match.explanation || "").trim());
  const choiceWithoutKey = normalized.filter((question) => (
    matchForQuestion(question)
    && question.type === "choice"
    && !question.answerSpec.optionKey
  ));
  const report = {
    schemaVersion: 1,
    generatedBy: "tools/import_past_exam_answers.js",
    answersSource: path.relative(ROOT, args.answersPath).replaceAll(path.sep, "/"),
    questionSource: path.relative(ROOT, args.sourcePath).replaceAll(path.sep, "/"),
    canonicalQuestionCount: canonical.length,
    answerMatchRecordCount: answerRaw.matches.length,
    matchedQuestionCount: matchedQuestions.length,
    directQuestionIdMatchCount: directMatchedQuestionIds.size,
    legacyAliasMatchCount: legacyAliasMatchedQuestions.length,
    concreteAnswerCount: concrete.length,
    inferredOrPendingAnswerCount: inferred.length,
    explanationFromPdfCount: explanationFromPdf.length,
    choiceWithoutNormalizedKeyCount: choiceWithoutKey.length,
    missingUnreviewedPastExamQuestionCount: missingQuestionIds.length,
    missingUnreviewedPastExamQuestionIds: missingQuestionIds,
    missingAnswerCountBeforeApply: missingAnswerQuestions.length,
    missingAnswerQuestionIdsBeforeApply: missingAnswerQuestions.map((question) => question.id),
    unmatchedPastExamQuestionCount: unmatchedPastExamQuestions.length,
    unmatchedPastExamQuestionIds: unmatchedPastExamQuestions.map((question) => question.id),
    sourceOnlyAnswerRecordCount: answerRaw.matches.filter((match) => !match.questionId).length,
    extractionStatuses: answerRaw.matches.reduce((counts, match) => {
      const status = String(match.answerExtractionStatus || "unknown");
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {})
  };
  writeJson(args.reportPath, report);

  console.log(`题库总数：${canonical.length}`);
  console.log(`答案记录：${answerRaw.matches.length}；匹配题目：${matchedQuestions.length}（questionId ${directMatchedQuestionIds.size}，历史例题号回连 ${legacyAliasMatchedQuestions.length}）`);
  console.log(`明确答案：${concrete.length}；见解析/待复核：${inferred.length}`);
  console.log(`从 PDF 提取解析正文：${explanationFromPdf.length}`);
  console.log(`选择题未归一化选项键：${choiceWithoutKey.length}`);
  console.log(`未匹配的开放试刷真题：${missingQuestionIds.length}`);
  console.log(`匹配报告：${args.reportPath}`);

  if (!args.apply) {
    console.log("预览模式：未写入 SQLite 或 canonical source。使用 --apply 执行导入。");
    return;
  }

  const repository = createQuestionRepository({
    dbPath: args.dbPath,
    sourcePath: args.sourcePath,
    initializeIfEmpty: true
  });
  repository.upsert(normalized, {
    source: args.answersPath,
    sourceHashValue: sourceHash(args.answersPath)
  });
  const allQuestions = repository.all();
  repository.close();
  writeJson(args.sourcePath, allQuestions);
  console.log(`已写入 SQLite：${args.dbPath}`);
  console.log(`已同步 canonical source：${args.sourcePath}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error(usage());
  process.exit(1);
}
