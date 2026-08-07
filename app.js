const APP_CONFIG = window.__APP_CONFIG__ || {};
const API_BASE_URL = String(APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
const APP_BASE_PATH = String(window.__APP_BASE_PATH__ || "").replace(/\/$/, "");
const FIXED_PRACTICE_COUNT = 20;
const routeToView = {
  "/": "home",
  "/login": "home",
  "/dashboard": "home",
  "/math-type": "mathTypeChooser",
  "/chapters": "chapters",
  "/practice": "practice",
  "/diagnosis": "diagnosis",
  "/review": "knowledgeReview",
  "/similar-training": "similarTraining",
  "/original-retry": "originalRetry",
  "/paper-report": "paperReport",
  "/question-review": "questionReview",
  "/report": "improvement",
  "/ability-profile": "profile",
  "/collection": "collection",
  "/past-exams": "pastExams",
  "/training-plan": "trainingPlan",
  "/retest": "retest",
  "/mastery-verify": "masteryVerify"
};
const viewToRoute = Object.fromEntries(Object.entries(routeToView).map(([path, view]) => [view, path]));
function currentRoutePath() {
  if (APP_BASE_PATH && location.pathname.startsWith(APP_BASE_PATH)) {
    return location.pathname.slice(APP_BASE_PATH.length) || "/";
  }
  return location.pathname;
}
const demoSessionId = localStorage.getItem("demoSessionId") || crypto.randomUUID();
localStorage.setItem("demoSessionId", demoSessionId);

const api = (url, options = {}) => fetch(`${API_BASE_URL}${url}`, {
  ...options,
  headers: { "content-type": "application/json", ...(options.headers || {}) }
}).then(async (res) => {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}).catch((error) => {
  if (error instanceof TypeError) throw new Error("服务暂时不可用，请稍后重试。");
  throw error;
});

const trainingModes = {
  foundation: {
    name: "基础训练",
    stage: "基础阶段",
    count: FIXED_PRACTICE_COUNT,
    difficulty: "mode",
    sourceType: "all",
    description: "按章节补概念、公式、基本计算和常见入口。",
    difficultyLabel: "1-2星 基础题组"
  },
  reinforce: {
    name: "强化训练",
    stage: "强化阶段",
    count: 20,
    difficulty: "mode",
    sourceType: "all",
    description: "集中处理易错、综合、方法选择和计算稳定性。",
    difficultyLabel: "3-4星 强化题组"
  },
  mock: {
    name: "模拟考试",
    stage: "模拟考试",
    count: 20,
    difficulty: "mode",
    sourceType: "all",
    description: "跨章节混合出题，按考试节奏提交并生成薄弱诊断。",
    difficultyLabel: "1-5星 混合题组"
  }
};

const state = {
  student: JSON.parse(localStorage.getItem("student") || "null"),
  view: routeToView[currentRoutePath()] || localStorage.getItem("view") || "home",
  selectedMathType: localStorage.getItem("selectedMathType") || JSON.parse(localStorage.getItem("student") || "null")?.mathType || "数学一",
  trainingMode: localStorage.getItem("trainingMode") || "reinforce",
  paperExam: null,
  chapters: [],
  pastExamSources: null,
  questions: [],
  collectionItems: [],
  chapterId: "integral",
  questionCount: FIXED_PRACTICE_COUNT,
  difficulty: localStorage.getItem("difficulty") || "all",
  sourceType: localStorage.getItem("sourceType") || "all",
  current: 0,
  responses: {},
  lastResults: null,
  lastSubmission: JSON.parse(localStorage.getItem("lastSubmission") || "null"),
  reviewQuestionIndex: Number(localStorage.getItem("reviewQuestionIndex") || 0),
  scratchTool: localStorage.getItem("scratchTool") || "pen",
  scratchColor: localStorage.getItem("scratchColor") || "#172033",
  scratchWidth: Number(localStorage.getItem("scratchWidth") || 3),
  strokeCount: 0,
  strokes: [],
  redoStrokes: [],
  trainingCanvasQuestion: null,
  startedAt: Date.now()
};

const navs = [
  ["home", "课程首页"],
  ["chapters", "章节学习"],
  ["practice", "刷题"],
  ["collection", "错题本"],
  ["report", "学习报告"],
  ["pastExams", "真题库"]
];
const sourceOptions = [
  ["all", "全部题源"],
  ["past_exam", "历年考研数学真题"],
  ["inhouse_original", "自研原创题"],
  ["teacher_original", "签约教师原创题"],
  ["ai_teacher_reviewed", "AI生成后教师审核变式题"]
];
const difficultyOptions = [
  ["mode", "按当前题组"],
  ["all", "全部难度"],
  ["1", "1星 基础"],
  ["2", "2星 计算"],
  ["3", "3星 易错"],
  ["4", "4星 综合"],
  ["5", "5星 拓展"]
];

const $ = (selector) => document.querySelector(selector);

function gradingStatusOf(record = {}) {
  if (record.gradingResult?.status) return record.gradingResult.status;
  if (record.correct === true) return "CORRECT";
  if (record.correct === false) return "INCORRECT";
  if (["pending_recognition", "recognition_error"].includes(record.gradingStatus)) return record.gradingStatus === "recognition_error" ? "RECOGNITION_FAILED" : "RECOGNITION_FAILED";
  return "EMPTY";
}

function gradingCorrectOf(record = {}) {
  return gradingStatusOf(record) === "CORRECT";
}

function gradingNeedsDiagnosisOf(record = {}) {
  return Boolean(record.gradingResult?.diagnosisTriggered) || ["INCORRECT", "PARTIAL"].includes(gradingStatusOf(record));
}

function questionTypeOf(question = {}, record = {}) {
  return record.gradingResult?.questionType || window.GradingEngine?.canonicalQuestionType?.(question) || question.questionType || question.type || "subjective";
}

function mode() {
  return trainingModes[state.trainingMode] || trainingModes.reinforce;
}

function setView(view) {
  state.view = view;
  localStorage.setItem("view", view);
  const nextPath = `${APP_BASE_PATH}${viewToRoute[view] || "/"}`;
  if (location.pathname !== nextPath) history.pushState({ view }, "", nextPath);
  render();
}

function selectMode(key) {
  state.trainingMode = key;
  localStorage.setItem("trainingMode", key);
  const picked = mode();
  state.questionCount = FIXED_PRACTICE_COUNT;
  state.difficulty = picked.difficulty;
  state.sourceType = picked.sourceType;
  localStorage.setItem("questionCount", String(state.questionCount));
  localStorage.setItem("difficulty", state.difficulty);
  localStorage.setItem("sourceType", state.sourceType);
  if (state.student) {
    state.student.stage = picked.stage;
    localStorage.setItem("student", JSON.stringify(state.student));
  }
}

function saveStudent(student) {
  state.student = student;
  state.selectedMathType = student?.mathType || state.selectedMathType;
  localStorage.setItem("student", JSON.stringify(student));
  localStorage.setItem("selectedMathType", state.selectedMathType);
}

function chapterGroup(chapter) {
  if (chapter.id === "linear" || /线性代数/.test(chapter.name || "")) return "线性代数";
  if (chapter.id === "prob" || /概率/.test(chapter.name || "")) return "概率论与数理统计";
  return "高等数学";
}

function chapterQuestionCount(chapter) {
  return Number(chapter?.countsByMathType?.[state.student?.mathType] ?? chapter?.count ?? 0);
}

function chapterProgress(progress, chapterId) {
  const attempts = Array.isArray(progress?.attempts)
    ? progress.attempts.filter((item) => item.studentId === state.student?.id && item.chapterId === chapterId)
    : [];
  const reportItem = progress?.report?.byChapter?.[chapterId] || progress?.report?.byChapter?.[state.chapters.find((item) => item.id === chapterId)?.name];
  const completed = Number(reportItem?.total ?? attempts.length);
  const correct = Number(reportItem?.correct ?? attempts.filter((item) => gradingCorrectOf(item)).length);
  return { completed, accuracy: completed ? Math.round(correct / completed * 100) : 0 };
}

async function loadProgress() {
  if (!state.student) return { attempts: [], report: {} };
  try {
    return await api(`/api/report?studentId=${encodeURIComponent(state.student.id)}`);
  } catch (error) {
    return { attempts: [], report: {} };
  }
}

async function persistMathType(mathType) {
  state.selectedMathType = mathType;
  localStorage.setItem("selectedMathType", mathType);
  if (!state.student) {
    renderLogin();
    return;
  }
  try {
    const payload = {
      demo: Boolean(state.student.isDemo),
      name: state.student.name,
      inviteCode: state.student.isDemo ? "demo" : state.student.inviteCode,
      password: state.student.isDemo ? "demo123" : "",
      sessionId: demoSessionId,
      mathType,
      targetScore: state.student.targetScore,
      stage: state.student.stage || mode().stage,
      dailyMinutes: state.student.dailyMinutes || 60
    };
    const res = await api("/api/login", { method: "POST", body: JSON.stringify(payload) });
    saveStudent(res.student);
    state.chapterId = "integral";
    state.questions = [];
    state.current = 0;
    state.responses = {};
    state.view = "home";
    localStorage.setItem("view", "home");
    history.replaceState({ view: "home" }, "", `${APP_BASE_PATH}/dashboard`);
    render();
  } catch (error) {
    alert(error.message || "数学类型保存失败，请稍后重试。");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mathExpressionToLatex(value) {
  let expression = String(value || "")
    .trim()
    .replace(/[−–]/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/×/g, "\\cdot ")
    .replace(/÷/g, "\\div ")
    .replace(/∞/g, "\\infty")
    .replace(/→/g, "\\to")
    .replace(/√\s*\(([^()]*)\)/g, "\\sqrt{$1}")
    .replace(/√\s*([A-Za-z0-9]+)/g, "\\sqrt{$1}")
    .replace(/\b(ln|sin|cos|tan|cot|exp)\b/gi, "\\$1")
    .replace(/([A-Za-z])\^\(([^()]*)\)/g, "$1^{$2}")
    .replace(/([A-Za-z0-9])\^([A-Za-z0-9]+)/g, "$1^{$2}")
    .replace(/([A-Za-z])_([0-9]+)/g, "$1_{$2}");
  const groupedFraction = expression.match(/^\((.*)\)\s*\/\s*([A-Za-z0-9{}^()+-]+)$/);
  if (groupedFraction) return `\\frac{${mathExpressionToLatex(groupedFraction[1])}}{${mathExpressionToLatex(groupedFraction[2])}}`;
  const simpleFraction = expression.match(/^([^\s]+)\s*\/\s*([^\s]+)$/);
  if (simpleFraction) return `\\frac{${simpleFraction[1]}}{${simpleFraction[2]}}`;
  return expression;
}

function renderMathText(value, options = {}) {
  const source = String(value || "");
  if (!source.trim()) return "";
  const placeholders = [];
  const math = (latex, display = false) => {
    const index = placeholders.push(display ? `\\[${latex}\\]` : `\\(${latex}\\)`) - 1;
    return `\uE000${index}\uE001`;
  };
  let text = source
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => math(latex, true))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => math(latex, false))
    .replace(/lim\s*\(\s*([a-zA-Z])\s*(?:→|->|to)\s*([^\s)]+)\s*\)\s*\[([^\]]+)\]/gi, (_, variable, target, expression) => math(`\\lim_{${variable}\\to ${mathExpressionToLatex(target)}}${mathExpressionToLatex(expression)}`, true))
    .replace(/lim\s*\(\s*([a-zA-Z])\s*(?:→|->|to)\s*([^\s)]+)\s*\)\s*\(([^)]+)\)/gi, (_, variable, target, expression) => math(`\\lim_{${variable}\\to ${mathExpressionToLatex(target)}}${mathExpressionToLatex(expression)}`, true))
    .replace(/∫\s*(?:\(([^,]+),([^)]+)\)\s*)?([^。；;，,\n]+?\s*dx)/g, (_, lower, upper, expression) => math(`\\int${lower && upper ? `_{${mathExpressionToLatex(lower)}}^{${mathExpressionToLatex(upper)}}` : ""} ${mathExpressionToLatex(expression)}`, true))
    .replace(/([A-Za-z][A-Za-z0-9]*(?:\^\([^)]*\)|\^[A-Za-z0-9]+)(?:[A-Za-z0-9^()\-+*/=.]*)?)/g, (token) => math(mathExpressionToLatex(token), false));
  const escaped = escapeHtml(text)
    .replace(/\uE000(\d+)\uE001/g, (_, index) => placeholders[Number(index)] || "");
  return options.display ? `<div class="math-text math-display">${escaped}</div>` : escaped;
}

