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

const practiceTypes = {
  new: {
    name: "刷新题",
    description: "只抽取从未作答过的题目。",
    emptyMessage: "当前筛选下没有未作答的新题。"
  },
  wrong: {
    name: "刷错题",
    description: "只抽取最近一次明确判错、仍需巩固的题目。",
    emptyMessage: "当前筛选下没有明确判错的错题。"
  },
  mixed: {
    name: "混合刷题",
    description: "默认约一半新题、一半错题，某一类不足时自动补足。",
    emptyMessage: "当前筛选下没有可用的新题或错题。"
  }
};

function readPracticeChapterIds() {
  const stored = localStorage.getItem("practiceChapterIds");
  if (stored === null) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed === null) return null;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : null;
  } catch (error) {
    return null;
  }
}

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
  practiceChapterIds: readPracticeChapterIds(),
  practiceType: localStorage.getItem("practiceType") || "new",
  practiceSessionActive: false,
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
const questionModel = window.QuestionModel;

function mode() {
  return trainingModes[state.trainingMode] || trainingModes.reinforce;
}

function currentPracticeType() {
  return practiceTypes[state.practiceType] ? state.practiceType : "new";
}

function availablePracticeChapters() {
  return state.chapters.filter((chapter) => chapter.subjects.includes(state.student?.mathType));
}

function selectedPracticeChapterIds() {
  const availableIds = new Set(availablePracticeChapters().map((chapter) => chapter.id));
  if (state.practiceChapterIds === null) return Array.from(availableIds);
  return state.practiceChapterIds.filter((chapterId) => availableIds.has(chapterId));
}

function practiceChapterFilterLabel() {
  const chapters = availablePracticeChapters();
  const selectedIds = selectedPracticeChapterIds();
  if (state.practiceChapterIds === null) return "全部章节";
  if (!selectedIds.length) return "未选择章节";
  if (selectedIds.length === chapters.length) return "全部章节";
  return chapters.filter((chapter) => selectedIds.includes(chapter.id)).map((chapter) => chapter.name).join("、");
}

function practiceChapterKey() {
  const selectedIds = selectedPracticeChapterIds();
  return selectedIds.length === 1 ? selectedIds[0] : "mixed";
}

function savePracticeConfig() {
  localStorage.setItem("practiceChapterIds", JSON.stringify(state.practiceChapterIds));
  localStorage.setItem("practiceType", currentPracticeType());
}

function setPracticeChapterSelection(chapterIds) {
  state.practiceChapterIds = chapterIds === null ? null : Array.from(new Set(chapterIds));
  const selectedIds = selectedPracticeChapterIds();
  if (selectedIds.length === 1) state.chapterId = selectedIds[0];
  else if (!state.chapterId || state.chapterId === "mixed") state.chapterId = availablePracticeChapters()[0]?.id || "integral";
  savePracticeConfig();
}

function setPracticeType(practiceType) {
  state.practiceType = practiceTypes[practiceType] ? practiceType : "new";
  savePracticeConfig();
}

function updateHistory(view, replace = false) {
  if (location.protocol === "file:") return;
  const nextPath = `${APP_BASE_PATH}${viewToRoute[view] || "/"}`;
  if (location.pathname === nextPath) return;
  const method = replace ? "replaceState" : "pushState";
  history[method]({ view }, "", nextPath);
}

function setView(view) {
  state.view = view;
  localStorage.setItem("view", view);
  updateHistory(view);
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
  if (chapter.groupId === "linear" || chapter.id === "linear" || /线性代数/.test(chapter.name || "")) return "线性代数";
  if (chapter.groupId === "prob" || chapter.id === "prob" || /概率/.test(chapter.name || "")) return "概率论与数理统计";
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
  const correct = Number(reportItem?.correct ?? attempts.filter((item) => item.correct === true).length);
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
    setPracticeChapterSelection(null);
    state.questions = [];
    state.practiceSessionActive = false;
    state.current = 0;
    state.responses = {};
    state.view = "home";
    localStorage.setItem("view", "home");
    updateHistory("home", true);
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

function renderMathText(value) {
  return questionModel?.renderFormulaText
    ? questionModel.renderFormulaText(value)
    : `<span class="math-text">${escapeHtml(value)}</span>`;
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

window.alert = (message, type = "info") => uiMessage(String(message || ""), type);

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
      if (event.target === overlay) done(false);
    };
  });
}

function responseKey() {
  if (!state.student) return "";
  const chapterKey = state.practiceChapterIds === null ? "all" : selectedPracticeChapterIds().sort().join(",") || "none";
  return `paperResponses:${state.student.id}:${state.trainingMode}:${chapterKey}:${currentPracticeType()}:${state.questionCount}:${state.difficulty}:${state.sourceType}`;
}

function persistResponses() {
  const key = responseKey();
  if (key) localStorage.setItem(key, JSON.stringify(state.responses || {}));
}

function restoreResponses() {
  const key = responseKey();
  if (!key) return;
  state.responses = JSON.parse(localStorage.getItem(key) || "{}");
}

async function init() {
  const boot = await api("/api/bootstrap");
  state.chapters = boot.chapters;
  migratePracticeChapterSelection();
  state.pastExamSources = boot.pastExamSources;
  render();
}

function migratePracticeChapterSelection() {
  if (!state.student || !Array.isArray(state.practiceChapterIds)) return;
  if (state.practiceChapterIds.includes("all")) {
    state.practiceChapterIds = null;
    savePracticeConfig();
    return;
  }

  const available = availablePracticeChapters();
  const availableIds = new Set(available.map((chapter) => chapter.id));
  const hasLegacyGroup = state.practiceChapterIds.some((chapterId) => chapterId === "linear" || chapterId === "prob");
  if (!hasLegacyGroup) {
    state.practiceChapterIds = state.practiceChapterIds.filter((chapterId) => availableIds.has(chapterId));
    return;
  }

  state.practiceChapterIds = Array.from(new Set(state.practiceChapterIds.flatMap((chapterId) => {
    if (chapterId === "linear") return available.filter((chapter) => chapter.groupId === "linear" || /线性代数/.test(chapter.name || "")).map((chapter) => chapter.id);
    if (chapterId === "prob") return available.filter((chapter) => chapter.groupId === "prob" || /概率/.test(chapter.name || "")).map((chapter) => chapter.id);
    return availableIds.has(chapterId) ? [chapterId] : [];
  })));
  savePracticeConfig();
}

function shell(title, body) {
  document.body.classList.toggle("practice-mode", state.view === "practice" && state.practiceSessionActive);
  $("#title").textContent = title;
  $("#sub").textContent = state.student
    ? `${state.student.name} · ${state.student.mathType} · ${mode().name}`
    : `先选择数学一/二/三，再进入训练`;
  $("#logout").style.display = state.student ? "block" : "none";
  $("#nav").innerHTML = state.student
    ? navs.map(([id, label]) => `<button class="${state.view === id ? "active" : ""}" data-view="${id}">${label}</button>`).join("")
    : "";
  $("#view").innerHTML = body;
  document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => setView(button.dataset.view));
}

function render() {
  if (!state.student) return renderLogin();
  const map = {
    home: renderHome,
    mathTypeChooser: renderMathTypeChooser,
    chapters: renderChapters,
    practice: renderPractice,
    grading: renderGrading,
    roundResults: renderRoundResults,
    diagnosis: renderDiagnosis,
    knowledgeReview: renderKnowledgeReview,
    understandingCheck: renderUnderstandingCheck,
    similarTraining: renderSimilarTrainingV2,
    originalRetry: renderOriginalRetry,
    masteryVerify: renderMasteryVerify,
    paperReport: renderPaperReport,
    questionReview: renderQuestionReview,
    trainingPlan: renderSimilarTrainingV2,
    retest: renderOriginalRetry,
    improvement: renderImprovement,
    profile: renderProfile,
    paperExam: renderPaperExam,
    pastExams: renderPastExams,
    report: renderReport,
    collection: renderCollection
  };
  return (map[state.view] || renderHome)();
}

function renderMathTypeChooser() {
  const mathTypes = [
    { name: "数学一", scope: "高等数学、线性代数、概率论与数理统计", note: "适用于理工、经济管理等专业的数学一考试。" },
    { name: "数学二", scope: "高等数学、线性代数", note: "不展示概率论内容，重点覆盖高等数学和线性代数。" },
    { name: "数学三", scope: "高等数学、线性代数、概率论与数理统计", note: "适用于经济管理类专业的数学三考试。" }
  ];
  shell("请选择你的考试数学类型", `<section class="panel math-type-chooser">
    <div class="chooser-head">
      <div><span class="badge">${escapeHtml(state.student.name)}，先确认考试范围</span><h2>请选择你的考试数学类型</h2><p>选择后，章节、知识点和题目都会自动按照你的考试范围过滤。</p></div>
    </div>
    <div class="select-grid">${mathTypes.map((item) => `<button class="select-card ${state.student.mathType === item.name ? "active" : ""}" data-math-type="${item.name}">
      <strong>${item.name}</strong><span>${item.scope}</span><small>${item.note}</small><em>${state.student.mathType === item.name ? "当前选择" : "选择此类型"}</em>
    </button>`).join("")}</div>
  </section>`);
  document.querySelectorAll("[data-math-type]").forEach((button) => {
    button.onclick = () => persistMathType(button.dataset.mathType);
  });
}

function renderLogin() {
  const mathTypes = ["数学一", "数学二", "数学三"].map((name) => `<button class="select-card ${state.selectedMathType === name ? "active" : ""}" data-math="${name}">
    <strong>${name}</strong>
    <span>${name === "数学一" ? "高数 + 线代 + 概率 + 级数/空间" : name === "数学二" ? "高数 + 线代，强调计算与综合" : "高数 + 线代 + 概率，偏经管应用"}</span>
  </button>`).join("");

  shell("选择考试类型", `<section class="panel entrance">
    <h2>先确认你刷的是哪一套数学</h2>
    <div class="select-grid">${mathTypes}</div>
  </section>
  <section class="panel">
    <div class="grid two">
      <label>姓名<input id="name" placeholder="例如：小王"></label>
      <label>邀请码<input id="code" placeholder="MATH01 - MATH10"></label>
      <label>目标分数<input id="target" type="number" value="120"></label>
      <label>每日时间<select id="daily"><option value="30">30分钟</option><option selected value="60">60分钟</option><option value="90">90分钟</option></select></label>
    </div>
    <button class="primary wide" id="login">进入 APP</button>
    <p class="badge warn">试用账号邀请码：MATH01 到 MATH10</p>
  </section>`);

  $("#code").closest("label").insertAdjacentHTML("afterend", `<label>演示密码<input id="password" type="password" placeholder="demo123"></label>`);
  $("#login").insertAdjacentHTML("afterend", `<button class="ghost wide" id="demoLogin">进入演示系统</button><p class="badge">演示账号：demo / demo123。每个浏览器会生成独立演示会话。</p>`);

  document.querySelectorAll("[data-math]").forEach((button) => {
    button.onclick = () => {
      state.selectedMathType = button.dataset.math;
      localStorage.setItem("selectedMathType", state.selectedMathType);
      renderLogin();
    };
  });

  $("#login").onclick = async () => {
    const res = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        name: $("#name").value,
        inviteCode: $("#code").value,
        password: $("#password")?.value || "",
        mathType: state.selectedMathType,
        targetScore: $("#target").value,
        stage: mode().stage,
        dailyMinutes: $("#daily").value
      })
    });
    saveStudent(res.student);
    state.view = "mathTypeChooser";
    localStorage.setItem("view", "mathTypeChooser");
    updateHistory("mathTypeChooser", true);
    render();
  };

  $("#demoLogin").onclick = async () => {
    const res = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        demo: true,
        name: $("#name").value || "王同学",
        inviteCode: "demo",
        password: $("#password").value || "demo123",
        sessionId: demoSessionId,
        mathType: state.selectedMathType,
        targetScore: $("#target").value,
        stage: mode().stage,
        dailyMinutes: $("#daily").value
      })
    });
    saveStudent(res.student);
    localStorage.setItem("demoMode", "1");
    state.view = "mathTypeChooser";
    localStorage.setItem("view", "mathTypeChooser");
    updateHistory("mathTypeChooser", true);
    render();
  };
}

