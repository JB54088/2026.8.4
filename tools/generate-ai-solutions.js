const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const inputFile = process.env.QUESTION_CATALOG_INPUT || path.join(DATA_DIR, "question-catalog.json");
const outputFile = process.env.QUESTION_CATALOG_OUTPUT || inputFile;
const checkpointFile = process.env.QUESTION_SOLUTION_CHECKPOINT || path.join(DATA_DIR, "question-solutions.checkpoint.json");
const model = process.env.OPENAI_SOLUTION_MODEL || "gpt-4.1-mini";
const concurrency = Math.max(1, Math.min(20, Number(process.env.OPENAI_SOLUTION_CONCURRENCY || 6)));
const limit = Number(process.env.OPENAI_SOLUTION_LIMIT || 0);
const saveEvery = Math.max(1, Number(process.env.OPENAI_SOLUTION_SAVE_EVERY || 25));

function loadEnvFile() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const splitAt = trimmed.indexOf("=");
    if (splitAt <= 0) continue;
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();
const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
if (!apiKey || apiKey.includes("鎶婁綘")) throw new Error("未配置 OPENAI_API_KEY，批量解析不会启动");
if (!fs.existsSync(inputFile)) throw new Error(`题目目录不存在：${inputFile}，请先运行 npm run catalog:export`);

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const source = readJson(inputFile, {});
const questions = Array.isArray(source.questions) ? source.questions : [];
if (!questions.length) throw new Error("题目目录为空");
const checkpoint = readJson(checkpointFile, { solutions: {} });
const existingSolutions = checkpoint && checkpoint.solutions && typeof checkpoint.solutions === "object" ? checkpoint.solutions : {};
const resultQuestions = questions.map((question) => {
  const saved = existingSolutions[question.id];
  return saved?.detailedSolution ? { ...question, ...saved } : question;
});

function questionText(question) {
  return [
    `题目：${question.stem || ""}`,
    `题型：${question.type || question.questionType || ""}`,
    `选项：${JSON.stringify(question.options || [])}`,
    `数学类型：${Array.isArray(question.subjects) ? question.subjects.join("、") : ""}`,
    `章节：${question.chapterName || question.chapter || ""}`,
    `知识点：${question.point || question.knowledgePoint || ""}`,
    `难度：${question.difficulty || question.level || ""}`,
    `标准答案：${question.answer || ""}`,
    `已有简要说明（只作校验参考，不要照抄）：${question.explanation || "暂无"}`
  ].join("\n");
}

function solutionPrompt(question) {
  return `你是考研数学教研老师。请独立核算下面这道题，生成可以在学生答错后直接展示的严谨解析。

要求：
1. 先检查题干、选项和标准答案是否一致；如果标准答案或题目存在疑点，必须在 validation 中标记，不要编造推导。
2. 选择题要明确指出正确选项字母及选项内容；填空题、计算题和主观题要给出完整推导。
3. 每一步都写出使用的公式、适用条件和关键变形，不能只给最终答案。
4. 解析内容使用中文和可直接渲染的 LaTeX，JSON 字符串内不要使用 Markdown 代码围栏。
5. 只返回 JSON，不要返回其他文字。

${questionText(question)}

JSON 格式：
{
  "validation": {"isValid": true, "issue": ""},
  "examFocus": "本题考查的核心能力",
  "preAnalysis": "读题、识别条件和选择方法",
  "formulas": ["公式及适用条件"],
  "conditions": "定义域、连续性、可导性或其他必要条件",
  "steps": [{"order":1,"title":"第1步：...","content":"..."}],
  "finalAnswer": "最终答案；选择题同时写明选项字母",
  "commonPitfall": "最容易出现的错误及避免方式",
  "methodSummary": "一段完整的解题思路",
  "sourceExplanation": "对原题简要说明的校验或修正"
}`;
}

function parseJson(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function normalizeSolution(parsed) {
  const steps = Array.isArray(parsed?.steps) ? parsed.steps
    .map((step, index) => ({ order: Number(step.order || index + 1), title: String(step.title || `第${index + 1}步`), content: String(step.content || "").trim() }))
    .filter((step) => step.content) : [];
  const solution = {
    version: 2,
    status: parsed?.validation?.isValid === false ? "needs_teacher_review" : "ready",
    generatedBy: "openai",
    generatedAt: new Date().toISOString(),
    model,
    validation: { isValid: parsed?.validation?.isValid !== false, issue: String(parsed?.validation?.issue || "") },
    examFocus: String(parsed?.examFocus || "").trim(),
    preAnalysis: String(parsed?.preAnalysis || "").trim(),
    formulas: Array.isArray(parsed?.formulas) ? parsed.formulas.map(String).filter(Boolean) : [],
    conditions: String(parsed?.conditions || "").trim(),
    steps,
    finalAnswer: String(parsed?.finalAnswer || "").trim(),
    commonPitfall: String(parsed?.commonPitfall || "").trim(),
    methodSummary: String(parsed?.methodSummary || "").trim(),
    sourceExplanation: String(parsed?.sourceExplanation || "").trim()
  };
  const missing = [solution.examFocus, solution.preAnalysis, solution.conditions, solution.finalAnswer, solution.commonPitfall, solution.methodSummary].some((value) => !value) || solution.steps.length < 2;
  if (missing) throw new Error("模型返回的解析字段不完整");
  return solution;
}

async function requestSolution(question) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: [{ role: "user", content: [{ type: "input_text", text: solutionPrompt(question) }] }], temperature: 0.1 })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
      const rawText = body.output_text || (body.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").join("");
      return normalizeSolution(parseJson(rawText));
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt * attempt));
    }
  }
  throw new Error("解析请求失败");
}

function writeCheckpoint(solutions, failures) {
  fs.writeFileSync(checkpointFile, JSON.stringify({ schemaVersion: 2, model, updatedAt: new Date().toISOString(), solutions, failures }, null, 2), "utf8");
}

async function main() {
  const candidates = resultQuestions.filter((question) => question.detailedSolution?.generatedBy !== "openai");
  const target = limit > 0 ? candidates.slice(0, limit) : candidates;
  const solutions = { ...existingSolutions };
  const failures = { ...(checkpoint.failures || {}) };
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= target.length) return;
      const question = target[index];
      try {
        const detailedSolution = await requestSolution(question);
        solutions[question.id] = { id: question.id, detailedSolution, solutionVersion: 2, solutionStatus: detailedSolution.status };
        delete failures[question.id];
      } catch (error) {
        failures[question.id] = { message: error.message, updatedAt: new Date().toISOString() };
      }
      completed += 1;
      if (completed % saveEvery === 0 || completed === target.length) writeCheckpoint(solutions, failures);
      if (completed % 10 === 0 || completed === target.length) console.log(JSON.stringify({ completed, total: target.length, failed: Object.keys(failures).length }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, target.length)) }, worker));
  const merged = resultQuestions.map((question) => solutions[question.id]?.detailedSolution
    ? { ...question, ...solutions[question.id], detailedSolution: solutions[question.id].detailedSolution }
    : question);
  const catalog = { ...source, schemaVersion: 2, generatedAt: new Date().toISOString(), solutionModel: model, questionCount: merged.length, questions: merged };
  fs.writeFileSync(outputFile, JSON.stringify(catalog, null, 2), "utf8");
  console.log(JSON.stringify({ outputFile, questionCount: merged.length, generated: Object.keys(solutions).length, failed: Object.keys(failures).length, bytes: fs.statSync(outputFile).size }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