function renderMathBlock(value) {
  const latex = mathExpressionToLatex(value);
  return latex ? `<div class="math-text math-display">\\[${latex}\\]</div>` : "";
}

function fallbackDetailedSolution(question = {}) {
  const stem = String(question.stem || question.title || "");
  const point = question.point || question.subKnowledgePoint || "本题对应知识点";
  const chapterName = question.chapterName || question.chapter || "本章节";
  const limitExpansion = stem.match(/e\^\(?([+-]?\d*)x\)?\s*[−-]\s*1\s*[−-]\s*\1x/i);
  if (limitExpansion && /x(?:\^2|²)/i.test(stem)) {
    const rawCoefficient = limitExpansion[1] || "1";
    const coefficient = rawCoefficient === "+" ? "1" : rawCoefficient;
    return {
      examFocus: "指数函数的二阶展开与等价无穷小",
      preAnalysis: "分子中的一次项会与题目中的线性项相消，因此不能只保留一阶等价无穷小，必须展开到 x² 项。",
      formulas: [`\\[e^{${coefficient}x}=1+${coefficient}x+\\frac{(${coefficient}x)^2}{2!}+o(x^2),\\quad x\\to0\\]`],
      steps: [
        { title: "第1步：确定展开阶数", content: "分母是 x²，且分子的一次项会被减去，所以要保留指数函数的二阶项。" },
        { title: "第2步：展开指数函数", content: `\\[e^{${coefficient}x}=1+${coefficient}x+\\frac{${coefficient}^2}{2}x^2+o(x^2)\\]` },
        { title: "第3步：处理分子", content: `\\[e^{${coefficient}x}-1-${coefficient}x=\\frac{${coefficient}^2}{2}x^2+o(x^2)\\]` },
        { title: "第4步：代回原式", content: `\\[\\frac{e^{${coefficient}x}-1-${coefficient}x}{x^2}=\\frac{${coefficient}^2}{2}+o(1)\\]` }
      ],
      finalAnswer: question.answer || `\\[\\frac{${coefficient}^2}{2}\\]`,
      commonPitfall: `不能直接使用 e^{${coefficient}x}-1\\sim ${coefficient}x，因为后面还要减去 ${coefficient}x；这样会把真正决定极限的二阶项一并丢掉。`
    };
  }
  if (/极限|lim/i.test(stem)) {
    return {
      examFocus: `${chapterName}中的${point}`,
      preAnalysis: "先判断极限类型和分子、分母的最低非零阶，再选择等价无穷小、泰勒展开、洛必达法则或恒等变形。",
      formulas: question.formula ? [question.formula] : ["先确认等价无穷小的适用条件，再进行替换。"],
      steps: [
        { title: "第1步：判断未定式", content: "将趋近值代入，确认是否为 0/0、∞/∞ 或其他未定式。" },
        { title: "第2步：选择方法", content: "优先保留分子、分母的最低非零阶，避免在相减结构中误删同阶项。" },
        { title: "第3步：化简并求值", content: question.explanation || "逐步约去公共因子，最后再代入趋近值。" }
      ],
      finalAnswer: question.answer || "以最后一步化简结果为准。",
      commonPitfall: question.reason || "相减后低阶项可能消失，不能在未检查相消关系前直接套用一阶等价无穷小。"
    };
  }
  return {
    examFocus: `${chapterName}中的${point}`,
    preAnalysis: "先整理已知条件和所求量，明确使用的定义、公式及公式成立条件。",
    formulas: question.formula ? [question.formula] : ["先写出适用的定义或公式，再进行代入和变形。"],
    steps: [
      { title: "第1步：提取条件", content: "列出题目给出的量、关系式和限制条件，避免遗漏定义域或边界条件。" },
      { title: "第2步：建立方法", content: "根据题型选择对应的定义、公式或解题模型，并说明使用理由。" },
      { title: "第3步：完成计算", content: question.explanation || "按等式逐步计算，保留关键中间结果并检查符号。" }
    ],
    finalAnswer: question.answer || "以最后一步计算结果作答。",
    commonPitfall: question.reason || "不要跳过关键条件和中间步骤，完成后检查结果是否符合题意。"
  };
}