async function renderHome() {
  const loop = await loadLoop();
  const progress = await loadProgress();
  const demoOn = localStorage.getItem("demoMode") === "1";
  const report = progress.report || {};
  const attempts = Array.isArray(progress.attempts) ? progress.attempts.filter((item) => item.studentId === state.student.id) : [];
  const completed = Number(report.total ?? attempts.length);
  const accuracy = Number(report.accuracy ?? (attempts.length ? Math.round(attempts.filter((item) => item.correct === true).length / attempts.length * 100) : 0));
  const weakPoints = loop?.diagnosis?.weakKnowledgePoints || [];
  const chapters = state.chapters.filter((chapter) => chapter.subjects.includes(state.student.mathType));

  shell(`${state.student.mathType} · 课程首页`, `<section class="panel course-home-head">
    <div class="dashboard-head">
      <div><span class="badge ${demoOn ? "warn" : ""}">${demoOn ? "演示学习空间" : "个人学习空间"}</span><h2>${state.student.mathType} · 课程首页</h2><p>只展示与你当前考试数学类型匹配的章节和题目，按章节推进学习。</p></div>
      <div class="row"><button class="primary" id="switchMathType">切换数学类型</button>${state.student?.isDemo ? `<button class="ghost danger" id="resetDemo">重置演示数据</button>` : ""}</div>
    </div>
    <div class="metrics course-summary">
      <div class="metric"><span>当前考试类型</span><strong>${state.student.mathType}</strong></div>
      <div class="metric"><span>已完成题目</span><strong>${completed}</strong></div>
      <div class="metric"><span>总体正确率</span><strong>${accuracy}%</strong></div>
      <div class="metric"><span>薄弱知识点</span><strong>${weakPoints.length}</strong></div>
    </div>
  </section>
  <section class="panel">
    <div class="section-heading"><div><h2>继续学习</h2><p>从当前类型的章节中选择一个入口开始做题。</p></div><button class="ghost" data-view="chapters">查看全部章节</button></div>
    <div class="next-actions"><button class="primary" data-chapter="${escapeHtml(state.chapterId)}">继续当前章节</button><button class="ghost" data-view="report">查看学习报告</button></div>
  </section>
  <section class="panel">
    <div class="section-heading"><div><h2>章节学习</h2><p>章节题量、完成情况和正确率会随着你的真实作答自动更新。</p></div></div>
    ${renderChapterGroups(progress, chapters)}
  </section>
  <section class="panel learning-advice"><h2>下一步建议</h2><p>${escapeHtml(loop?.recoveryPath?.nextAction || "先完成一个章节的基础训练，系统会根据你的作答结果安排后续练习。")}</p>${weakPoints.length ? `<div class="weak-point-list">${weakPoints.slice(0, 4).map((point) => `<span>${escapeHtml(point)}</span>`).join("")}</div>` : ""}</section>`);

  document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => setView(button.dataset.view));
  document.querySelectorAll("[data-chapter]").forEach((button) => {
    button.onclick = async () => {
      setPracticeChapterSelection([button.dataset.chapter]);
      await startPracticeRound();
    };
  });
  $("#switchMathType").onclick = () => setView("mathTypeChooser");
  const toggleDemo = $("#toggleDemo");
  const resetDemo = $("#resetDemo");
  if (resetDemo) resetDemo.onclick = async () => {
    await api("/api/demo/reset", {
      method: "POST",
      body: JSON.stringify({ studentId: state.student.id })
    });
    localStorage.removeItem(`lastResults:${state.student.id}`);
    localStorage.removeItem("lastSubmission");
    Object.keys(localStorage).filter((key) => key.startsWith(`mistakeFlow:${state.student.id}`)).forEach((key) => localStorage.removeItem(key));
    state.responses = {};
    state.lastResults = null;
    state.lastSubmission = null;
    alert("演示数据已重置。");
    renderHome();
  };
}

function renderChapterGroups(progress, chapters) {
  const groups = ["高等数学", "线性代数", "概率论与数理统计"];
  return `<div class="chapter-groups">${groups.map((group) => {
    const items = chapters.filter((chapter) => chapterGroup(chapter) === group);
    if (!items.length) return "";
    return `<section class="chapter-group"><h3>${group}</h3><div class="chapter-card-grid">${items.map((chapter) => {
      const stats = chapterProgress(progress, chapter.id);
      const total = chapterQuestionCount(chapter);
      return `<article class="chapter-card"><div class="chapter-card-head"><div><h4>${escapeHtml(chapter.name)}</h4><p>${total} 道可用题目</p></div><span class="chapter-rate">${stats.accuracy}%</span></div><div class="chapter-card-meta"><span>已完成 ${stats.completed} 题</span><span>正确率 ${stats.accuracy}%</span></div><div class="bar"><i style="width:${Math.min(100, total ? Math.round(stats.completed / total * 100) : 0)}%"></i></div><button class="primary" data-chapter="${escapeHtml(chapter.id)}">${stats.completed ? "继续学习" : "开始做题"}</button></article>`;
    }).join("")}</div></section>`;
  }).join("")}</div>`;
}

async function renderChapters() {
  const currentMode = mode();
  const progress = await loadProgress();
  const chapters = state.chapters.filter((chapter) => chapter.subjects.includes(state.student.mathType));

  shell(`${state.student.mathType} · 章节学习`, `<section class="panel chapter-filter-panel">
    <div class="section-heading"><div><span class="badge">${state.student.mathType}</span><h2>${state.student.mathType} · 章节学习</h2><p>当前只显示适用于${state.student.mathType}的章节，选择章节后进入做题。</p></div><button class="ghost" id="switchMathType">切换数学类型</button></div>
    <div class="mode-tabs large">
      ${Object.entries(trainingModes).map(([key, item]) => `<button class="${state.trainingMode === key ? "active" : ""}" data-switch-mode="${key}">${item.name}<small>${item.difficultyLabel}</small></button>`).join("")}
    </div>
    <p class="mode-help">当前选择：${currentMode.name}，系统会优先抽取 ${currentMode.difficultyLabel}。每轮固定20题，难度和题源可以按需要调整。</p>
    <div class="fixed-practice-count">
      <strong>每轮固定 20 题</strong>
      <span>完成一轮后系统统一批改；你可以在做题页刷新，换一组新的题目。</span>
      <label>难度
        <select id="difficulty">${difficultyOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select>
      </label>
      <label>题源
        <select id="sourceType">${sourceOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select>
      </label>
    </div>
  </section>
  <section class="panel">${chapters.length ? renderChapterGroups(progress, chapters) : `<div class="empty-state"><h3>当前类型暂未配置章节</h3><p>请切换数学类型或联系管理员导入对应题库。</p></div>`}</section>`);

  state.questionCount = FIXED_PRACTICE_COUNT;
  $("#difficulty").value = state.difficulty;
  $("#sourceType").value = state.sourceType;
  $("#difficulty").onchange = (event) => {
    state.difficulty = event.target.value;
    localStorage.setItem("difficulty", state.difficulty);
  };
  $("#sourceType").onchange = (event) => {
    state.sourceType = event.target.value;
    localStorage.setItem("sourceType", state.sourceType);
  };
  document.querySelectorAll("[data-switch-mode]").forEach((button) => {
    button.onclick = () => {
      selectMode(button.dataset.switchMode);
      renderChapters();
    };
  });
  document.querySelectorAll("[data-chapter]").forEach((button) => {
    button.onclick = async () => {
      setPracticeChapterSelection([button.dataset.chapter]);
      await startPracticeRound();
    };
  });
  $("#switchMathType").onclick = () => setView("mathTypeChooser");
}

function renderPracticeSetup() {
  const chapters = availablePracticeChapters();
  const selectedIds = selectedPracticeChapterIds();
  const selectedSet = new Set(selectedIds);
  const allIds = chapters.map((chapter) => chapter.id);
  const currentType = currentPracticeType();
  const groups = ["高等数学", "线性代数", "概率论与数理统计"];
  const chapterGroups = groups.map((group) => {
    const items = chapters.filter((chapter) => chapterGroup(chapter) === group);
    if (!items.length) return "";
    return `<section class="practice-chapter-group"><h3>${group}</h3><div class="practice-chapter-grid">${items.map((chapter) => {
      const selected = selectedSet.has(chapter.id);
      return `<button type="button" class="practice-chapter-option ${selected ? "selected" : ""}" data-practice-chapter="${escapeHtml(chapter.id)}" aria-pressed="${selected}">
        <span><strong>${escapeHtml(chapter.name)}</strong><small>${chapterQuestionCount(chapter)} 道可用题目</small></span><b>${selected ? "已选择" : "选择"}</b>
      </button>`;
    }).join("")}</div></section>`;
  }).join("");

  shell("刷题", `<section class="panel practice-setup-hero">
    <div class="section-heading"><div><span class="badge">本轮配置</span><h2>选择你想刷的题</h2><p>先选择章节和题目类型，再开始本轮刷题。每轮最多 20 题。</p></div><button class="ghost" data-view="chapters">查看章节学习</button></div>
    <div class="practice-type-tabs" role="tablist" aria-label="刷题类型">
      ${Object.entries(practiceTypes).map(([key, item]) => `<button type="button" class="practice-type-card ${currentType === key ? "active" : ""}" data-practice-type="${key}" role="tab" aria-selected="${currentType === key}"><strong>${item.name}</strong><small>${item.description}</small></button>`).join("")}
    </div>
  </section>
  <section class="panel practice-chapter-panel">
    <div class="section-heading"><div><h2>选择章节</h2><p>可以选择一个或多个章节；混合章节会按题目实际所属章节展示。</p></div><div class="row"><button type="button" class="ghost" id="selectAllPracticeChapters">全选章节</button><button type="button" class="ghost" id="clearPracticeChapters">清空选择</button></div></div>
    <div class="practice-selection-summary"><strong>已选 ${selectedIds.length} 个章节</strong><span>${escapeHtml(practiceChapterFilterLabel())}</span></div>
    ${chapters.length ? `<div class="practice-chapter-groups">${chapterGroups}</div>` : `<div class="empty-state"><h3>当前类型暂未配置章节</h3><p>请切换数学类型或联系管理员导入对应题库。</p></div>`}
  </section>
  <section class="panel practice-options-panel">
    <div class="fixed-practice-count"><strong>每轮最多 20 题</strong><span>${escapeHtml(practiceTypes[currentType].description)}符合条件的题目不足时，将按实际可用数量开始。</span><label>训练模式<select id="practiceTrainingMode">${Object.entries(trainingModes).map(([key, item]) => `<option value="${key}">${item.name} · ${item.difficultyLabel}</option>`).join("")}</select></label><label>难度<select id="practiceDifficulty">${difficultyOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label><label>题源<select id="practiceSourceType">${sourceOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label></div>
    <div class="practice-start-row"><div><strong>${escapeHtml(practiceTypes[currentType].name)} · ${escapeHtml(practiceChapterFilterLabel())}</strong><p>提交后统一批改，错题会根据最新作答结果自动更新。</p></div><button class="primary" id="startPractice" ${selectedIds.length ? "" : "disabled"}>开始刷题</button></div>
  </section>`);

  $("#practiceTrainingMode").value = state.trainingMode;
  $("#practiceDifficulty").value = state.difficulty;
  $("#practiceSourceType").value = state.sourceType;
  $("#practiceTrainingMode").onchange = (event) => {
    selectMode(event.target.value);
    renderPracticeSetup();
  };
  $("#practiceDifficulty").onchange = (event) => {
    state.difficulty = event.target.value;
    localStorage.setItem("difficulty", state.difficulty);
  };
  $("#practiceSourceType").onchange = (event) => {
    state.sourceType = event.target.value;
    localStorage.setItem("sourceType", state.sourceType);
  };
  document.querySelectorAll("[data-practice-type]").forEach((button) => {
    button.onclick = () => {
      setPracticeType(button.dataset.practiceType);
      renderPracticeSetup();
    };
  });
  document.querySelectorAll("[data-practice-chapter]").forEach((button) => {
    button.onclick = () => {
      const chapterId = button.dataset.practiceChapter;
      const next = selectedIds.includes(chapterId)
        ? selectedIds.filter((item) => item !== chapterId)
        : [...selectedIds, chapterId];
      setPracticeChapterSelection(next.length === allIds.length ? null : next);
      renderPracticeSetup();
    };
  });
  $("#selectAllPracticeChapters").onclick = () => {
    setPracticeChapterSelection(null);
    renderPracticeSetup();
  };
  $("#clearPracticeChapters").onclick = () => {
    setPracticeChapterSelection([]);
    renderPracticeSetup();
  };
  $("#startPractice").onclick = () => startPracticeRound();
}

