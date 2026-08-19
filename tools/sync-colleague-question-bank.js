const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const sourceFile = path.join(ROOT, "data", "question-bank-source.json");
const existingCatalogFile = path.join(ROOT, "public", "imported-question-catalog.json");
const serverQuestionsFile = path.join(ROOT, "data", "past-exam-questions.json");
const publicCatalogFile = path.join(ROOT, "public", "imported-question-catalog.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sourceExplanation(question) {
  return String(
    question.explanation
      || question.solution?.explanation
      || question.content?.explanation?.value
      || ""
  ).trim();
}

function answerValue(question) {
  return question.answer ?? question.answerSpec?.value ?? "";
}

function buildImportedSolution(question) {
  const explanation = sourceExplanation(question);
  const point = question.knowledgePointName || question.point || question.chapterName || question.chapterId || "本题考点";
  const answer = answerValue(question);
  return {
    version: 1,
    status: answer && question.answerStatus !== "pending_review" ? "ready" : "pending_teacher_review",
    generatedBy: "colleague-imported-source",
    examFocus: `本题考查${point}，需要根据题干条件选择方法并完成规范推导。`,
    preAnalysis: "先圈出已知条件、所求量和限制条件，再确认公式的适用范围。",
    formulas: question.formula ? [question.formula] : [],
    conditions: "使用公式前检查定义域、连续性、可导性、独立性、矩阵维数或收敛条件。",
    steps: [
      { order: 1, title: "第1步：提取条件", content: `明确题目给出的条件和所求量，当前题目归入${point}。` },
      { order: 2, title: "第2步：选择方法", content: "根据题型选择定义、公式或定理，并写明使用条件。" },
      { order: 3, title: "第3步：逐步推导", content: explanation || "该题解析待教研校对，请保留完整中间步骤。" },
      { order: 4, title: "第4步：检查结论", content: `将结果代回题目检查符号、定义域和题目问法，最终答案为：${answer || "待教研校对"}。` }
    ],
    finalAnswer: answer || "待教研校对",
    commonPitfall: question.reason || "不要跳过关键中间步骤，完成后检查条件和结论。",
    methodSummary: explanation || "先识别题型，再按适用条件逐步完成推导。",
    sourceExplanation: explanation
  };
}

function normalizeQuestion(question, previous) {
  const explanation = sourceExplanation(question);
  return {
    ...question,
    sourceType: "past_exam",
    stem: question.stem || question.content?.stem?.value || "",
    type: question.type || question.questionType || "solution",
    questionType: question.questionType || question.type || "solution",
    options: Array.isArray(question.options)
      ? question.options
      : (question.choiceOptions || []).map((option) => option.text || option.raw || option.key),
    answer: answerValue(question),
    aliases: question.aliases || question.answerSpec?.aliases || [],
    explanation,
    chapterName: question.chapterName || question.sectionName || question.chapterId || "未分类",
    subjects: Array.isArray(question.subjects) ? question.subjects : [],
    detailedSolution: previous?.detailedSolution || question.detailedSolution || question.solution?.detailed || buildImportedSolution(question),
    solutionVersion: 1,
    solutionStatus: previous?.solutionStatus || (question.answer && question.answerStatus !== "pending_review" ? "ready" : "pending_teacher_review")
  };
}

if (!fs.existsSync(sourceFile)) throw new Error(`题库源文件不存在：${sourceFile}`);
const source = readJson(sourceFile);
if (!Array.isArray(source)) throw new Error("题库源文件必须是数组");

const existingCatalog = fs.existsSync(existingCatalogFile) ? readJson(existingCatalogFile) : { questions: [] };
const previousById = new Map((existingCatalog.questions || []).map((question) => [question.id, question]));
const imported = source
  .filter((question) => question && question.sourceType === "past_exam")
  .map((question) => normalizeQuestion(question, previousById.get(question.id)));

const ids = new Set();
for (const question of imported) {
  if (!question.id) throw new Error("导入题目缺少 id");
  if (!question.stem) throw new Error(`导入题目缺少题干：${question.id}`);
  if (ids.has(question.id)) throw new Error(`导入题目 id 重复：${question.id}`);
  ids.add(question.id);
}

writeJson(serverQuestionsFile, imported);
writeJson(publicCatalogFile, {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: "colleague-imported-question-bank",
  questionCount: imported.length,
  questions: imported
});

console.log(JSON.stringify({
  sourceCount: source.length,
  importedCount: imported.length,
  serverQuestionsFile,
  publicCatalogFile,
  bytes: fs.statSync(publicCatalogFile).size
}, null, 2));