function renderSolutionContent(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => /^\\\[[\s\S]*\\\]$/.test(line) ? renderMathText(line) : `<p>${renderMathText(line)}</p>`)
    .join("");
}

function renderStemHtml(value) {
  return String(value || "").replace(/<span\s+class=["']math["']>([\s\S]*?)<\/span>/gi, (_, formula) => `<span class="math">\\(${formula}\\)</span>`);
}

function typesetMath() {
  const root = $("#view");
  if (!root || !window.MathJax) return;
  const render = () => window.MathJax.typesetPromise?.([root]).catch(() => {});
  if (window.MathJax.startup?.promise) window.MathJax.startup.promise.then(render);
  else setTimeout(render, 80);
}

function renderDetailedExplanation(question = {}) {
  const existingSolution = question.detailedSolution;
  const hasDetailedSteps = existingSolution && (
    (Array.isArray(existingSolution.steps) && existingSolution.steps.length > 0)
    || (Array.isArray(existingSolution.formulas) && existingSolution.formulas.length > 0)
    || existingSolution.examFocus
    || existingSolution.preAnalysis
  );
  const solution = hasDetailedSteps ? existingSolution : fallbackDetailedSolution(question);
  const steps = Array.isArray(solution.steps) ? solution.steps : [];
  const formulas = Array.isArray(solution.formulas)
    ? solution.formulas
    : (question.formula ? [question.formula] : []);
  const sections = [
    ["题目考查", solution.examFocus || `${question.chapterName || "本章节"}中的${question.point || "核心知识点"}。`],
    ["题目理解", solution.preAnalysis || "先提取题干中的已知条件、限制条件和所求量，明确题目最终要求。"],
    ["公式与适用条件", formulas.length ? formulas.join("；") : "先写出定义、公式及其适用条件，再开始变形和计算。"],
    ["解题步骤", steps.length ? steps.map((step, index) => `${step.title || `步骤${step.order || index + 1}`}：${step.content || ""}`).join("\n") : (question.explanation || "逐行完成代入、变形和化简，不能跳过影响结论的关键等式。")],
    ["最终结论", solution.finalAnswer || question.answer || "请根据最后一步计算结果作答。"],
    ["易错提醒", solution.commonPitfall || question.reason || "检查公式条件、符号、定义域和最后一步是否回答了题目所问。"]
  ];
  return `<div class="solution-sections">${sections.map(([title, content]) => `<section class="solution-section"><h4>${title}</h4><div class="solution-content">${renderSolutionContent(content)}</div></section>`).join("")}</div>`;
}

function uiMessage(message, type = "info") {
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  host.appendChild(item);
  setTimeout(() => item.remove(), 2600);
}

window.alert = (message) => uiMessage(String(message || ""), "info");

function uiConfirm({ title = "确认操作", message = "", confirmText = "确定", cancelText = "取消" } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button class="ghost" data-modal-cancel>${escapeHtml(cancelText)}</button>
        <button class="primary" data-modal-ok>${escapeHtml(confirmText)}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const done = (value) => {
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector("[data-modal-cancel]").onclick = () => done(false);
    overlay.querySelector("[data-modal-ok]").onclick = () => done(true);
    overlay.onclick = (event) => {
      if (event.ta…19429 tokens truncated…r: res.record.recognizedAnswer, advice: res.record.advice, weakPoint: res.record.weakPoint } },
      trainingBatchId: batch.id,
      stage: "TARGETED_TRAINING"
    });
    state.trainingBatch = res.batch;
    if (res.warning) alert(res.warning);
    await renderSimilarTrainingV2();
  } catch (error) {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "提交本题";
    }
    alert(error.message || "本题提交失败，请稍后重试。");
  }
}