async function loadQuestions(refresh) {
  state.questionCount = FIXED_PRACTICE_COUNT;
  const previousQuestions = state.questions;
  const selectedIds = selectedPracticeChapterIds();
  const params = new URLSearchParams({
    studentId: state.student.id,
    chapterIds: state.practiceChapterIds === null ? "all" : selectedIds.join(","),
    practiceType: currentPracticeType(),
    refresh: refresh ? "1" : "0",
    count: String(FIXED_PRACTICE_COUNT),
    difficulty: state.difficulty,
    sourceType: state.sourceType,
    mode: state.trainingMode
  });
  if (refresh && previousQuestions.length) params.set("excludeIds", previousQuestions.map((question) => question.id).join(","));
  const res = await api(`/api/questions?${params.toString()}`);
  if (!res.questions.length && refresh && previousQuestions.length) {
    alert(res.message || "没有更多符合当前条件的新题，本轮暂不更换。", "warn");
    return false;
  }
  state.questions = res.questions;
  if (!state.questions.length) {
    alert(res.message || practiceTypes[currentPracticeType()].emptyMessage || "当前筛选条件下没有题目，请调整筛选条件。", "warn");
    state.current = 0;
    state.responses = {};
    state.practiceSessionActive = false;
    return false;
  }
  state.current = 0;
  state.responses = {};
  if (refresh) {
    localStorage.removeItem(responseKey());
  } else {
    restoreResponses();
  }
  state.lastResults = null;
  resetScratch();
  return true;
}

async function startPracticeRound() {
  if (!selectedPracticeChapterIds().length) {
    if (state.view !== "practice") setView("practice");
    alert("请至少选择一个章节。", "warn");
    return false;
  }
  state.practiceSessionActive = false;
  if (state.view !== "practice") setView("practice");
  let loaded = false;
  try {
    loaded = await loadQuestions(false);
  } catch (error) {
    renderPracticeSetup();
    alert(error.message || "题目加载失败，请稍后重试。", "bad");
    return false;
  }
  if (!loaded) {
    renderPracticeSetup();
    return false;
  }
  state.practiceSessionActive = true;
  render();
  return true;
}

function resetScratch() {
  state.strokeCount = 0;
  state.strokes = [];
  state.redoStrokes = [];
  state.startedAt = Date.now();
}

function loadScratchForQuestion(q) {
  const saved = state.responses[q.id] || {};
  state.strokes = Array.isArray(saved.strokes) ? saved.strokes : [];
  state.strokeCount = state.strokes.length || Number(saved.strokeCount || 0);
  state.redoStrokes = [];
  state.startedAt = Date.now() - Number(saved.durationMs || 0);
}

function difficultyText(value) {
  return difficultyOptions.find(([key]) => key === String(value))?.[1] || "3星 易错";
}

function safeAssetHref(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, document.baseURI);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (error) {
    return "";
  }
}

function questionStem(q) {
  if (q.sourceType === "past_exam") {
    const sourcePageImage = safeAssetHref(q.sourcePageImage);
    const stemImage = safeAssetHref(q.stemImage) || (q.practiceStatus === "trial" ? sourcePageImage : "");
    const showAnswerAnnotation = q.showAnswerAnnotation === true;
    const hideSourceAnnotations = Boolean(q.stem) && !showAnswerAnnotation;
    const pendingSourceReview = q.practiceStatus === "trial" || q.practiceMeta?.status === "needs_review";
    const body = q.stemHtml
      ? `<div class="typeset-stem">${q.stemHtml}</div>`
      : (hideSourceAnnotations && q.stem
        ? `<p>${renderMathText(q.stem)}</p>`
        : (stemImage
        ? `<figure class="source-page-figure"><img class="stem-image exam" src="${escapeHtml(stemImage)}" alt="${escapeHtml(q.sourcePage ? `真题原页第 ${q.sourcePage} 页` : q.stem)}"><figcaption>原页图片（公式显示以此为准）</figcaption></figure>`
        : `<p>${renderMathText(q.stem)}</p>`));
    const sourcePageLink = sourcePageImage
      ? `<p class="source-page-link"><a class="ghost link-button" href="${escapeHtml(sourcePageImage)}" target="_blank" rel="noopener">查看原页${q.sourcePage ? `（第 ${escapeHtml(q.sourcePage)} 页）` : ""}${hideSourceAnnotations ? "（可能含答案标注）" : ""}</a>${q.stem ? `<button class="ghost link-button" id="toggleSourceAnnotation">${showAnswerAnnotation ? "隐藏原页标注" : "查看带标注原页"}</button>` : ""}</p>`
      : "";
    const textLayer = pendingSourceReview && q.stem
      ? `<details class="exam-text-layer"><summary>OCR 文本层（仅用于搜索和复制）</summary><pre>${escapeHtml(q.stem)}</pre></details>`
      : "";
    return `<div class="exam-stem">
      <div class="exam-paper">
        ${body}
        ${textLayer}
      </div>${sourcePageLink}
    </div>`;
  }
  return `<div class="exam-stem text-mode">
    <div class="exam-paper">
      <p>${renderMathText(q.stem)}</p>
    </div>
  </div>`;
}

function questionAnswerControls(q) {
  if (q.type === "choice") {
    const saved = state.responses[q.id] || {};
    const selected = questionModel.choiceAnswerKey(q, saved.choice || saved.answer || saved.selectedOption || "");
    return `<div class="practice-choice-list" aria-label="选择答案">${questionModel.choiceOptions(q).map((option) => {
      const text = option.text || option.raw;
      return `<button class="practice-choice ${selected === option.key ? "active" : ""}" data-choice-key="${escapeHtml(option.key)}" data-choice-text="${escapeHtml(text)}">${escapeHtml(option.key)}. ${renderMathText(text)}</button>`;
    }).join("")}</div>`;
  }
  return `<p class="practice-answer-hint">${q.type === "fill" ? "请在做题空间中写出最终答案和必要步骤。" : "请在做题空间中完整写出解题过程和最终答案。"}</p>`;
}

async function renderPractice() {
  if (!state.practiceSessionActive || !state.questions.length) {
    state.practiceSessionActive = false;
    renderPracticeSetup();
    return;
  }
  state.trainingCanvasQuestion = null;
  const q = state.questions[state.current];
  const chapter = state.chapters.find((item) => item.id === q.chapterId);
  const answeredCount = state.questions.filter((item) => Boolean(state.responses[item.id]?.selectedOption || state.responses[item.id]?.scratchImage || state.responses[item.id]?.strokeCount)).length;
  loadScratchForQuestion(q);
  shell("刷题", `<div class="practice-simple ${q.type === "choice" ? "practice-choice-mode" : ""}">
    <section class="question-only">
      <div class="practice-context"><span>${escapeHtml(state.student.mathType)}</span><span>${escapeHtml(practiceTypes[currentPracticeType()].name)}</span><span>${escapeHtml(chapter?.name || q.chapterName || "当前章节")}</span><span>${escapeHtml(q.point || "本题知识点")}</span><strong>已完成 ${answeredCount} / ${state.questions.length}</strong><button class="ghost" id="configurePractice">重新配置</button><button class="ghost" id="refreshPractice">刷新本轮题目</button></div>
      <div class="question-count">第${state.current + 1}题 / 共${state.questions.length}题</div>
      ${questionStem(q)}
      ${questionAnswerControls(q)}
    </section>
    ${renderWritingPanel(q)}
  </div>`);
  bindPractice(q);
}

function renderWritingPanel(q) {
  const isLast = state.current >= state.questions.length - 1;
  if (q?.type === "choice") {
    return `<section class="choice-actions-only">
      <p class="choice-answer-note">请选择一个答案，系统会在整卷提交后统一批改。</p>
      <div class="practice-actions">
        ${state.current > 0 ? `<button class="ghost" id="prev">上一题</button>` : ""}
        <button class="primary" id="next">${isLast ? "提交答卷" : "下一题"}</button>
        ${isLast ? "" : `<button class="ghost" id="finishRound">提交答卷</button>`}
      </div>
    </section>`;
  }
  return `<section class="writing-only">
    <div class="paper-stage">
      <canvas id="pad" width="1800" height="1120"></canvas>
    </div>
    <div class="practice-actions">
      ${state.current > 0 ? `<button class="ghost" id="prev">上一题</button>` : ""}
      <button class="ghost" id="clearPad">清空手写</button>
      <button class="ghost" id="undoPad">撤销</button>
      <button class="ghost" id="redoPad">重做</button>
      <button class="primary" id="next">${isLast ? "提交答卷" : "下一题"}</button>
      ${isLast ? "" : `<button class="ghost" id="finishRound">提交答卷</button>`}
    </div>
  </section>`;
}

function bindPractice(q) {
  const prev = $("#prev");
  const next = $("#next");
  const clearPad = $("#clearPad");
  const undoPad = $("#undoPad");
  const redoPad = $("#redoPad");
  const finishRound = $("#finishRound");
  const configurePractice = $("#configurePractice");
  const refreshPractice = $("#refreshPractice");
  const toggleSourceAnnotation = $("#toggleSourceAnnotation");
  document.querySelectorAll("[data-choice-key]").forEach((button) => {
    button.onclick = () => {
      const saved = state.responses[q.id] || { questionId: q.id };
      const choice = { key: button.dataset.choiceKey, text: button.dataset.choiceText || "" };
      state.responses[q.id] = {
        ...saved,
        answer: choice.key,
        selectedOption: choice.key,
        selectedOptionText: choice.text,
        choice
      };
      persistResponses();
      document.querySelectorAll("[data-choice-key]").forEach((item) => item.classList.toggle("active", item === button));
    };
  });
  if (prev) prev.onclick = () => {
    saveCurrentScratch(q, { keepEmpty: true });
    state.current -= 1;
    renderPractice();
  };
  if (next) next.onclick = () => {
    saveCurrentScratch(q);
    if (state.current >= state.questions.length - 1) {
      submitRound();
      return;
    }
    state.current += 1;
    renderPractice();
  };
  if (finishRound) finishRound.onclick = async () => {
    saveCurrentScratch(q);
    await submitRound();
  };
  if (configurePractice) configurePractice.onclick = async () => {
    const answered = Object.values(state.responses || {}).filter((item) => item?.selectedOption || item?.scratchImage || item?.strokeCount).length;
    const confirmed = await uiConfirm({
      title: "重新配置本轮",
      message: answered ? `当前已有 ${answered} 题作答，重新配置后将清空本轮答案。是否继续？` : "将离开当前轮次并重新选择章节和题型，是否继续？",
      confirmText: "重新配置",
      cancelText: "继续作答"
    });
    if (!confirmed) return;
    localStorage.removeItem(responseKey());
    state.questions = [];
    state.responses = {};
    state.practiceSessionActive = false;
    renderPracticeSetup();
  };
  if (refreshPractice) refreshPractice.onclick = async () => {
    const answered = Object.values(state.responses || {}).filter((item) => item?.selectedOption || item?.scratchImage || item?.strokeCount).length;
    const confirmed = await uiConfirm({
      title: "刷新本轮题目",
      message: answered ? `当前已有 ${answered} 题作答，刷新后将清空本轮并换成新的20题。是否继续？` : "将换成一组新的20题，是否继续？",
      confirmText: "刷新换题",
      cancelText: "继续作答"
    });
    if (!confirmed) return;
    const refreshed = await loadQuestions(true);
    if (refreshed) renderPractice();
  };
  if (toggleSourceAnnotation) toggleSourceAnnotation.onclick = () => {
    q.showAnswerAnnotation = q.showAnswerAnnotation !== true;
    renderPractice();
  };
  if (clearPad) clearPad.onclick = () => {
    state.redoStrokes = state.strokes.slice();
    state.strokes = [];
    state.strokeCount = 0;
    saveCurrentScratch(q, { keepEmpty: true });
    redrawCanvas();
  };
  if (undoPad) undoPad.onclick = () => {
    const stroke = state.strokes.pop();
    if (stroke) state.redoStrokes.push(stroke);
    state.strokeCount = state.strokes.length;
    saveCurrentScratch(q, { keepEmpty: true });
    redrawCanvas();
  };
  if (redoPad) redoPad.onclick = () => {
    const stroke = state.redoStrokes.pop();
    if (stroke) state.strokes.push(stroke);
    state.strokeCount = state.strokes.length;
    saveCurrentScratch(q, { keepEmpty: true });
    redrawCanvas();
  };
  if ($("#pad")) bindCanvas();
}