async function renderSimilarTrainingV2() {
  const requestedSourceQuestionId = state.trainingSourceQuestionId || localStorage.getItem("trainingSourceQuestionId") || "";
  let batch = hasCompleteTrainingBatch(state.trainingBatch)
    && (!requestedSourceQuestionId || state.trainingBatch.sourceWrongQuestionId === requestedSourceQuestionId)
    ? state.trainingBatch
    : null;
  if (!batch) {
    const data = await api(`/api/training-batches?studentId=${encodeURIComponent(state.student.id)}&trainingType=targeted`);
    const candidates = Array.isArray(data.batches) ? data.batches : [];
    batch = candidates.find((item) => requestedSourceQuestionId && item.sourceWrongQuestionId === requestedSourceQuestionId && hasCompleteTrainingBatch(item))
      || (!requestedSourceQuestionId && hasCompleteTrainingBatch(data.latest) ? data.latest : null);
  }
  if (!batch) {
    const submission = await ensureLatestSubmission();
    if (!submission) {
      shell("相似题训练", `<section class="panel"><h2>还没有可匹配的错题</h2><p>请先完成一份试卷并提交，系统会读取原题、答案、步骤和错误类型后生成训练题。</p><button class="primary" data-view="practice">进入刷题</button></section>`);
      return;
    }
    const created = await api("/api/training-batches", {
      method: "POST",
      body: JSON.stringify({ studentId: state.student.id, submissionId: submission.id, sourceWrongQuestionId: requestedSourceQuestionId, trainingType: "targeted" })
    });
    batch = created.batch;
    state.trainingSourceQuestionId = batch.sourceWrongQuestionId || requestedSourceQuestionId;
    localStorage.setItem("trainingSourceQuestionId", state.trainingSourceQuestionId);
    writeFlowState({ trainingBatchId: batch.id, trainingRecords: {}, trainingIndex: 0, stage: "TARGETED_TRAINING" });
  }
  state.trainingBatch = batch;
  const flow = readFlowState();
  if (flow.trainingBatchId !== batch.id) writeFlowState({ trainingBatchId: batch.id, trainingRecords: {}, trainingIndex: 0, trainingCompleted: false });
  const latestFlow = readFlowState();
  const records = latestFlow.trainingRecords || {};
  const total = Number(batch.total || batch.questionCount);
  const index = Math.max(0, Math.min(total - 1, Number(latestFlow.trainingIndex || 0)));
  const question = batch.questions[index];
  const record = records[question.id] || {};
  state.trainingCanvasQuestion = question.questionType === "subjective" ? question : null;
  loadTrainingScratch(question);
  const completed = batch.progress?.answered || Object.values(records).filter((item) => item.submitted).length;
  const progress = Math.round(completed / total * 100);
  const isLast = index === total - 1;
  const purpose = question.trainingPurpose || (index < 10 ? "当前最严重错误专项" : "综合巩固");
  shell("相似题训练", `<section class="panel similar-training-page">
    <div class="similar-training-head">
      <div><span class="badge">${escapeHtml(purpose)}</span><h2>第 ${index + 1} 题 / 共 ${total} 题</h2><p>${escapeHtml(question.typeLabel || (question.questionType === "choice" ? "选择题" : question.questionType === "fill" ? "填空题" : "解答题"))} · 难度 ${question.difficultyLevel} · ${escapeHtml(question.knowledgePoint || question.subKnowledgePoint || "")}</p></div>
      <div class="training-progress"><strong>${progress}%</strong><span>已提交 ${completed}/${total}</span><i><b style="width:${progress}%"></b></i></div>
    </div>
    <article class="training-question">
      <div class="training-question-number">题目 ${index + 1}</div>
      <div class="training-stem">${renderMathText(question.stem, { display: true })}</div>
      ${question.formula ? renderMathBlock(question.formula) : ""}
      ${renderTrainingAnswerControls(question, record)}
    </article>
    ${trainingFeedback(question, record)}
    <div class="training-navigation">
      <button class="ghost" id="trainingPrev" ${index === 0 ? "disabled" : ""}>上一题</button>
      <button class="ghost" id="trainingSave">暂存</button>
      <button class="primary" id="trainingSubmitQuestion" ${record.submitted ? "disabled" : ""}>${record.submitted ? "已提交本题" : "提交本题"}</button>
      <button class="ghost" id="trainingNext" ${isLast ? "disabled" : ""}>下一题</button>
      <button class="primary" id="trainingSubmitBatch">提交本轮训练</button>
    </div>
  </section>
  <section class="panel training-batch-actions">
    ${batch.trainingType === "targeted" ? `<button class="ghost" id="createComprehensive">生成20题综合训练</button>` : ""}
    <button class="ghost" id="goRetry" ${completed >= total ? "" : "disabled"}>进入复测与原题重做</button>
  </section>`);

  const saveCurrent = () => {
    const fields = {};
    if (question.questionType === "choice") fields.selectedOption = document.querySelector(".training-choice.active")?.dataset.trainingChoice || "";
    if (question.questionType === "fill") fields.answer = $("#trainingAnswer")?.value.trim() || "";
    saveTrainingDraft(question, { fields, keepEmpty: true });
  };
  document.querySelectorAll("[data-training-choice]").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("[data-training-choice]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      saveTrainingDraft(question, { fields: { selectedOption: button.dataset.trainingChoice, answer: button.dataset.trainingChoice }, keepEmpty: true });
    };
  });
  const nextIndex = (next) => { saveCurrent(); writeFlowState({ trainingIndex: next, trainingBatchId: batch.id }); renderSimilarTrainingV2(); };
  const prev = $("#trainingPrev");
  if (prev) prev.onclick = () => nextIndex(index - 1);
  const next = $("#trainingNext");
  if (next) next.onclick = () => nextIndex(index + 1);
  const save = $("#trainingSave");
  if (save) save.onclick = () => { saveCurrent(); alert("本题已暂存，切换题目或刷新页面后仍可恢复。"); };
  const submit = $("#trainingSubmitQuestion");
  if (submit) submit.onclick = () => submitTrainingQuestion(batch, question);
  const submitBatch = $("#trainingSubmitBatch");
  if (submitBatch) submitBatch.onclick = async () => {
    saveCurrent();
    const remaining = total - Object.values(readFlowState().trainingRecords || {}).filter((item) => item.submitted).length;
    const ok = await uiConfirm({ title: "提交本轮训练", message: remaining ? `还有 ${remaining} 道题未提交，是否仍然提交本轮训练？` : "本轮训练已全部提交，确认结束本轮训练？", confirmText: "确认提交", cancelText: "继续作答" });
    if (ok) { writeFlowState({ trainingCompleted: true, trainingBatchId: batch.id }); alert("本轮训练记录已保存，可进入复测验证掌握情况。"); }
  };
  const clear = $("#trainingClear");
  if (clear) clear.onclick = () => { state.redoStrokes = state.strokes.slice(); state.strokes = []; state.strokeCount = 0; saveTrainingDraft(question, { keepEmpty: true, skipImage: true }); redrawCanvas(); };
  const undo = $("#trainingUndo");
  if (undo) undo.onclick = () => { const stroke = state.strokes.pop(); if (stroke) state.redoStrokes.push(stroke); state.strokeCount = state.strokes.length; saveTrainingDraft(question, { keepEmpty: true, skipImage: true }); redrawCanvas(); };
  const redo = $("#trainingRedo");
  if (redo) redo.onclick = () => { const stroke = state.redoStrokes.pop(); if (stroke) state.strokes.push(stroke); state.strokeCount = state.strokes.length; saveTrainingDraft(question, { keepEmpty: true, skipImage: true }); redrawCanvas(); };
  if ($("#pad")) bindCanvas();
  const createComprehensive = $("#createComprehensive");
  if (createComprehensive) createComprehensive.onclick = async () => {
    const created = await api("/api/training-batches", { method: "POST", body: JSON.stringify({ studentId: state.student.id, submissionId: batch.submissionId, sourceWrongQuestionId: batch.sourceWrongQuestionId, trainingType: "comprehensive" }) });
    state.trainingBatch = created.batch;
    writeFlowState({ trainingBatchId: created.batch.id, trainingRecords: {}, trainingIndex: 0, stage: "COMPREHENSIVE_TRAINING" });
    renderSimilarTrainingV2();
  };
  const retry = $("#goRetry");
  if (retry) retry.onclick = async () => {
    const retest = await api("/api/retests", { method: "POST", body: JSON.stringify({ trainingBatchId: batch.id }) });
    writeFlowState({ retestId: retest.retest.id, retest });
    setView("originalRetry");
  };
}

async function renderOriginalRetry() {
  const loop = await loadLoop();
  const retry = loop.originalRetry;
  const stateFlow = readFlowState();
  shell("原题重做", `${loopProgress("retry")}
  <section class="panel">
    <h2>回到原题，看看你是否已经真正掌握</h2>
    <p class="mode-help">本页保留原题内容，不显示第一次答案、标准答案和完整解析。你可以查看第一次错因摘要，但不会直接看到正确做法。</p>
    <article class="exam-paper text-mode"><p>${escapeHtml(retry.stem)}</p></article>
  </section>
  <section class="panel">
    <h2>重新作答</h2>
    <div class="grid two">
      <label>最终答案<input id="retryAnswer" value="${escapeHtml(stateFlow.retryAnswer || "")}" placeholder="写出最终答案"></label>
      <label>用时（秒）<input id="retryDuration" type="number" value="${stateFlow.retryDuration || retry.durationSecond || 0}"></label>
    </div>
    <label>关键步骤<textarea id="retrySteps" placeholder="写出设、列式、化简和结论">${escapeHtml(stateFlow.retrySteps || "")}</textarea></label>
    <details class="mistake-peek"><summary>我第一次错在哪里？</summary><p>${escapeHtml(retry.firstMistakeSummary)}</p></details>
    <div class="row"><button class="primary" id="submitRetry">提交原题重做</button><button class="ghost" data-view="similarTraining">返回相似题训练</button></div>
  </section>`);
  const submit = $("#submitRetry");
  if (submit) submit.onclick = () => {
    const answer = $("#retryAnswer").value.trim();
    const steps = $("#retrySteps").value.trim();
    const duration = Number($("#retryDuration").value || 0);
    const corrected = retry.acceptedSignals.some((signal) => `${answer}\n${steps}`.includes(signal));
    writeFlowState({
      retryAnswer: answer,
      retrySteps: steps,
      retryDuration: duration,
      retrySubmitted: true,
      retryCorrected: corrected,
      sameErrorRepeated: !corrected,
      stage: corrected ? "MASTERED" : "NEEDS_REINFORCEMENT"
    });
    setView("masteryVerify");
  };
}