function saveCurrentScratch(q, options = {}) {
  const canvas = $("#pad");
  const saved = state.responses[q.id] || { questionId: q.id };
  if (!canvas) {
    if (!saved.selectedOption && !options.keepEmpty) return false;
    state.responses[q.id] = { ...saved, questionId: q.id, durationMs: Date.now() - state.startedAt };
    persistResponses();
    return Boolean(saved.selectedOption);
  }
  if (!state.strokeCount && !options.keepEmpty) return false;
  state.responses[q.id] = {
    ...saved,
    questionId: q.id,
    answer: saved.answer || "",
    selectedOption: saved.selectedOption || "",
    formulaText: "",
    stepsText: "",
    durationMs: Date.now() - state.startedAt,
    scratchImage: state.strokeCount && !options.skipImage ? canvas.toDataURL("image/png") : (options.skipImage ? (saved.scratchImage || "") : ""),
    strokes: state.strokes,
    strokeCount: state.strokeCount
  };
  persistResponses();
  return true;
}

function bindPadToolbar() {
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.onclick = () => {
      state.scratchTool = button.dataset.tool;
      localStorage.setItem("scratchTool", state.scratchTool);
      document.querySelectorAll("[data-tool]").forEach((item) => item.classList.toggle("active", item.dataset.tool === state.scratchTool));
    };
  });
  document.querySelectorAll("[data-color]").forEach((button) => {
    button.onclick = () => {
      state.scratchColor = button.dataset.color;
      localStorage.setItem("scratchColor", state.scratchColor);
      if (state.scratchTool === "eraser") {
        state.scratchTool = "pen";
        localStorage.setItem("scratchTool", state.scratchTool);
      }
      document.querySelectorAll("[data-color]").forEach((item) => item.classList.toggle("active", item.dataset.color === state.scratchColor));
      document.querySelectorAll("[data-tool]").forEach((item) => item.classList.toggle("active", item.dataset.tool === state.scratchTool));
    };
  });
  document.querySelectorAll("[data-width]").forEach((button) => {
    button.onclick = () => {
      state.scratchWidth = Number(button.dataset.width);
      localStorage.setItem("scratchWidth", String(state.scratchWidth));
      document.querySelectorAll("[data-width]").forEach((item) => item.classList.toggle("active", Number(item.dataset.width) === state.scratchWidth));
    };
  });
  const undo = $("#undoPad");
  if (undo) undo.onclick = () => {
    state.strokes.pop();
    state.strokeCount = state.strokes.length;
    redrawCanvas();
  };
}

async function submitRound() {
  saveCurrentScratch(state.questions[state.current]);
  const hasContent = (response) => Boolean(response && (
    response.answer || response.selectedOption || response.formulaText || response.stepsText || response.scratchImage || response.answerImage || response.strokeCount
  ));
  const missing = state.questions.filter((q) => !hasContent(state.responses[q.id]));
  const answered = state.questions.length - missing.length;
  const ok = await uiConfirm({
    title: "提交答卷",
    message: [
      `本轮共 ${state.questions.length} 题，已完成 ${answered} 题，未完成 ${missing.length} 题。`,
      "提交后将锁定本轮手写答题内容，并进入批改与诊断流程。"
    ].filter(Boolean).join("\n"),
    confirmText: "提交并批改",
    cancelText: "继续检查"
  });
  if (!ok) return;
  state.view = "grading";
  localStorage.setItem("view", "grading");
  renderGrading();
  await new Promise((resolve) => setTimeout(resolve, 900));
  try {
    const selectedChapterIds = selectedPracticeChapterIds();
    const chapterKey = practiceChapterKey();
    const payload = {
      studentId: state.student.id,
      examinationId: `${state.trainingMode}_${currentPracticeType()}_${chapterKey}_${Date.now()}`,
      paperName: `${state.student.mathType} · ${mode().name} · ${practiceTypes[currentPracticeType()].name} · ${new Date().toLocaleString()}`,
      mode: state.trainingMode,
      chapterId: chapterKey,
      chapterIds: selectedChapterIds,
      practiceType: currentPracticeType(),
      questionIds: state.questions.map((q) => q.id),
      responses: state.questions.map((q, index) => ({
        questionId: q.id,
        orderIndex: index,
        ...(state.responses[q.id] || {})
      })),
      answerOrder: state.questions.map((q) => q.id),
      durationMs: Date.now() - state.startedAt,
      revisionCount: Number(localStorage.getItem(`revisionCount:${state.student.id}`) || 0)
    };
    const res = await api("/api/submissions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.lastSubmission = res.submission;
    state.lastResults = (res.submission?.attemptIds || []).map((id, index) => ({
      attempt: (res.report?.questionAnalyses?.[index] || {}),
      question: state.questions[index]
    }));
    localStorage.setItem("lastSubmission", JSON.stringify(res.submission));
    localStorage.setItem(`lastSubmittedAt:${state.student.id}`, new Date().toISOString());
    const key = responseKey();
    if (key) localStorage.removeItem(key);
    state.practiceSessionActive = false;
    state.responses = {};
    state.view = "paperReport";
    localStorage.setItem("view", "paperReport");
    renderPaperReport();
  } catch (error) {
    state.practiceSessionActive = true;
    state.view = "practice";
    localStorage.setItem("view", "practice");
    renderPractice();
    alert(error.message || "整卷提交失败，请稍后重试。");
  }
}

function renderGrading() {
  const steps = [
    "正在读取学生答案",
    "正在识别做题空间中的手写内容与公式",
    "正在拆分解题步骤",
    "正在与标准解法比对",
    "正在检查步骤之间的逻辑关系",
    "正在定位错误步骤",
    "正在诊断知识薄弱点",
    "正在生成训练计划"
  ];
  shell("AI批改中", `<section class="panel ai-grading">
    <h2>AI 正在批改本轮试卷</h2>
    <p>系统会先分析答案和做题空间，再生成诊断、针对训练、复测和能力画像。AI分析结果仅作学习辅助，复杂主观题可由教师复核。</p>
    <div class="grading-steps">${steps.map((step, index) => `<div class="grading-step ${index < 5 ? "active" : ""}"><span>${index + 1}</span><strong>${step}</strong></div>`).join("")}</div>
  </section>`);
}

function renderRoundResults() {
  const results = state.lastResults || [];
  if (!results.length) {
    shell("本轮结果", `<section class="panel"><h2>暂无本轮交卷结果</h2><button class="primary" data-view="practice">返回刷题</button></section>`);
    return;
  }
  const graded = results.filter(({ attempt }) => !["pending_recognition", "pending_answer_review", "recognition_error"].includes(attempt.gradingStatus));
  const correct = graded.filter(({ attempt }) => attempt.correct).length;
  const pending = results.length - graded.length;
  const cards = results.map(({ question, attempt }, index) => {
    const judgment = attempt.gradingStatus === "pending_recognition" ? "待识别" : (attempt.correct ? "正确" : "错误");
    const answerPending = attempt.gradingStatus === "pending_answer_review";
    const recognitionError = attempt.gradingStatus === "recognition_error";
    const aiReviewed = attempt.gradingStatus === "ai_reviewed";
    const badge = attempt.gradingStatus === "pending_recognition" || answerPending || recognitionError ? "warn" : (attempt.correct ? "" : "bad");
    const label = recognitionError ? "识别失败" : (aiReviewed ? `AI诊断：${judgment}` : (answerPending ? "答案待校对" : judgment));
    const userAnswer = attempt.studentAnswer || attempt.recognizedAnswer || attempt.answer || "未识别/未作答";
    const standardAnswer = attempt.standardAnswer || question.answer || "待校对";
    return `<article class="result-card">
      <h3>第 ${index + 1} 题 <span class="badge ${badge}">${label}</span></h3>
      <p class="stem">${escapeHtml(question.chapterName)} · ${renderMathText(question.point || question.stem)}</p>
      ${question.stemHtml ? `<div class="exam-paper result-paper"><div class="typeset-stem">${question.stemHtml}</div></div>` : (question.stemImage ? `<div class="exam-paper result-paper"><img class="stem-image exam small" src="${escapeHtml(question.stemImage)}" alt="${escapeHtml(question.stem)}"></div>` : "")}
      <div class="result-grid">
        <p><span>你的答案</span><strong>${renderMathText(userAnswer)}</strong></p>
        <p><span>标准答案</span><strong>${renderMathText(standardAnswer)}</strong></p>
        <p><span>错误点</span><strong>${escapeHtml(attempt.reason)}</strong></p>
        <p><span>建议</span><strong>${escapeHtml(attempt.advice)}</strong></p>
      </div>
      ${attempt.recommendedPractice ? `<p class="explain">追加练习：${escapeHtml(attempt.recommendedPractice)}</p>` : ""}
      <p class="explain">解析：${escapeHtml(question.explanation || "暂无解析")}</p>
    </article>`;
  }).join("");
  shell("本轮结果", `<section class="panel">
    <div class="metrics">
      <div class="metric"><span>本轮题数</span><strong>${results.length}</strong></div>
      <div class="metric"><span>已判分</span><strong>${graded.length}</strong></div>
      <div class="metric"><span>正确</span><strong>${correct}</strong></div>
      <div class="metric"><span>待识别</span><strong>${pending}</strong></div>
    </div>
  </section>
  <section class="panel">
    <div class="row">
      <button class="primary" data-view="collection">进入做题集</button>
      <button class="ghost" data-view="report">查看总报告</button>
      <button class="ghost" data-view="chapters">再练一组</button>
    </div>
  </section>
  <section class="panel"><div class="cards">${cards}</div></section>`);
}

async function ensureLatestSubmission() {
  if (state.lastSubmission?.report && state.lastSubmission.studentId === state.student.id) return state.lastSubmission;
  const data = await api(`/api/submissions?studentId=${encodeURIComponent(state.student.id)}`);
  if (data.latest) {
    state.lastSubmission = data.latest;
    localStorage.setItem("lastSubmission", JSON.stringify(data.latest));
  }
  return state.lastSubmission;
}

function percentBar(value) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));
  return `<div class="bar"><i style="width:${safe}%"></i></div>`;
}

function objectRows(map, formatter) {
  return Object.entries(map || {}).map(([name, item]) => formatter(name, item)).join("");
}