async function renderMasteryVerify() {
  const loop = await loadLoop();
  const stateFlow = readFlowState();
  const verify = loop.masteryVerification;
  const mastered = stateFlow.retryCorrected === true || verify.status === "MASTERED";
  shell("掌握验证", `${loopProgress("verify")}
  <section class="panel">
    <h2>${mastered ? "原关键错误已纠正" : "仍需回到补救路径"}</h2>
    <div class="metrics">
      <div class="metric"><span>判断结果</span><strong>${mastered ? "已掌握" : "仍需巩固"}</strong></div>
      <div class="metric"><span>是否重复原错</span><strong>${stateFlow.sameErrorRepeated ? "是" : "否"}</strong></div>
      <div class="metric"><span>提示使用</span><strong>${stateFlow.hintsUsed || 0}</strong></div>
      <div class="metric"><span>掌握变化</span><strong>${loop.improvement.beforeMastery}%→${loop.improvement.afterMastery}%</strong></div>
    </div>
  </section>
  <section class="panel">
    <h2>AI再次分析</h2>
    <div class="cards">
      <article class="card"><h3>第一次关键错误</h3><p>${escapeHtml(verify.firstError)}</p></article>
      <article class="card"><h3>第二次表现</h3><p>${escapeHtml(mastered ? verify.masteredFeedback : verify.reinforceFeedback)}</p></article>
      <article class="card"><h3>下一步</h3><p>${escapeHtml(mastered ? "进入错题攻克报告，更新掌握度。" : "返回知识点复习，换一种讲解方式，并降低相似题难度。")}</p></article>
    </div>
    <div class="row"><button class="primary" data-view="${mastered ? "improvement" : "knowledgeReview"}">${mastered ? "查看错题攻克报告" : "重新学习"}</button><button class="ghost" data-view="originalRetry">再次重做</button></div>
  </section>`);
}

async function renderTrainingPlan() {
  const loop = await loadLoop();
  const plan = loop.trainingPlan;
  const tasks = plan.items.map((item, index) => `<article class="training-task">
    <div><span class="badge">${escapeHtml(item.type)}</span><h3>${index + 1}. ${escapeHtml(item.title)}</h3></div>
    <p>${escapeHtml(item.purpose)}</p>
    <p><strong>对应薄弱点：</strong>${escapeHtml(item.knowledgePoint)} · ${escapeHtml(item.errorType)}</p>
    <button class="ghost" data-complete-task="${index}">${item.completed ? "已完成" : "标记完成"}</button>
  </article>`).join("");
  shell("针对训练", `${loopProgress("training")}
  <section class="panel">
    <h2>${escapeHtml(plan.goal)}</h2>
    <div class="metrics">
      <div class="metric"><span>训练题量</span><strong>${plan.totalQuestions}</strong></div>
      <div class="metric"><span>预计用时</span><strong>${plan.estimatedMinutes}分钟</strong></div>
      <div class="metric"><span>完成标准</span><strong>${escapeHtml(plan.completionStandard)}</strong></div>
      <div class="metric"><span>训练顺序</span><strong>四阶段</strong></div>
    </div>
  </section>
  <section class="panel"><h2>训练任务</h2><div class="cards">${tasks}</div><div class="row"><button class="primary" id="finishTraining">完成训练并进入复测</button><button class="ghost" data-view="diagnosis">返回诊断</button></div></section>`);
  document.querySelectorAll("[data-complete-task]").forEach((button) => {
    button.onclick = () => {
      button.textContent = "已完成";
      button.disabled = true;
    };
  });
  const finish = $("#finishTraining");
  if (finish) finish.onclick = () => setView("retest");
}