async function renderPaperReport() {
  const submission = await ensureLatestSubmission();
  if (!submission?.report) {
    shell("整卷诊断报告", `<section class="panel"><h2>还没有整卷诊断报告</h2><p class="mode-help">完成一整套题后点击“提交整卷”，系统会生成统一批改和诊断。</p><button class="primary" data-view="practice">去刷题</button></section>`);
    return;
  }
  const report = submission.report;
  const summary = report.summary || {};
  const typeRows = objectRows(report.byType, (name, item) => `<article class="status-card"><h3>${escapeHtml(name)}</h3><p>${item.score}/${item.maxScore} 分 · 正确 ${item.correct}/${item.total}</p>${percentBar(item.maxScore ? Math.round(item.score / item.maxScore * 100) : 0)}</article>`);
  const chapterRows = objectRows(report.byChapter, (name, item) => `<article class="status-card"><h3>${escapeHtml(name)}</h3><p>${item.score}/${item.maxScore} 分 · 掌握度 ${item.maxScore ? Math.round(item.score / item.maxScore * 100) : 0}%</p>${percentBar(item.maxScore ? Math.round(item.score / item.maxScore * 100) : 0)}</article>`);
  const knowledgeRows = objectRows(report.byKnowledge, (name, item) => `<article class="status-card"><h3>${escapeHtml(name)}</h3><p>${escapeHtml(item.status)} · ${item.mastery}%</p>${percentBar(item.mastery)}</article>`);
  const errors = Object.entries(report.errorStats || {}).map(([type, item]) => `<article class="status-card">
    <h3>${escapeHtml(type)}</h3>
    <p>出现 ${item.count} 次 · 涉及第 ${item.questionIndexes.join("、")} 题 · 影响 ${item.scoreLoss} 分 · 严重程度：${item.severity}${item.repeated ? " · 重复性错误" : ""}</p>
    ${item.questionIds?.[0] ? `<button class="ghost" data-error-training-source="${escapeHtml(item.questionIds[0])}">开始该类专项训练</button>` : ""}
  </article>`).join("") || `<article class="status-card"><h3>暂无明显错误类型</h3><p>本卷暂未形成重复性错误。</p></article>`;
  const abilities = (report.abilityDiagnosis || []).map((item) => `<article class="ability-card">
    <div class="ability-head"><h3>${escapeHtml(item.name)}</h3><strong>${item.score}</strong></div>
    ${percentBar(item.score)}
    <p>${escapeHtml(item.level)} · 依据：${escapeHtml(item.evidence)}</p>
    <p>${escapeHtml(item.advice)}</p>
  </article>`).join("");
  const problems = (report.topProblems || []).map((item, index) => `<article class="card"><h3>${index + 1}. ${escapeHtml(item.type)}</h3><p>涉及第 ${item.questionIndexes.join("、")} 题，累计影响 ${item.scoreLoss} 分，严重程度 ${item.severity}。</p></article>`).join("");
  const tasks = (report.recommendedTasks || []).map((task) => `<article class="training-task"><span class="badge">${escapeHtml(task.stage)}</span><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.target)}</p><p>知识点：${escapeHtml(task.knowledgePoint)} · 错误类型：${escapeHtml(task.errorType)}</p></article>`).join("");
  const questions = (report.questionAnalyses || []).map((item, index) => `<article class="status-card ${item.needsDeepDiagnosis ? "needs-diagnosis" : ""}">
    <h3>第 ${index + 1} 题 · ${escapeHtml(item.typeLabel)}</h3>
    <p>${item.score}/${item.maxScore} 分 · ${item.answerCorrectButProcessIssue ? "结果正确但过程有问题" : item.needsDeepDiagnosis ? "进入深度诊断" : "正确题轻记录"} · ${escapeHtml(item.deductionReason || "")}</p>
    <button class="ghost" data-review-index="${index}">${item.needsDeepDiagnosis ? "查看错题过程诊断" : "查看记录"}</button>
  </article>`).join("");
  shell("整卷诊断报告", `${loopProgress("diagnosis")}
  <section class="panel product-dashboard">
    <div class="dashboard-head">
      <div>
        <span class="badge ${submission.status === "diagnosis_complete" ? "" : "warn"}">${escapeHtml(submission.status)}</span>
        <h2>${escapeHtml(summary.paperName || submission.paperName || "本次整卷")}</h2>
        <p>${escapeHtml(summary.comment || "系统已完成整卷统一保存、识别、批改和诊断。")}</p>
      </div>
      <div class="row">
        <button class="primary" data-view="questionReview">进入逐题解析</button>
        <button class="ghost" data-view="knowledgeReview">开始知识点复习</button>
        <button class="ghost" id="startTargetedTraining">开始10题专项训练</button>
      </div>
    </div>
    <div class="metrics">
      <div class="metric"><span>得分</span><strong>${summary.totalScore}/${summary.totalMax}</strong></div>
      <div class="metric"><span>得分率</span><strong>${summary.scoreRate}%</strong></div>
      <div class="metric"><span>正确/错误/未答</span><strong>${summary.correctCount}/${summary.wrongCount}/${summary.unansweredCount}</strong></div>
      <div class="metric"><span>能力等级</span><strong>${escapeHtml(summary.level)}</strong></div>
    </div>
  </section>
  <section class="panel"><h2>批改状态</h2><div class="grading-steps">${(submission.gradingStatusHistory || []).map((item, index) => `<div class="grading-step active"><span>${index + 1}</span><strong>${escapeHtml(item.status)}</strong></div>`).join("")}</div></section>
  <section class="panel"><h2>各题型得分</h2><div class="cards">${typeRows}</div></section>
  <section class="panel"><h2>各章节掌握度</h2><div class="cards">${chapterRows}</div></section>
  <section class="panel"><h2>知识点掌握度</h2><div class="cards">${knowledgeRows}</div></section>
  <section class="panel"><h2>错误类型分布</h2><div class="cards">${errors}</div></section>
  <section class="panel"><h2>能力诊断</h2><div class="ability-grid">${abilities}</div></section>
  <section class="panel"><h2>最严重的三个问题</h2><div class="cards">${problems || "<p class='mode-help'>本卷暂无高严重度问题。</p>"}</div></section>
  <section class="panel"><h2>推荐学习任务</h2><div class="cards">${tasks}</div></section>
  <section class="panel"><h2>错题与逐题入口</h2><div class="cards">${questions}</div></section>`);
  document.querySelectorAll("[data-review-index]").forEach((button) => {
    button.onclick = () => {
      state.reviewQuestionIndex = Number(button.dataset.reviewIndex);
      localStorage.setItem("reviewQuestionIndex", String(state.reviewQuestionIndex));
      setView("questionReview");
    };
  });
  document.querySelectorAll("[data-error-training-source]").forEach((button) => {
    button.onclick = () => {
      state.trainingSourceQuestionId = button.dataset.errorTrainingSource;
      localStorage.setItem("trainingSourceQuestionId", state.trainingSourceQuestionId);
      state.trainingBatch = null;
      setView("similarTraining");
    };
  });
  const startTargetedTraining = $("#startTargetedTraining");
  if (startTargetedTraining) startTargetedTraining.onclick = async () => {
    const sourceQuestionId = (report.questionAnalyses || []).find((item) => item.needsDeepDiagnosis)?.questionId || "";
    state.trainingSourceQuestionId = sourceQuestionId;
    localStorage.setItem("trainingSourceQuestionId", sourceQuestionId);
    const created = await api("/api/training-batches", {
      method: "POST",
      body: JSON.stringify({ studentId: state.student.id, submissionId: submission.id, sourceWrongQuestionId: sourceQuestionId, trainingType: "targeted" })
    });
    state.trainingBatch = created.batch;
    writeFlowState({ trainingRecords: {}, stage: "TARGETED_TRAINING" });
    setView("similarTraining");
  };
}

async function renderQuestionReview() {
  const submission = await ensureLatestSubmission();
  const report = submission?.report;
  const list = report?.questionAnalyses || [];
  if (!list.length) {
    shell("逐题解析", `<section class="panel"><h2>暂无逐题解析</h2><button class="primary" data-view="paperReport">返回整卷报告</button></section>`);
    return;
  }
  const index = Math.max(0, Math.min(list.length - 1, state.reviewQuestionIndex || 0));
  const item = list[index];
  const nav = list.map((q, i) => `<button class="${i === index ? "active" : ""} ${q.finalAnswerCorrect ? "done" : ""}" data-question-index="${i}">${i + 1}</button>`).join("");
  const steps = (item.steps || []).map((step) => `<details class="${stepStatusClass(step.status)}" open>
    <summary><span>步骤 ${step.stepNumber}</span><strong>${escapeHtml(step.judgment)}</strong><em>${step.score}/${step.maxScore} 分</em></summary>
    <p>学生步骤：${escapeHtml(step.studentContent || "未识别到有效步骤")}</p>
    <p>标准/归一表达：${escapeHtml(step.normalizedExpression || "")}</p>
    <p>判断说明：${escapeHtml(step.errorDescription || "")}</p>
    <p>正确修正：${escapeHtml(step.correction || "")}</p>
    <p>涉及知识点：${escapeHtml(step.relatedKnowledgePoint || "")}</p>
  </details>`).join("");
  shell("逐题解析", `<section class="panel progress-panel"><div class="question-dots">${nav}</div></section>
  <section class="panel analysis-card">
    <div class="analysis-head">
      <h3>第 ${index + 1} 题 · ${escapeHtml(item.typeLabel)}</h3>
      <span class="badge ${item.finalAnswerCorrect ? "" : "bad"}">${item.score}/${item.maxScore} 分</span>
    </div>
    <article class="exam-paper text-mode"><p>${renderMathText(item.title)}</p></article>
    <p class="mode-help">${item.needsDeepDiagnosis ? "本题进入错题过程深度诊断：系统优先定位第一处错误步骤、根本原因和后续训练目标。" : "本题答案与过程基本稳定，仅做结果、知识点和用时记录，不生成额外训练。"}</p>
    <div class="result-grid compact">
      <p><span>学生原始答案</span><strong>${renderMathText(item.studentAnswer || "未作答/未识别")}</strong></p>
      <p><span>学生过程</span><strong>${escapeHtml(item.studentSteps || "未识别到可判分过程")}</strong></p>
      <p><span>标准答案</span><strong>${renderMathText(item.standardAnswer || "待校对")}</strong></p>
      <p><span>扣分原因</span><strong>${escapeHtml(item.deductionReason || "无")}</strong></p>
      <p><span>第一处错误</span><strong>${item.firstErrorStep ? `步骤 ${item.firstErrorStep}` : "未发现/待识别"}</strong></p>
      <p><span>知识点</span><strong>${escapeHtml((item.knowledgePoints || []).join("、"))}</strong></p>
      <p><span>相似易错点</span><strong>${escapeHtml((item.errorTypes || []).join("、") || "暂无")}</strong></p>
      <p><span>批改状态</span><strong>${escapeHtml(item.gradingStatus)}</strong></p>
      <p><span>OCR置信度</span><strong>${item.confidenceScore || 0}%</strong></p>
      <p><span>错误层级</span><strong>${escapeHtml(item.errorTag ? `${item.errorTag.knowledgePoint} / ${item.errorTag.subKnowledgePoint} / ${item.errorTag.errorType} / ${item.errorTag.errorPosition}` : "暂无")}</strong></p>
    </div>
  </section>
  <section class="panel"><h2>步骤对照</h2><div class="step-list">${steps}</div></section>
  <section class="panel"><h2>标准解题提示</h2><p class="mode-help">${escapeHtml(item.standardSteps || "该题暂无标准步骤，需教研补充。")}</p><div class="row"><button class="primary" data-view="paperReport">返回整卷报告</button><button class="ghost" id="startQuestionTraining">针对本题错误开始专项训练</button><button class="ghost" data-view="originalRetry">原题重做</button></div></section>`);
  document.querySelectorAll("[data-question-index]").forEach((button) => {
    button.onclick = () => {
      state.reviewQuestionIndex = Number(button.dataset.questionIndex);
      localStorage.setItem("reviewQuestionIndex", String(state.reviewQuestionIndex));
      renderQuestionReview();
    };
  });
  const startQuestionTraining = $("#startQuestionTraining");
  if (startQuestionTraining) startQuestionTraining.onclick = () => {
    state.trainingSourceQuestionId = item.questionId;
    localStorage.setItem("trainingSourceQuestionId", item.questionId);
    state.trainingBatch = null;
    setView("similarTraining");
  };
}