async function renderRetest() {
  const loop = await loadLoop();
  const retest = loop.retest;
  const questions = retest.questions.map((q, index) => `<article class="card retest-card">
    <h3>复测 ${index + 1} · ${escapeHtml(q.typeLabel)} <span class="badge warn">${escapeHtml(q.difficulty)}</span></h3>
    <p class="stem">${escapeHtml(q.stem)}</p>
    <p><strong>复测目标：</strong>${escapeHtml(q.target)}</p>
    <p><strong>AI判断：</strong>${escapeHtml(q.result)}</p>
  </article>`).join("");
  shell("复测", `${loopProgress("retest")}
  <section class="panel">
    <h2>同知识点变式复测</h2>
    <p>复测题与原错题知识点一致，但数字、情境和问法不同，用来验证训练后是否真正掌握。</p>
    <div class="metrics">
      <div class="metric"><span>复测得分</span><strong>${retest.score}</strong></div>
      <div class="metric"><span>独立完成</span><strong>${retest.independent ? "是" : "否"}</strong></div>
      <div class="metric"><span>提示使用</span><strong>${retest.hintsUsed}</strong></div>
      <div class="metric"><span>是否达标</span><strong>${retest.passed ? "达标" : "需巩固"}</strong></div>
    </div>
  </section>
  <section class="panel"><div class="cards">${questions}</div><div class="row"><button class="primary" data-view="improvement">查看提升报告</button><button class="ghost" data-view="trainingPlan">返回训练</button></div></section>`);
}

async function renderImprovement() {
  const loop = await loadLoop();
  const item = loop.improvement;
  const comparison = loop.comparisonReport;
  shell("错题攻克报告", `${loopProgress("improvement")}
  <section class="panel improvement-hero">
    <h2>训练前后能力变化</h2>
    <div class="metrics">
      <div class="metric"><span>训练前掌握度</span><strong>${item.beforeMastery}%</strong></div>
      <div class="metric"><span>训练后掌握度</span><strong>${item.afterMastery}%</strong></div>
      <div class="metric"><span>提升</span><strong>+${item.improvementValue}%</strong></div>
      <div class="metric"><span>结论</span><strong>${escapeHtml(item.status)}</strong></div>
    </div>
  </section>
  <section class="panel">
    <h2>第一次与第二次作答对比</h2>
    <div class="comparison-grid">
      <article class="comparison-col">
        <h3>第一次作答</h3>
        <p><strong>得分：</strong>${escapeHtml(comparison?.firstScore || item.beforeMastery + "%")}</p>
        <p><strong>用时：</strong>${escapeHtml(comparison?.firstDuration || "未记录")}</p>
        <p><strong>错误步骤：</strong>${escapeHtml(comparison?.firstErrorStep || item.originalError)}</p>
        <p><strong>作答摘要：</strong>${escapeHtml(comparison?.firstSteps || "见诊断页")}</p>
      </article>
      <article class="comparison-col good">
        <h3>重新作答</h3>
        <p><strong>得分：</strong>${escapeHtml(comparison?.retryScore || item.afterMastery + "%")}</p>
        <p><strong>用时：</strong>${escapeHtml(comparison?.retryDuration || "已重新记录")}</p>
        <p><strong>步骤表现：</strong>${escapeHtml(comparison?.retryStepPerformance || "关键错误已纠正")}</p>
        <p><strong>是否重复原错：</strong>${escapeHtml(comparison?.sameErrorRepeated ? "是" : "否")}</p>
      </article>
    </div>
  </section>
  <section class="panel">
    <h2>闭环结论</h2>
    <div class="cards">
      <article class="card"><h3>原错误</h3><p>${escapeHtml(item.originalError)}</p></article>
      <article class="card"><h3>训练结果</h3><p>${escapeHtml(item.trainingResult)}</p></article>
      <article class="card"><h3>仍需关注</h3><p>${escapeHtml(item.nextRisk)}</p></article>
    </div>
    <div class="row"><button class="primary" data-view="profile">更新能力画像</button><button class="ghost" data-view="chapters">进入下一轮学习</button></div>
  </section>`);
}

async function renderProfile() {
  const loop = await loadLoop();
  const abilities = loop.profile.abilities.map((item) => `<article class="ability-card">
    <div class="ability-head"><h3>${escapeHtml(item.name)}</h3><strong>${item.current}</strong></div>
    <div class="bar"><i style="width:${item.current}%"></i></div>
    <p>上次：${item.previous} · 趋势：${escapeHtml(item.trend)} · 依据：${escapeHtml(item.evidence)}</p>
    <p>建议：${escapeHtml(item.suggestion)}</p>
  </article>`).join("");
  shell("能力画像", `<section class="panel">
    <h2>个人数学能力画像</h2>
    <p>能力分数来自当前学生的作答、步骤分析、错误类型和复测表现；演示模式使用固定样例数据，不使用随机数。</p>
  </section>
  <section class="panel ability-grid">${abilities}</section>`);
}

$("#logout").onclick = () => {
  localStorage.clear();
  location.reload();
};

window.onpopstate = () => {
  state.view = routeToView[currentRoutePath()] || "home";
  localStorage.setItem("view", state.view);
  render();
};

init().catch((error) => {
  document.body.innerHTML = `<pre>${error.message}</pre>`;
});