function bindCanvas() {
  const canvas = $("#pad");
  const ctx = canvas.getContext("2d");
  let down = false;
  let currentStroke = [];
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches ? event.touches[0] : event;
    return {
      x: Math.round((source.clientX - rect.left) * canvas.width / rect.width),
      y: Math.round((source.clientY - rect.top) * canvas.height / rect.height),
      t: Date.now() - state.startedAt
    };
  };
  const start = (event) => {
    down = true;
    currentStroke = {
      tool: state.scratchTool,
      color: state.scratchColor,
      width: state.scratchTool === "eraser" ? Math.max(18, state.scratchWidth * 5) : state.scratchWidth,
      points: []
    };
    const p = point(event);
    currentStroke.points.push(p);
    beginStroke(ctx, currentStroke);
    drawPoint(ctx, p);
    event.preventDefault();
  };
  const move = (event) => {
    if (!down) return;
    const p = point(event);
    currentStroke.points.push(p);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    event.preventDefault();
  };
  const end = () => {
    if (!down) return;
    down = false;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (currentStroke.points.length) {
      state.strokes.push(currentStroke);
      state.redoStrokes = [];
      state.strokeCount += 1;
      if (state.trainingCanvasQuestion) saveTrainingDraft(state.trainingCanvasQuestion, { keepEmpty: true, skipImage: true });
      else saveCurrentScratch(state.questions[state.current], { keepEmpty: true, skipImage: true });
    }
  };
  canvas.onmousedown = start;
  canvas.onmousemove = move;
  canvas.onmouseup = end;
  canvas.onmouseleave = end;
  canvas.ontouchstart = start;
  canvas.ontouchmove = move;
  canvas.ontouchend = end;
  redrawCanvas();
}

function beginStroke(ctx, stroke) {
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.globalAlpha = stroke.tool === "highlighter" ? 0.28 : 1;
  ctx.strokeStyle = stroke.color;
  ctx.beginPath();
  const first = stroke.points[0];
  ctx.moveTo(first.x, first.y);
}

function drawPoint(ctx, p) {
  ctx.lineTo(p.x + 0.01, p.y + 0.01);
  ctx.stroke();
}

function redrawCanvas() {
  const canvas = $("#pad");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.strokes.forEach((stroke) => {
    if (!stroke.points?.length) return;
    beginStroke(ctx, stroke);
    stroke.points.forEach((point) => {
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    });
  });
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  const count = $("#strokes");
  if (count) count.textContent = state.strokes.length;
}

async function renderReport() {
  const { report } = await api(`/api/report?studentId=${state.student.id}`);
  shell("报告", `<section class="panel"><div class="metrics">
    <div class="metric"><span>作答题数</span><strong>${report.total}</strong></div>
    <div class="metric"><span>已判分</span><strong>${report.gradableTotal}</strong></div>
    <div class="metric"><span>正确率</span><strong>${report.accuracy}%</strong></div>
    <div class="metric"><span>待识别</span><strong>${report.pending}</strong></div>
  </div></section>
  <section class="panel"><h2>AI查缺补漏</h2><div class="cards">${(report.weakReasons.length ? report.weakReasons : [{ reason: "暂无明显薄弱", count: 0, advice: "继续刷综合题并做间隔复测。" }]).map((w) => `<article class="card"><h3>${escapeHtml(w.reason)} · ${w.count}次</h3><p>${escapeHtml(w.advice)}</p></article>`).join("")}</div></section>`);
}

async function renderPastExams() {
  const data = state.pastExamSources || await api("/api/past-exam-sources");
  const trusted = (data.trustedSources || []).flatMap((source) => (source.items || []).map((item) => ({ ...item, site: source.site })));
  const candidates = data.candidateSourcesNeedReview || [];
  const localSources = data.localSources || [];
  shell("真题库", `<section class="panel">
    <div class="metrics">
      <div class="metric"><span>已登记来源</span><strong>${trusted.length}</strong></div>
      <div class="metric"><span>候选来源</span><strong>${candidates.length}</strong></div>
      <div class="metric"><span>已导入结构化真题</span><strong>${Number(data.importedQuestionCount || 0)}</strong></div>
      <div class="metric"><span>状态</span><strong>待OCR校对</strong></div>
    </div>
  </section>
  <section class="panel">
    <h2>已登记真题来源</h2>
    <div class="cards">${trusted.map((item, index) => `<article class="card">
      <h3>${escapeHtml(item.year)} · ${escapeHtml(item.mathType)}</h3>
      <p>${escapeHtml(item.title)}</p>
      <p>来源：${escapeHtml(item.site)}；格式：${escapeHtml(item.format)}；状态：${escapeHtml(item.importStatus)}</p>
      <div class="row">
        <button class="primary" data-paper-index="${index}">开始原卷刷题</button>
        <a class="ghost link-button" href="${escapeHtml(item.url)}" target="_blank">打开来源</a>
      </div>
    </article>`).join("") || "<p>暂无已登记来源。</p>"}</div>
  </section>
  <section class="panel">
    <h2>本地原页资料</h2>
    <div class="cards">${localSources.map((item) => `<article class="card">
      <h3>${escapeHtml(item.title)}</h3>
      <p>来源：${escapeHtml(item.site)}；范围：${escapeHtml(item.year || "")}${item.mathType ? `；${escapeHtml(item.mathType)}` : ""}</p>
      <p>${escapeHtml(item.description || "原页资料可供浏览，结构化题目需审核后发布。")}</p>
      <div class="row"><a class="primary link-button" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">打开原页预览</a></div>
    </article>`).join("") || "<p>暂无本地原页资料。</p>"}</div>
  </section>
  <section class="panel">
    <h2>说明</h2>
    <p>这里先提供原卷电子刷题：学生直接看真实来源页面做整张卷。要进入“单题刷题、自动判章节、自动给错因”，还需要把图片版真题 OCR 后人工校对成题干、选项、答案和解析。</p>
  </section>`);
  document.querySelectorAll("[data-paper-index]").forEach((button) => {
    button.onclick = () => {
      state.paperExam = trusted[Number(button.dataset.paperIndex)];
      resetScratch();
      setView("paperExam");
    };
  });
}

function renderPaperExam() {
  if (!state.paperExam) {
    setView("pastExams");
    return;
  }
  const item = state.paperExam;
  shell("真题原卷刷题", `<section class="panel paper-head">
    <div>
      <p><span class="badge">真实来源</span> <span class="badge warn">${escapeHtml(item.format)}</span></p>
      <h2>${escapeHtml(item.year)} · ${escapeHtml(item.mathType)} · ${escapeHtml(item.title)}</h2>
      <p>来源：${escapeHtml(item.site)}。原卷模式不会改写题目内容，适合先整卷练习；结构化切题后可进入单题刷题。</p>
    </div>
    <div class="row">
      <a class="primary link-button" href="${escapeHtml(item.url)}" target="_blank">新窗口打开原卷</a>
      <button class="ghost" data-view="pastExams">返回真题库</button>
    </div>
  </section>
  <section class="paper-layout">
    <article class="panel paper-frame">
      <iframe src="${escapeHtml(item.url)}" title="${escapeHtml(item.title)}"></iframe>
    </article>
    <article class="panel scratch-panel">
      <div class="scratch-head">
        <div>
          <h3>原卷做题空间</h3>
          <p>这一版先用于整卷练习记录。网页如果禁止嵌入，请点“新窗口打开原卷”，做题空间仍可使用。</p>
        </div>
        <div class="row">
          <button class="primary" id="savePaper">保存本卷记录</button>
        </div>
      </div>
      ${renderPadToolbar()}
      <div class="paper-stage">
        <canvas id="pad" width="1600" height="980"></canvas>
      </div>
      <p class="badge">书写笔画：<span id="strokes">${state.strokeCount}</span> 次</p>
    </article>
  </section>`);
  const clearPad = $("#clearPad");
  if (clearPad) clearPad.onclick = () => { resetScratch(); renderPaperExam(); };
  const savePaper = $("#savePaper");
  if (savePaper) savePaper.onclick = () => {
    alert(`已保存本卷练习记录：${item.year} · ${item.mathType}。当前版本保存做题空间轨迹，后续接入 OCR 后可拆成单题诊断。`);
  };
  bindPadToolbar();
  bindCanvas();
}

async function renderCollection() {
  const { items } = await api(`/api/collection?studentId=${state.student.id}`);
  const loop = await loadLoop();
  state.collectionItems = items.filter((item) => item.question);
  const pending = state.collectionItems.filter(({ attempt }) => ["pending_recognition", "pending_answer_review", "recognition_error"].includes(attempt.gradingStatus)).length;
  const wrong = state.collectionItems.filter(({ attempt }) => attempt.correct === false).length;
  const mastered = state.collectionItems.filter(({ attempt }) => attempt.correct === true).length;
  const reasonCounts = {};
  state.collectionItems.forEach(({ attempt }) => {
    if (!["已掌握", "待识别"].includes(attempt.reason)) reasonCounts[attempt.reason] = (reasonCounts[attempt.reason] || 0) + 1;
  });
  const weak = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "暂无";
  const rows = state.collectionItems.map(({ question, attempt, times }, index) => {
    const status = attempt.gradingStatus === "pending_answer_review"
      ? "答案待校对"
      : attempt.gradingStatus === "pending_recognition"
        ? "待识别"
        : attempt.gradingStatus === "recognition_error"
          ? "识别失败"
          : attempt.gradingStatus === "ai_reviewed"
            ? (attempt.correct ? "AI已掌握" : "AI建议二刷")
            : attempt.correct
              ? "已掌握"
              : "需二刷";
    const badge = attempt.correct === false ? "bad" : (attempt.correct === true ? "" : "warn");
    return `<tr>
      <td>${index + 1}</td>
      <td><span class="badge ${badge}">${status}</span></td>
      <td>${escapeHtml(question.chapterName)}<br><small>${escapeHtml(question.point)}</small></td>
      <td>${question.stemImage ? `<img class="collection-thumb" src="${escapeHtml(question.stemImage)}" alt="${escapeHtml(question.stem)}">` : renderMathText(question.stem)}</td>
      <td>${times}刷</td>
      <td>${escapeHtml(attempt.reason)}</td>
    </tr>`;
  }).join("");
  shell("做题集", `<section class="panel">
    <div class="metrics">
      <div class="metric"><span>合集题数</span><strong>${state.collectionItems.length}</strong></div>
      <div class="metric"><span>需二刷</span><strong>${wrong}</strong></div>
      <div class="metric"><span>待识别/校对</span><strong>${pending}</strong></div>
      <div class="metric"><span>主要薄弱</span><strong>${escapeHtml(weak)}</strong></div>
    </div>
  </section>
  <section class="panel">
    <div class="row">
      <button class="primary" id="redoCollection" ${state.collectionItems.length ? "" : "disabled"}>开始二刷做题集</button>
      <button class="ghost" data-view="chapters">继续章节训练</button>
    </div>
  </section>
  <section class="panel">
    <h2>合集清单</h2>
    ${state.collectionItems.length ? `<div class="table-wrap"><table class="collection-table"><thead><tr><th>#</th><th>状态</th><th>来源</th><th>题目</th><th>次数</th><th>错因</th></tr></thead><tbody>${rows}</tbody></table></div>` : "<p>暂无做题记录。</p>"}
  </section>`);
  const redo = $("#redoCollection");
  $("#view").insertAdjacentHTML("afterbegin", `<section class="panel">
    <h2>错题学习状态</h2>
    <div class="status-filter">
      <span class="badge warn">待诊断 ${loop.homeCounters?.reviewPending || 0}</span>
      <span class="badge">待复习 ${loop.homeCounters?.reviewPending || 0}</span>
      <span class="badge warn">训练中 ${loop.homeCounters?.trainingPending || 0}</span>
      <span class="badge bad">待重做 ${loop.homeCounters?.retryPending || 0}</span>
      <span class="badge">已攻克 ${loop.homeCounters?.conquered || 0}</span>
      <span class="badge warn">仍需巩固 ${loop.homeCounters?.needsReinforcement || 0}</span>
    </div>
    <div class="cards" style="margin-top:14px">
      <article class="status-card">
        <h3>${escapeHtml(loop.originalRetry?.stem || "最近错题")}</h3>
        <p>错误步骤：${escapeHtml(loop.comparisonReport?.firstErrorStep || loop.improvement?.originalError || "待诊断")}</p>
        <p>薄弱知识点：${escapeHtml((loop.diagnosis?.weakKnowledgePoints || []).join("、"))}</p>
        <p>当前状态：${escapeHtml(loop.recoveryPath?.currentStage || "DIAGNOSED")}</p>
        <div class="actions">
          <button class="primary" data-view="knowledgeReview">开始复习</button>
          <button class="ghost" data-view="similarTraining">继续训练</button>
          <button class="ghost" data-view="originalRetry">重新挑战</button>
          <button class="ghost" data-view="improvement">查看攻克过程</button>
        </div>
      </article>
    </div>
  </section>`);
  document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => setView(button.dataset.view));
  if (redo) redo.onclick = () => {
    state.questions = state.collectionItems.map(({ question }) => question);
    const collectionChapterIds = Array.from(new Set(state.questions.map((question) => question.chapterId).filter(Boolean)));
    setPracticeChapterSelection(collectionChapterIds);
    setPracticeType("wrong");
    state.responses = {};
    state.lastResults = null;
    state.current = 0;
    state.practiceSessionActive = true;
    resetScratch();
    setView("practice");
  };
}

async function loadLoop() {
  const demo = localStorage.getItem("demoMode") === "1" ? "&demo=1" : "";
  const data = await api(`/api/learning-loop?studentId=${state.student.id}${demo}`);
  state.loop = data.loop;
  return data.loop;
}

function loopProgress(active) {
  // The learning loop remains available to the diagnostic engine, but is intentionally hidden from the student-facing navigation.
  return "";
}

function stepStatusClass(status) {
  return status === "correct" ? "step-ok" : status === "partial" ? "step-partial" : status === "alternative" ? "step-alt" : status === "blank" ? "step-blank" : "step-bad";
}

async function renderDiagnosis() {
  const loop = await loadLoop();
  const attempts = loop.diagnosis.questionAnalyses || [];
  const cards = attempts.map((item, index) => `<article class="analysis-card">
    <div class="analysis-head">
      <h3>第 ${index + 1} 题 · ${escapeHtml(item.typeLabel)}</h3>
      <span class="badge ${item.finalAnswerCorrect ? "" : "bad"}">${item.score}/${item.maxScore} 分</span>
    </div>
    <p class="stem">${renderMathText(item.title)}</p>
    <div class="result-grid compact">
      <p><span>学生答案</span><strong>${renderMathText(item.studentAnswer || "未作答")}</strong></p>
      <p><span>正确答案</span><strong>${item.finalAnswerCorrect ? renderMathText(item.standardAnswer || "待校对") : "完成复习与相似题训练后解锁"}</strong></p>
      <p><span>错误类型</span><strong>${escapeHtml(item.errorTypes.join("、") || "无")}</strong></p>
      <p><span>知识点</span><strong>${escapeHtml(item.knowledgePoints.join("、"))}</strong></p>
    </div>
    ${item.steps?.length ? `<div class="step-list">${item.steps.map((step) => `<details class="${stepStatusClass(step.status)}" ${step.status !== "correct" ? "open" : ""}>
      <summary><span>步骤 ${step.stepNumber}</span><strong>${escapeHtml(step.judgment)}</strong><em>${step.score}/${step.maxScore} 分</em></summary>
      <p>学生内容：${escapeHtml(step.studentContent)}</p>
      <p>AI识别：${escapeHtml(step.normalizedExpression)}</p>
      <p>问题说明：${escapeHtml(step.errorDescription)}</p>
      <p>下一步建议：${item.finalAnswerCorrect ? escapeHtml(step.correction) : "先复习对应知识点，再通过理解检查和相似题训练。此处不直接展示完整解法。"}</p>
      <p>对应知识点：${escapeHtml(step.relatedKnowledgePoint)}</p>
    </details>`).join("")}</div>` : ""}
  </article>`).join("");
  shell("AI诊断", `${loopProgress("diagnosis")}
  <section class="panel">
    <div class="metrics">
      <div class="metric"><span>本次得分</span><strong>${loop.diagnosis.score}</strong></div>
      <div class="metric"><span>正确率</span><strong>${loop.diagnosis.accuracy}%</strong></div>
      <div class="metric"><span>薄弱知识点</span><strong>${loop.diagnosis.weakKnowledgePoints.length}</strong></div>
      <div class="metric"><span>需训练能力</span><strong>${loop.trainingPlan.totalQuestions}</strong></div>
    </div>
  </section>
  <section class="panel diagnosis-summary">
    <h2>AI诊断摘要</h2>
    <p>${escapeHtml(loop.diagnosis.summary)}</p>
    <div class="row">
      <button class="primary" data-view="knowledgeReview">开始复习知识点</button>
      <button class="ghost" data-view="profile">查看能力画像</button>
      <button class="ghost" data-view="report">查看历史报告</button>
    </div>
  </section>
  <section class="panel"><h2>逐题步骤分析</h2><div class="cards">${cards}</div></section>`);
}

function flowStoreKey() {
  return `mistakeFlow:${state.student.id}:${localStorage.getItem("demoMode") === "1" ? "demo" : "real"}`;
}

function readFlowState() {
  return JSON.parse(localStorage.getItem(flowStoreKey()) || "{}");
}

function writeFlowState(next) {
  localStorage.setItem(flowStoreKey(), JSON.stringify({ ...readFlowState(), ...next }));
}

async function renderKnowledgeReview() {
  const loop = await loadLoop();
  const review = loop.reviewModule;
  const stateFlow = readFlowState();
  shell("知识点复习", `${loopProgress("review")}
  <section class="panel">
    <h2>${escapeHtml(review.title)}</h2>
    <p class="mode-help">${escapeHtml(review.relationToMistake)}</p>
    <div class="formula-grid">
      ${(review.formulas || []).map((item) => `<article class="formula-card"><span>关键公式</span><strong>${renderMathText(item)}</strong></article>`).join("")}
    </div>
  </section>
  <section class="panel review-layout">
    <article class="card"><h3>核心概念</h3><p>${escapeHtml(review.coreConcept)}</p></article>
    <article class="card"><h3>使用条件</h3><p>${escapeHtml(review.conditions)}</p></article>
    <article class="card"><h3>常见错误</h3><ul>${(review.commonMistakes || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></article>
    <article class="card"><h3>正确示例</h3><p>${escapeHtml(review.correctExample)}</p></article>
    <article class="card"><h3>错误示例</h3><p>${escapeHtml(review.wrongExample)}</p></article>
    <article class="card"><h3>本次复习策略</h3><p>${escapeHtml(review.strategy)}</p></article>
  </section>
  <section class="panel">
    <h2>自我确认</h2>
    <label class="check-row"><input id="reviewConfirm" type="checkbox" ${stateFlow.reviewDone ? "checked" : ""}> 我能说清这个知识点和本题错误的关系</label>
    <div class="row"><button class="primary" id="finishReview">进入理解检查</button><button class="ghost" data-view="diagnosis">返回诊断</button></div>
  </section>`);
  const finish = $("#finishReview");
  if (finish) finish.onclick = () => {
    if (!$("#reviewConfirm").checked) return alert("请先确认你能说清知识点与本题错误的关系。");
    writeFlowState({ reviewDone: true, stage: "CHECKING_UNDERSTANDING" });
    setView("understandingCheck");
  };
}

async function renderUnderstandingCheck() {
  const loop = await loadLoop();
  const check = loop.understandingCheck;
  const stateFlow = readFlowState();
  const picked = stateFlow.checkAnswer || "";
  shell("理解检查", `${loopProgress("check")}
  <section class="panel">
    <h2>先确认理解，再进入相似题训练</h2>
    <p class="mode-help">${escapeHtml(check.purpose)}</p>
    <article class="card">
      <h3>${escapeHtml(check.question)}</h3>
      <div class="option-strip">${check.options.map((opt) => `<button class="${picked === opt.key ? "active" : ""}" data-check-answer="${opt.key}">${escapeHtml(opt.key)}. ${escapeHtml(opt.text)}</button>`).join("")}</div>
    </article>
  </section>
  <section class="panel">
    <h2>检查结果</h2>
    <p>${picked ? escapeHtml(picked === check.answer ? check.passFeedback : check.failFeedback) : "请选择一个答案。系统不会在你理解前直接进入相似题训练。"}</p>
    <div class="row">
      <button class="primary" id="continueAfterCheck" ${picked === check.answer ? "" : "disabled"}>进入相似题训练</button>
      <button class="ghost" data-view="knowledgeReview">返回知识点复习</button>
    </div>
  </section>`);
  document.querySelectorAll("[data-check-answer]").forEach((button) => {
    button.onclick = () => {
      const correct = button.dataset.checkAnswer === check.answer;
      writeFlowState({ checkAnswer: button.dataset.checkAnswer, checkPassed: correct, stage: correct ? "TRAINING" : "REVIEWING" });
      renderUnderstandingCheck();
    };
  });
  const next = $("#continueAfterCheck");
  if (next) next.onclick = () => setView("similarTraining");
}

async function renderSimilarTraining() {
  const loop = await loadLoop();
  const training = loop.similarTraining || { levels: loop.trainingPlan.items || [] };
  const stateFlow = readFlowState();
  const done = stateFlow.trainingDone || {};
  const levels = training.levels || [];
  const cards = levels.map((item, index) => `<article class="training-task">
    <div><span class="badge">${escapeHtml(item.level || item.type)}</span><h3>${index + 1}. ${escapeHtml(item.title)}</h3></div>
    <p>${renderMathText(item.stem || item.purpose)}</p>
    <p><strong>目标：</strong>${escapeHtml(item.target || item.knowledgePoint)} ${item.hint ? ` · 提示：${escapeHtml(item.hint)}` : ""}</p>
    <p><strong>反馈：</strong>${escapeHtml(item.feedback || "答错时先给分层提示，不立即展示完整答案。")}</p>
    <button class="ghost" data-complete-training="${index}">${done[index] ? "已完成" : "标记本题通过"}</button>
  </article>`).join("");
  const completed = Object.keys(done).length;
  const canRetry = completed >= Math.min(2, levels.length);
  shell("相似题训练", `${loopProgress("training")}
  <section class="panel">
    <h2>${escapeHtml(training.goal || loop.trainingPlan.goal)}</h2>
    <div class="metrics">
      <div class="metric"><span>训练层级</span><strong>${levels.length}</strong></div>
      <div class="metric"><span>已通过</span><strong>${completed}</strong></div>
      <div class="metric"><span>提示使用</span><strong>${stateFlow.hintsUsed || 0}</strong></div>
      <div class="metric"><span>完成标准</span><strong>${canRetry ? "可重做" : "未达标"}</strong></div>
    </div>
  </section>
  <section class="panel"><h2>由易到难训练</h2><div class="cards">${cards}</div><div class="row"><button class="ghost" id="useHint">使用一级提示</button><button class="primary" id="goRetry" ${canRetry ? "" : "disabled"}>回到原错题重做</button><button class="ghost" data-view="knowledgeReview">重新复习</button></div></section>`);
  document.querySelectorAll("[data-complete-training]").forEach((button) => {
    button.onclick = () => {
      const nextDone = { ...done, [button.dataset.completeTraining]: true };
      writeFlowState({ trainingDone: nextDone, stage: "WAITING_FOR_RETRY" });
      renderSimilarTraining();
    };
  });
  const hint = $("#useHint");
  if (hint) hint.onclick = () => {
    writeFlowState({ hintsUsed: Number(stateFlow.hintsUsed || 0) + 1 });
    renderSimilarTraining();
  };
  const retry = $("#goRetry");
  if (retry) retry.onclick = () => setView("originalRetry");
}

function hasCompleteTrainingBatch(batch) {
  const total = Number(batch?.total || batch?.questionCount || 0);
  return Boolean(batch && total > 0 && Array.isArray(batch.questions) && batch.questions.length === total
    && batch.questions.every((question) => String(question.stem || "").trim().length >= 2
      && !/静态演示|占位|围绕某错误|题目生成中|请先作答|placeholder/i.test(question.stem)));
}

function trainingRecordFor(question) {
  return readFlowState().trainingRecords?.[question.id] || {};
}

function loadTrainingScratch(question) {
  const record = trainingRecordFor(question);
  state.strokes = Array.isArray(record.strokes) ? record.strokes : [];
  state.strokeCount = state.strokes.length || Number(record.strokeCount || 0);
  state.redoStrokes = [];
  state.startedAt = Date.now() - Number(record.durationMs || 0);
}

function saveTrainingDraft(question, options = {}) {
  if (!question) return false;
  const flow = readFlowState();
  const records = { ...(flow.trainingRecords || {}) };
  const previous = records[question.id] || {};
  const canvas = $("#pad");
  const next = {
    ...previous,
    questionId: question.id,
    strokes: state.strokes,
    strokeCount: state.strokeCount,
    durationMs: Date.now() - state.startedAt
  };
  if (options.fields) Object.assign(next, options.fields);
  if (canvas && state.strokeCount && !options.skipImage) next.scratchImage = canvas.toDataURL("image/png");
  records[question.id] = next;
  writeFlowState({ trainingRecords: records, trainingBatchId: state.trainingBatch?.id || flow.trainingBatchId });
  return true;
}

function trainingOptionValue(option) {
  return String(option || "").replace(/^[A-D][.、]\s*/i, "").trim();
}

function renderTrainingAnswerControls(question, record, locked = false) {
  const questionType = question.questionType || question.type;
  if (questionType === "choice") {
    const options = questionModel?.choiceOptions
      ? questionModel.choiceOptions(question)
      : (question.options || []).map((option, index) => ({ key: String.fromCharCode(65 + index), text: trainingOptionValue(option), raw: option }));
    const picked = questionModel?.choiceAnswerKey
      ? questionModel.choiceAnswerKey(question, record.selectedOption || record.answer || "")
      : String(record.selectedOption || record.answer || "");
    return `<div class="training-choices ${locked ? "locked" : ""}">${options.map((option) => {
      const text = option.text || trainingOptionValue(option.raw);
      return `<button class="training-choice ${picked === option.key ? "active" : ""}" data-training-choice="${escapeHtml(option.key)}" ${locked ? "disabled aria-disabled=\"true\"" : ""}>${escapeHtml(option.key)}. ${renderMathText(text)}</button>`;
    }).join("")}</div>`;
  }
  if (questionType === "fill") {
    return `<label class="training-fill">答案<input id="trainingAnswer" value="${escapeHtml(record.answer || "")}" placeholder="填写最终结果" ${locked ? "disabled aria-disabled=\"true\"" : ""}></label>`;
  }
  return `<div class="training-writing">
    <div class="paper-stage"><canvas id="pad" width="1800" height="1120"></canvas></div>
    <div class="training-pad-actions"><button class="ghost" id="trainingClear" ${locked ? "disabled" : ""}>清空</button><button class="ghost" id="trainingUndo" ${locked ? "disabled" : ""}>撤销</button><button class="ghost" id="trainingRedo" ${locked ? "disabled" : ""}>重做</button></div>
  </div>`;
}

function trainingFeedback(question, record) {
  if (!record.submitted && !record.locked) return "";
  const status = record.correct === true ? "本题正确" : record.correct === false ? "本题需要复盘" : "已提交，主观过程等待 OCR/AI 识别";
  const cls = record.correct === true ? "good" : record.correct === false ? "bad" : "pending";
  const reveal = record.reveal || {};
  const solution = reveal.solution || {};
  const steps = Array.isArray(solution.steps) ? solution.steps : [];
  return `<section class="training-feedback ${cls}">
    <h3>${status}</h3>
    <p><strong>标准答案：</strong>${renderMathText(reveal.standardAnswer || reveal.answer || "待校对")}</p>
    <p><strong>考查知识点：</strong>${escapeHtml(reveal.knowledgePoint || question.knowledgePoint || question.subKnowledgePoint || "")}</p>
    <p><strong>解题思路：</strong>${renderMathText(reveal.explanation || solution.preAnalysis || solution.methodSummary || "")}</p>
    <div class="training-solution-steps">${steps.map((step) => `<p><strong>${escapeHtml(step.title || `步骤${step.order || ""}`)}：</strong>${renderMathText(step.content || "")}</p>`).join("")}</div>
    <p><strong>易错点：</strong>${escapeHtml(question.sourceErrorType || "")}</p>
  </section>`;
}

async function submitTrainingQuestion(batch, question) {
  const currentRecord = trainingRecordFor(question);
  if (currentRecord.submitted || currentRecord.locked) return;
  saveTrainingDraft(question, { fields: {}, keepEmpty: true });
  const draft = trainingRecordFor(question);
  const hasAnswer = Boolean(draft.answer || draft.selectedOption || draft.formulaText || draft.stepsText || draft.strokeCount || draft.scratchImage);
  if (!hasAnswer) {
    alert("请先完成本题，再提交本题记录。");
    return;
  }
  const res = await api("/api/training-records", {
    method: "POST",
    body: JSON.stringify({
      trainingBatchId: batch.id,
      trainingQuestionId: question.id,
      answer: draft.answer || draft.selectedOption || draft.formulaText || "",
      selectedOption: draft.selectedOption || "",
      formulaText: draft.formulaText || "",
      stepsText: draft.stepsText || "",
      scratchImage: draft.scratchImage || "",
      strokeCount: draft.strokeCount || 0,
      durationMs: draft.durationMs || 0,
      hintLevelUsed: Number(draft.hintLevelUsed || 0)
    })
  });
  const flow = readFlowState();
  writeFlowState({
    trainingRecords: { ...(flow.trainingRecords || {}), [question.id]: { ...draft, ...res.record, submitted: true, locked: true } },
    trainingBatchId: batch.id,
    stage: "TARGETED_TRAINING"
  });
  state.trainingBatch = res.batch;
  if (res.warning) alert(res.warning);
  renderSimilarTrainingV2();
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
  let latestFlow = readFlowState();
  let records = latestFlow.trainingRecords || {};
  try {
    const remote = await api(`/api/training-records?studentId=${encodeURIComponent(state.student.id)}&trainingBatchId=${encodeURIComponent(batch.id)}`);
    const remoteRecords = Object.fromEntries((remote.records || []).map((record) => [record.trainingQuestionId, record]));
    records = { ...records, ...remoteRecords };
    if (Object.keys(remoteRecords).length) writeFlowState({ trainingRecords: records, trainingBatchId: batch.id });
    latestFlow = readFlowState();
  } catch (error) {
    // 本地静态演示或旧服务端没有该接口时，继续使用本地草稿。
  }
  const total = Number(batch.total || batch.questionCount);
  const index = Math.max(0, Math.min(total - 1, Number(latestFlow.trainingIndex || 0)));
  const question = batch.questions[index];
  const record = records[question.id] || {};
  const questionType = question.questionType || question.type;
  const submitted = Boolean(record.submitted || record.locked);
  state.trainingCanvasQuestion = questionType === "subjective" || questionType === "solution" ? question : null;
  loadTrainingScratch(question);
  const completed = Object.values(records).filter((item) => item.submitted || item.locked).length;
  const progress = Math.round(completed / total * 100);
  const isLast = index === total - 1;
  const purpose = question.trainingPurpose || (index < 10 ? "当前最严重错误专项" : "综合巩固");
  const requestedTotal = Number(batch.requestedCount || total);
  const shortageNotice = Number(batch.shortage || 0) > 0
    ? `<div class="notice warning">当前已审核题库提供 ${total}/${requestedTotal} 题，本轮不会用未审核或生成题补足；管理员补齐标注后可重新生成。</div>`
    : "";
  shell("相似题训练", `<section class="panel similar-training-page">
    <div class="similar-training-head">
      <div><span class="badge">${escapeHtml(purpose)}</span><h2>第 ${index + 1} 题 / 共 ${total} 题</h2><p>${escapeHtml(question.typeLabel || (questionType === "choice" ? "选择题" : questionType === "fill" ? "填空题" : "解答题"))} · 难度 ${question.difficultyLevel || question.difficulty || ""} · ${escapeHtml(question.knowledgePoint || question.subKnowledgePoint || "")}</p></div>
      <div class="training-progress"><strong>${progress}%</strong><span>已提交 ${completed}/${total}</span><i><b style="width:${progress}%"></b></i></div>
    </div>
    <article class="training-question">
      <div class="training-question-number">题目 ${index + 1}</div>
      <div class="training-stem">${renderMathText(question.stem)}</div>
      ${question.formula ? `<div class="training-formula">${renderMathText(question.formula)}</div>` : ""}
      ${renderTrainingAnswerControls(question, record, submitted)}
    </article>
    ${shortageNotice}
    ${trainingFeedback(question, record)}
    <div class="training-navigation">
      <button class="ghost" id="trainingPrev" ${index === 0 ? "disabled" : ""}>上一题</button>
      <button class="ghost" id="trainingSave" ${submitted ? "disabled" : ""}>暂存</button>
      <button class="primary" id="trainingSubmitQuestion" ${submitted ? "disabled" : ""}>${submitted ? "已提交本题" : "提交本题"}</button>
      <button class="ghost" id="trainingNext" ${isLast || !submitted ? "disabled" : ""}>下一题</button>
      <button class="primary" id="trainingSubmitBatch" ${completed < total ? "disabled" : ""}>提交本轮训练</button>
    </div>
  </section>
  <section class="panel training-batch-actions">
    ${batch.trainingType === "targeted" ? `<button class="ghost" id="createComprehensive">生成20题综合训练</button>` : ""}
    <button class="ghost" id="goRetry" ${completed >= total ? "" : "disabled"}>进入复测与原题重做</button>
  </section>`);

  const saveCurrent = () => {
    if (submitted) return;
    const fields = {};
    if (questionType === "choice") {
      fields.selectedOption = document.querySelector(".training-choice.active")?.dataset.trainingChoice || "";
      fields.answer = fields.selectedOption;
    }
    if (questionType === "fill") fields.answer = $("#trainingAnswer")?.value.trim() || "";
    saveTrainingDraft(question, { fields, keepEmpty: true });
  };
  document.querySelectorAll("[data-training-choice]").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("[data-training-choice]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      saveTrainingDraft(question, { fields: { selectedOption: button.dataset.trainingChoice, answer: button.dataset.trainingChoice }, keepEmpty: true });
    };
  });
  const input = $("#trainingAnswer");
  if (input && !submitted) input.oninput = () => saveTrainingDraft(question, { fields: { answer: input.value }, keepEmpty: true });
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
    const remaining = total - Object.values(readFlowState().trainingRecords || {}).filter((item) => item.submitted || item.locked).length;
    if (remaining) return;
    const ok = await uiConfirm({ title: "提交本轮训练", message: "本轮训练已全部提交，确认结束本轮训练？", confirmText: "确认提交", cancelText: "继续作答" });
    if (ok) { writeFlowState({ trainingCompleted: true, trainingBatchId: batch.id }); alert("本轮训练记录已保存，可进入复测验证掌握情况。"); }
  };
  const clear = $("#trainingClear");
  if (clear) clear.onclick = () => { state.redoStrokes = state.strokes.slice(); state.strokes = []; state.strokeCount = 0; saveTrainingDraft(question, { keepEmpty: true, skipImage: true }); redrawCanvas(); };
  const undo = $("#trainingUndo");
  if (undo) undo.onclick = () => { const stroke = state.strokes.pop(); if (stroke) state.redoStrokes.push(stroke); state.strokeCount = state.strokes.length; saveTrainingDraft(question, { keepEmpty: true, skipImage: true }); redrawCanvas(); };
  const redo = $("#trainingRedo");
  if (redo) redo.onclick = () => { const stroke = state.redoStrokes.pop(); if (stroke) state.strokes.push(stroke); state.strokeCount = state.strokes.length; saveTrainingDraft(question, { keepEmpty: true, skipImage: true }); redrawCanvas(); };
  if ($("#pad") && !submitted) bindCanvas();
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
    <p class="stem">${renderMathText(q.stem)}</p>
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
