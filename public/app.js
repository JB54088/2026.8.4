const APP_CONFIG = window.__APP_CONFIG__ || {};
const API_BASE_URL = String(APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
const APP_BASE_PATH = String(window.__APP_BASE_PATH__ || "").replace(/\/$/, "");
const routeToView = {
  "/": "home",
  "/login": "home",
  "/dashboard": "home",
  "/practice": "practice",
  "/diagnosis": "diagnosis",
  "/review": "knowledgeReview",
  "/similar-training": "similarTraining",
  "/original-retry": "originalRetry",
  "/paper-report": "paperReport",
  "/question-review": "questionReview",
  "/report": "improvement",
  "/ability-profile": "profile"
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
  if (!res.ok) throw new Error(data.error || "è¯·æ±‚å¤±è´¥");
  return data;
}).catch((error) => {
  if (error instanceof TypeError) throw new Error("æœåŠ¡æš‚æ—¶ä¸å¯ç”¨ï¼Œè¯·ç¨åé‡è¯•ã€‚");
  throw error;
});

const trainingModes = {
  foundation: {
    name: "åŸºç¡€è®­ç»ƒ",
    stage: "åŸºç¡€é˜¶æ®µ",
    count: 10,
    difficulty: "mode",
    sourceType: "all",
    description: "æŒ‰ç« èŠ‚è¡¥æ¦‚å¿µã€å…¬å¼ã€åŸºæœ¬è®¡ç®—å’Œå¸¸è§å…¥å£ã€‚",
    difficultyLabel: "1-2æ˜Ÿ åŸºç¡€é¢˜ç»„"
  },
  reinforce: {
    name: "å¼ºåŒ–è®­ç»ƒ",
    stage: "å¼ºåŒ–é˜¶æ®µ",
    count: 20,
    difficulty: "mode",
    sourceType: "all",
    description: "é›†ä¸­å¤„ç†æ˜“é”™ã€ç»¼åˆã€æ–¹æ³•é€‰æ‹©å’Œè®¡ç®—ç¨³å®šæ€§ã€‚",
    difficultyLabel: "3-4æ˜Ÿ å¼ºåŒ–é¢˜ç»„"
  },
  mock: {
    name: "æ¨¡æ‹Ÿè€ƒè¯•",
    stage: "æ¨¡æ‹Ÿè€ƒè¯•",
    count: 20,
    difficulty: "mode",
    sourceType: "all",
    description: "è·¨ç« èŠ‚æ··åˆå‡ºé¢˜ï¼ŒæŒ‰è€ƒè¯•èŠ‚å¥æäº¤å¹¶ç”Ÿæˆè–„å¼±è¯Šæ–­ã€‚",
    difficultyLabel: "1-5æ˜Ÿ æ··åˆé¢˜ç»„"
  }
};

const state = {
  student: JSON.parse(localStorage.getItem("student") || "null"),
  view: routeToView[currentRoutePath()] || localStorage.getItem("view") || "home",
  selectedMathType: localStorage.getItem("selectedMathType") || "æ•°å­¦ä¸€",
  trainingMode: localStorage.getItem("trainingMode") || "reinforce",
  paperExam: null,
  chapters: [],
  pastExamSources: null,
  questions: [],
  collectionItems: [],
  chapterId: "integral",
  questionCount: Number(localStorage.getItem("questionCount") || 20),
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
  ["home", "è®­ç»ƒå…¥å£"],
  ["chapters", "ç« èŠ‚è®­ç»ƒ"],
  ["practice", "åˆ·é¢˜"],
  ["diagnosis", "AIè¯Šæ–­"],
  ["knowledgeReview", "çŸ¥è¯†ç‚¹å¤ä¹ "],
  ["understandingCheck", "ç†è§£æ£€æŸ¥"],
  ["similarTraining", "ç›¸ä¼¼é¢˜è®­ç»ƒ"],
  ["originalRetry", "åŸé¢˜é‡åš"],
  ["masteryVerify", "æŒæ¡éªŒè¯"],
  ["improvement", "æå‡æŠ¥å‘Š"],
  ["profile", "èƒ½åŠ›ç”»åƒ"],
  ["pastExams", "çœŸé¢˜åº“"],
  ["report", "æŠ¥å‘Š"],
  ["collection", "åšé¢˜é›†"]
];
const sourceOptions = [
  ["all", "å…¨éƒ¨é¢˜æº"],
  ["past_exam", "å†å¹´è€ƒç ”æ•°å­¦çœŸé¢˜"],
  ["inhouse_original", "è‡ªç ”åŸåˆ›é¢˜"],
  ["teacher_original", "ç­¾çº¦æ•™å¸ˆåŸåˆ›é¢˜"],
  ["ai_teacher_reviewed", "AIç”Ÿæˆåæ•™å¸ˆå®¡æ ¸å˜å¼é¢˜"]
];
const difficultyOptions = [
  ["mode", "æŒ‰å½“å‰é¢˜ç»„"],
  ["all", "å…¨éƒ¨éš¾åº¦"],
  ["1", "1æ˜Ÿ åŸºç¡€"],
  ["2", "2æ˜Ÿ è®¡ç®—"],
  ["3", "3æ˜Ÿ æ˜“é”™"],
  ["4", "4æ˜Ÿ ç»¼åˆ"],
  ["5", "5æ˜Ÿ æ‹“å±•"]
];

const $ = (selector) => document.querySelector(selector);

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
  state.questionCount = picked.count;
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
  localStorage.setItem("student", JSON.stringify(student));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function uiConfirm({ title = "ç¡®è®¤æ“ä½œ", message = "", confirmText = "ç¡®å®š", cancelText = "å–æ¶ˆ" } = {}) {
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
  return `paperResponses:${state.student.id}:${state.trainingMode}:${state.chapterId}:${state.questionCount}:${state.difficulty}:${state.sourceType}`;
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
  state.pastExamSources = boot.pastExamSources;
  render();
}

function shell(title, body) {
  document.body.classList.toggle("practice-mode", state.view === "practice");
  $("#title").textContent = title;
  $("#sub").textContent = state.student
    ? `${state.student.name} Â· ${state.student.mathType} Â· ${mode().name}`
    : `å…ˆé€‰æ‹©æ•°å­¦ä¸€/äºŒ/ä¸‰ï¼Œå†è¿›å…¥è®­ç»ƒ`;
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

function renderLogin() {
  const mathTypes = ["æ•°å­¦ä¸€", "æ•°å­¦äºŒ", "æ•°å­¦ä¸‰"].map((name) => `<button class="select-card ${state.selectedMathType === name ? "active" : ""}" data-math="${name}">
    <strong>${name}</strong>
    <span>${name === "æ•°å­¦ä¸€" ? "é«˜æ•° + çº¿ä»£ + æ¦‚ç‡ + çº§æ•°/ç©ºé—´" : name === "æ•°å­¦äºŒ" ? "é«˜æ•° + çº¿ä»£ï¼Œå¼ºè°ƒè®¡ç®—ä¸ç»¼åˆ" : "é«˜æ•° + çº¿ä»£ + æ¦‚ç‡ï¼Œåç»ç®¡åº”ç”¨"}</span>
  </button>`).join("");

  shell("é€‰æ‹©è€ƒè¯•ç±»å‹", `<section class="panel entrance">
    <h2>å…ˆç¡®è®¤ä½ åˆ·çš„æ˜¯å“ªä¸€å¥—æ•°å­¦</h2>
    <div class="select-grid">${mathTypes}</div>
  </section>
  <section class="panel">
    <div class="grid two">
      <label>å§“å<input id="name" placeholder="ä¾‹å¦‚ï¼šå°ç‹"></label>
      <label>é‚€è¯·ç <input id="code" placeholder="MATH01 - MATH10"></label>
      <label>ç›®æ ‡åˆ†æ•°<input id="target" type="number" value="120"></label>
      <label>æ¯æ—¥æ—¶é—´<select id="daily"><option value="30">30åˆ†é’Ÿ</option><option selected value="60">60åˆ†é’Ÿ</option><option value="90">90åˆ†é’Ÿ</option></select></label>
    </div>
    <button class="primary wide" id="login">è¿›å…¥ APP</button>
    <p class="badge warn">è¯•ç”¨è´¦å·é‚€è¯·ç ï¼šMATH01 åˆ° MATH10</p>
  </section>`);

  $("#code").closest("label").insertAdjacentHTML("afterend", `<label>æ¼”ç¤ºå¯†ç <input id="password" type="password" placeholder="demo123"></label>`);
  $("#login").insertAdjacentHTML("afterend", `<button class="ghost wide" id="demoLogin">è¿›å…¥æ¼”ç¤ºç³»ç»Ÿ</button><p class="badge">æ¼”ç¤ºè´¦å·ï¼šdemo / demo123ã€‚æ¯ä¸ªæµè§ˆå™¨ä¼šç”Ÿæˆç‹¬ç«‹æ¼”ç¤ºä¼šè¯ã€‚</p>`);

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
    state.view = "home";
    localStorage.setItem("view", "home");
    render();
  };

  $("#demoLogin").onclick = async () => {
    const res = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        demo: true,
        name: $("#name").value || "ç‹åŒå­¦",
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
    state.view = "home";
    localStorage.setItem("view", "home");
    history.replaceState({ view: "home" }, "", `${APP_BASE_PATH}/dashboard`);
    render();
  };
}

async function renderHome() {
  const loop = await loadLoop();
  const demoOn = localStorage.getItem("demoMode") === "1";
  const cards = Object.entries(trainingModes).map(([key, item]) => `<article class="mode-card ${state.trainingMode === key ? "active" : ""}">
    <div>
      <h3>${item.name}</h3>
      <p>${item.description}</p>
      <p class="mode-meta">${item.difficultyLabel} Â· é»˜è®¤ ${item.count} é¢˜</p>
    </div>
    <button class="primary" data-mode="${key}">${key === "foundation" ? "é€‰æ‹©åŸºç¡€é¢˜ç›®" : key === "reinforce" ? "é€‰æ‹©å¼ºåŒ–é¢˜ç›®" : "é€‰æ‹©æ¨¡æ‹Ÿé¢˜ç›®"}</button>
  </article>`).join("");

  shell("è®­ç»ƒå…¥å£", `<section class="panel">
    <div class="metrics">
      <div class="metric"><span>è€ƒè¯•ç±»å‹</span><strong>${state.student.mathType}</strong></div>
      <div class="metric"><span>å½“å‰æ¨¡å¼</span><strong>${mode().name}</strong></div>
      <div class="metric"><span>æœ¬è½®é¢˜é‡</span><strong>${state.questionCount}</strong></div>
      <div class="metric"><span>ä½œç­”æ–¹å¼</span><strong>åšé¢˜ç©ºé—´è¯†åˆ«</strong></div>
    </div>
  </section>
  <section class="panel">
    <h2>é€‰æ‹©è®­ç»ƒæ¨¡å¼</h2>
    <div class="mode-grid">${cards}</div>
  </section>
  <section class="panel note-panel">
    <h2>é¢˜åº“åŸåˆ™</h2>
    <p>çœŸé¢˜åªä¼šæ¥è‡ªå¯è¿½æº¯å¯¼å…¥ï¼Œä¸ç”¨åŸåˆ›é¢˜å†’å……ã€‚å½“å‰å†…ç½®é¢˜å…ˆæŒ‰è€ƒç ”é£æ ¼å®¡æ ¸é¢˜ã€è‡ªç ”é¢˜å’Œæ•™å¸ˆå®¡æ ¸å˜å¼é¢˜åŒºåˆ†ï¼Œåç»­å¯ä»¥æŠŠä½ æˆæƒçš„çœŸé¢˜æ–‡ä»¶æ‰¹é‡å¯¼å…¥ã€‚</p>
  </section>`);

  $("#title").textContent = "è®­ç»ƒå…¥å£";
  $("#view").insertAdjacentHTML("afterbegin", `<section class="panel product-dashboard">
    <div class="dashboard-head">
      <div>
        <span class="badge ${demoOn ? "warn" : ""}">${demoOn ? "äº§å“æ¼”ç¤ºæ¨¡å¼" : "çœŸå®å­¦ç”Ÿæ•°æ®"}</span>
        <h2>AIæ•°å­¦ä¸ªæ€§åŒ–å­¦ä¹ é—­ç¯</h2>
        <p>ä»ä½œç­”ä¸åšé¢˜ç©ºé—´è¯†åˆ«å¼€å§‹ï¼Œå®Œæˆæ‰¹æ”¹ã€é”™å› è¯Šæ–­ã€ä¸“é¡¹è®­ç»ƒã€å˜å¼å¤æµ‹å’Œèƒ½åŠ›ç”»åƒæ›´æ–°ã€‚</p>
      </div>
      <div class="row">
        <button class="primary" data-view="diagnosis">æŸ¥çœ‹AIè¯Šæ–­</button>
        <button class="ghost" id="toggleDemo">${demoOn ? "é€€å‡ºæ¼”ç¤ºæ¨¡å¼" : "è¿›å…¥æ¼”ç¤ºæ¨¡å¼"}</button>
        ${state.student?.isDemo ? `<button class="ghost danger" id="resetDemo">é‡ç½®æ¼”ç¤ºæ•°æ®</button>` : ""}
      </div>
    </div>
    ${loopProgress("assessment")}
  </section>
  <section class="panel">
    <div class="metrics">
      <div class="metric"><span>æœ€è¿‘è¯Šæ–­</span><strongÛ]|æÚ$z{-®éÜj×Ö'’"–CÒ'G&–æ–æu7V&Ö—D&F6‚#îhùKªNiÊÎ‹ÚîŠêŞ{¸3Âö'WGFöãà¢ÂöF—cà¢Â÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'æVÂG&–æ–ærÖ&F6‚Ö7F–öç2#à¢G¶&F6‚çG&–æ–æuG—RÓÓÒ'F&vWFVB"òÆ'WGFöâ6Æ73Ò&v†÷7B"–CÒ&7&VFT6ö×&V†Vç6—fR#îyIşh‰#š){»ÎYŠêŞ{¸3Âö'WGFöãæ¢"'Ğ¢Æ'WGFöâ6Æ73Ò&v†÷7B"–CÒ&võ&WG'’"G¶6ö×ÆWFVBãÒF÷FÂò""¢&F—6&ÆVB'Óî‹ù¾XZ^ZHŞkX¾KˆîXéşš)˜xŞX£Âö'WGFöãà¢Â÷6V7F–öãæ“° ¢6öç7B6fT7W'&VçBÒ‚’Óâ°¢6öç7Bf–VÆG2Ò·Ó°¢–b‡VW7F–öâçVW7F–öåG—RÓÓÒ&6†ö–6R"’f–VÆG2ç6VÆV7FVD÷F–öâÒFö7VÖVçBçVW'•6VÆV7F÷"‚"çG&–æ–ærÖ6†ö–6Ræ7F—fR"“òæFF6WBçG&–æ–æt6†ö–6RÇÂ"#°¢–b‡VW7F–öâçVW7F–öåG—RÓÓÒ&f–ÆÂ"’f–VÆG2æç7vW"ÒB‚"7G&–æ–ætç7vW""“òçfÇVRçG&–Ò‚’ÇÂ"#°¢6fUG&–æ–ætG&gB‡VW7F–öâÂ²f–VÆG2Â¶VWV×G“¢G'VRÒ“°¢Ó°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FF×G&–æ–ærÖ6†ö–6UÒ"’æf÷$V6‚‚†'WGFöâ’Óâ°¢'WGFöâæöæ6Æ–6²Ò‚’Óâ°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FF×G&–æ–ærÖ6†ö–6UÒ"’æf÷$V6‚‚†—FVÒ’Óâ—FVÒæ6Æ74Æ—7Bç&VÖ÷fR‚&7F—fR"’“°¢'WGFöâæ6Æ74Æ—7BæFB‚&7F—fR"“°¢6fUG&–æ–ætG&gB‡VW7F–öâÂ²f–VÆG3¢²6VÆV7FVD÷F–öã¢'WGFöâæFF6WBçG&–æ–æt6†ö–6RÂç7vW#¢'WGFöâæFF6WBçG&–æ–æt6†ö–6RÒÂ¶VWV×G“¢G'VRÒ“°¢Ó°¢Ò“°¢6öç7B–çWBÒB‚"7G&–æ–ætç7vW""“°¢–b†–çWB’–çWBæöæ–çWBÒ‚’Óâ6fUG&–æ–ætG&gB‡VW7F–öâÂ²f–VÆG3¢²ç7vW#¢–çWBçfÇVRÒÂ¶VWV×G“¢G'VRÒ“°¢6öç7BæW‡D–æFW‚Ò†æW‡B’Óâ²6fT7W'&VçB‚“²w&—FTfÆ÷u7FFR‡²G&–æ–æt–æFWƒ¢æW‡BÂG&–æ–æt&F6„–C¢&F6‚æ–BÒ“²&VæFW%6–Ö–Æ%G&–æ–æuc"‚“²Ó°¢6öç7B&WbÒB‚"7G&–æ–æu&Wb"“°¢–b‡&Wb’&Wbæöæ6Æ–6²Ò‚’ÓâæW‡D–æFW‚†–æFW‚Ò“°¢6öç7BæW‡BÒB‚"7G&–æ–ætæW‡B"“°¢–b†æW‡B’æW‡Bæöæ6Æ–6²Ò‚’ÓâæW‡D–æFW‚†–æFW‚²“°¢6öç7B6fRÒB‚"7G&–æ–æu6fR"“°¢–b‡6fR’6fRæöæ6Æ–6²Ò‚’Óâ²6fT7W'&VçB‚“²ÆW'B‚.iÊÎš)[{.i¨.ZÙûÈÎXˆ~hÚ.š)yºîh‰nX‹~ikš^™Ú.YîK¸ŞXúşh.ZHŞ8""“²Ó°¢6öç7B7V&Ö—BÒB‚"7G&–æ–æu7V&Ö—EVW7F–öâ"“°¢–b‡7V&Ö—B’7V&Ö—Bæöæ6Æ–6²Ò‚’Óâ7V&Ö—EG&–æ–æuVW7F–öâ†&F6‚ÂVW7F–öâ“°¢6öç7B7V&Ö—D&F6‚ÒB‚"7G&–æ–æu7V&Ö—D&F6‚"“°¢–b‡7V&Ö—D&F6‚’7V&Ö—D&F6‚æöæ6Æ–6²Ò7–æ2‚’Óâ°¢6fT7W'&VçB‚“°¢6öç7B&VÖ–æ–ærÒF÷FÂÒö&¦V7BçfÇVW2‡&VDfÆ÷u7FFR‚’çG&–æ–æu&V6÷&G2ÇÂ·Ò’æf–ÇFW"‚†—FVÒ’Óâ—FVÒç7V&Ö—GFVB’æÆVæwFƒ°¢6öç7Bö²Òv—BV”6öæf—&Ò‡²F—FÆS¢.hùKªNiÊÎ‹ÚîŠêŞ{¸2"ÂÖW76vS¢&VÖ–æ–ærò‹ùiÈ’G·&VÖ–æ–æwÒ˜>š)iÊ®hùKªNûÈÎiŠşY
nK¸ŞxKnhùKªNiÊÎ‹ÚîŠêŞ{¸>ûÉö¢.iÊÎ‹ÚîŠêŞ{¸>[{.XZ˜:hùKªNûÈÎzîŠêN{¹>iÙşiÊÎ‹ÚîŠêŞ{¸>ûÉò"Â6öæf—&ÕFW‡C¢.zîŠêNhùKªB"Â6æ6VÅFW‡C¢.{º~{ºŞKÙÎzÙB"Ò“°¢–b†ö²’²w&—FTfÆ÷u7FFR‡²G&–æ–æt6ö×ÆWFVC¢G'VRÂG&–æ–æt&F6„–C¢&F6‚æ–BÒ“²ÆW'B‚.iÊÎ‹ÚîŠêŞ{¸>Šë[Ù^[{.KùŞZÙûÈÎXúş‹ù¾XZ^ZHŞkX¾š¨ÎŠøhèÎhúh8^Xk^8""“²Ğ¢Ó°¢6öç7B6ÆV"ÒB‚"7G&–æ–æt6ÆV""“°¢–b†6ÆV"’6ÆV"æöæ6Æ–6²Ò‚’Óâ²7FFRç&VFõ7G&ö¶W2Ò7FFRç7G&ö¶W2ç6Æ–6R‚“²7FFRç7G&ö¶W2ÒµÓ²7FFRç7G&ö¶T6÷VçBÒ²6fUG&–æ–ætG&gB‡VW7F–öâÂ²¶VWV×G“¢G'VRÂ6¶—–ÖvS¢G'VRÒ“²&VG&t6çf2‚“²Ó°¢6öç7BVæFòÒB‚"7G&–æ–æuVæFò"“°¢–b‡VæFò’VæFòæöæ6Æ–6²Ò‚’Óâ²6öç7B7G&ö¶RÒ7FFRç7G&ö¶W2ç÷‚“²–b‡7G&ö¶R’7FFRç&VFõ7G&ö¶W2çW6‚‡7G&ö¶R“²7FFRç7G&ö¶T6÷VçBÒ7FFRç7G&ö¶W2æÆVæwFƒ²6fUG&–æ–ætG&gB‡VW7F–öâÂ²¶VWV×G“¢G'VRÂ6¶—–ÖvS¢G'VRÒ“²&VG&t6çf2‚“²Ó°¢6öç7B&VFòÒB‚"7G&–æ–æu&VFò"“°¢–b‡&VFò’&VFòæöæ6Æ–6²Ò‚’Óâ²6öç7B7G&ö¶RÒ7FFRç&VFõ7G&ö¶W2ç÷‚“²–b‡7G&ö¶R’7FFRç7G&ö¶W2çW6‚‡7G&ö¶R“²7FFRç7G&ö¶T6÷VçBÒ7FFRç7G&ö¶W2æÆVæwFƒ²6fUG&–æ–ætG&gB‡VW7F–öâÂ²¶VWV×G“¢G'VRÂ6¶—–ÖvS¢G'VRÒ“²&VG&t6çf2‚“²Ó°¢–b‚B‚"7B"’’&–æD6çf2‚“°¢6öç7B7&VFT6ö×&V†Vç6—fRÒB‚"67&VFT6ö×&V†Vç6—fR"“°¢–b†7&VFT6ö×&V†Vç6—fR’7&VFT6ö×&V†Vç6—fRæöæ6Æ–6²Ò7–æ2‚’Óâ°¢6öç7B7&VFVBÒv—B’‚"ö’÷G&–æ–ærÖ&F6†W2"Â²ÖWF†öC¢%õ5B"Â&öG“¢¥4ôâç7G&–æv–g’‡²7GVFVçD–C¢7FFRç7GVFVçBæ–BÂ7V&Ö—76–öä–C¢&F6‚ç7V&Ö—76–öä–BÂ6÷W&6Uw&öæuVW7F–öä–C¢&F6‚ç6÷W&6Uw&öæuVW7F–öä–BÂG&–æ–æuG—S¢&6ö×&V†Vç6—fR"Ò’Ò“°¢7FFRçG&–æ–æt&F6‚Ò7&VFVBæ&F6ƒ°¢w&—FTfÆ÷u7FFR‡²G&–æ–æt&F6„–C¢7&VFVBæ&F6‚æ–BÂG&–æ–æu&V6÷&G3¢·ÒÂG&–æ–æt–æFWƒ¢Â7FvS¢$4ôÕ$T„Tå4•dUõE$”ä”är"Ò“°¢&VæFW%6–Ö–Æ%G&–æ–æuc"‚“°¢Ó°¢6öç7B&WG'’ÒB‚"6võ&WG'’"“°¢–b‡&WG'’’&WG'’æöæ6Æ–6²Ò7–æ2‚’Óâ°¢6öç7B&WFW7BÒv—B’‚"ö’÷&WFW7G2"Â²ÖWF†öC¢%õ5B"Â&öG“¢¥4ôâç7G&–æv–g’‡²G&–æ–æt&F6„–C¢&F6‚æ–BÒ’Ò“°¢w&—FTfÆ÷u7FFR‡²&WFW7D–C¢&WFW7Bç&WFW7Bæ–BÂ&WFW7BÒ“°¢6WEf–Wr‚&÷&–v–æÅ&WG'’"“°¢Ó°§Ğ ¦7–æ2gVæ7F–öâ&VæFW$÷&–v–æÅ&WG'’‚’°¢6öç7BÆö÷Òv—BÆöDÆö÷‚“°¢6öç7B&WG'’ÒÆö÷æ÷&–v–æÅ&WG'“°¢6öç7B7FFTfÆ÷rÒ&VDfÆ÷u7FFR‚“°¢6†VÆÂ‚.Xéşš)˜xŞX¢"ÂG¶Æö÷&öw&W72‚'&WG'’"—Ğ¢Ç6V7F–öâ6Æ73Ò'æVÂ#à¢Æƒ#îY¹îX‹Xéşš)ûÈÎyÈ¾yÈ¾KÚiŠşY
n[{.{¸şyÉşjÚ>hèÎhúÂöƒ#à¢Ç6Æ73Ò&ÖöFRÖ†VÇ#îiÊÎš^KùŞyYXéşš)Xh^ZëûÈÎKˆŞi‹îzK®zÊÎKˆjÊzÙNj8j~XxnzÙNjY(ÎZèÎi[NŠz>ié8.KÚXúşKº^iú^yÈ¾zÊÎKˆjÊ™IYºiŠhûÈÎKØnKˆŞKÉ®y»Nhê^yÈ¾X‹jÚ>zîX®k9^8#Â÷à¢Æ'F–6ÆR6Æ73Ò&W†Ò×W"FW‡BÖÖöFR#ãÇâG¶W66T‡FÖÂ‡&WG'’ç7FVÒ—ÓÂ÷ãÂö'F–6ÆSà¢Â÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'æVÂ#à¢Æƒ#î˜xŞikKÙÎzÙCÂöƒ#à¢ÆF—b6Æ73Ò&w&–BGvò#à¢ÆÆ&VÃîiÈ{¸zÙNjƒÆ–çWB–CÒ'&WG'”ç7vW""fÇVSÒ"G¶W66T‡FÖÂ‡7FFTfÆ÷rç&WG'”ç7vW"ÇÂ""—Ò"Æ6V†öÆFW#Ò.XiX{®iÈ{¸zÙNj‚#ãÂöÆ&VÃà¢ÆÆ&VÃîyJi{nûÈzy.ûÈ“Æ–çWB–CÒ'&WG'”GW&F–öâ"G—SÒ&çVÖ&W""fÇVSÒ"G·7FFTfÆ÷rç&WG'”GW&F–öâÇÂ&WG'’æGW&F–öå6V6öæBÇÂÒ#ãÂöÆ&VÃà¢ÂöF—cà¢ÆÆ&VÃîX[>™JîjÚ^šªCÇFW‡F&V–CÒ'&WG'•7FW2"Æ6V†öÆFW#Ò.XiX{®Šëî8X‰~[Èş8XÉnzèY(Î{¹>Šë¢#âG¶W66T‡FÖÂ‡7FFTfÆ÷rç&WG'•7FW2ÇÂ""—ÓÂ÷FW‡F&VãÂöÆ&VÃà¢ÆFWF–Ç26Æ73Ò&Ö—7F¶R×VV²#ãÇ7VÖÖ'“îh‰zÊÎKˆjÊ™IYÊY:®˜xÎûÉóÂ÷7VÖÖ'“ãÇâG¶W66T‡FÖÂ‡&WG'’æf—'7DÖ—7F¶U7VÖÖ'’—ÓÂ÷ãÂöFWF–Ç3à¢ÆF—b6Æ73Ò'&÷r#ãÆ'WGFöâ6Æ73Ò'&–Ö'’"–CÒ'7V&Ö—E&WG'’#îhùKªNXéşš)˜xŞX£Âö'WGFöããÆ'WGFöâ6Æ73Ò&v†÷7B"FF×f–WsÒ'6–Ö–Æ%G&–æ–ær#î‹ùNY¹îy»KËÎš)ŠêŞ{¸3Âö'WGFöããÂöF—cà¢Â÷6V7F–öãæ“°¢6öç7B7V&Ö—BÒB‚"77V&Ö—E&WG'’"“°¢–b‡7V&Ö—B’7V&Ö—Bæöæ6Æ–6²Ò‚’Óâ°¢6öç7Bç7vW"ÒB‚"7&WG'”ç7vW""’çfÇVRçG&–Ò‚“°¢6öç7B7FW2ÒB‚"7&WG'•7FW2"’çfÇVRçG&–Ò‚“°¢6öç7BGW&F–öâÒçVÖ&W"‚B‚"7&WG'”GW&F–öâ"’çfÇVRÇÂ“°¢6öç7B6÷'&V7FVBÒ&WG'’æ66WFVE6–væÇ2ç6öÖR‚‡6–væÂ’ÓâG¶ç7vW'ÕÆâG·7FW7Öæ–æ6ÇVFW2‡6–væÂ’“°¢w&—FTfÆ÷u7FFR‡°¢&WG'”ç7vW#¢ç7vW"À¢&WG'•7FW3¢7FW2À¢&WG'”GW&F–öã¢GW&F–öâÀ¢&WG'•7V&Ö—GFVC¢G'VRÀ¢&WG'”6÷'&V7FVC¢6÷'&V7FVBÀ¢6ÖTW'&÷%&WVFVC¢6÷'&V7FVBÀ¢7FvS¢6÷'&V7FVBò$Ô5DU$TB"¢$äTTE5õ$T”ädõ$4TÔTåB ¢Ò“°¢6WEf–Wr‚&Ö7FW'•fW&–g’"“°¢Ó°§Ğ ¦7–æ2gVæ7F–öâ&VæFW$Ö7FW'•fW&–g’‚’°¢6öç7BÆö÷Òv—BÆöDÆö÷‚“°¢6öç7B7FFTfÆ÷rÒ&VDfÆ÷u7FFR‚“°¢6öç7BfW&–g’ÒÆö÷æÖ7FW'•fW&–f–6F–öã°¢6öç7BÖ7FW&VBÒ7FFTfÆ÷rç&WG'”6÷'&V7FVBÓÓÒG'VRÇÂfW&–g’ç7FGW2ÓÓÒ$Ô5DU$TB#°¢6†VÆÂ‚.hèÎhúš¨ÎŠø"ÂG¶Æö÷&öw&W72‚'fW&–g’"—Ğ¢Ç6V7F–öâ6Æ73Ò'æVÂ#à¢Æƒ#âG¶Ö7FW&VBò.XéşX[>™Jî™IŠúş[{.{ªjÚ2"¢.K¸Ş™ÈY¹îX‹Š^iY‹zş[èB'ÓÂöƒ#à¢ÆF—b6Æ73Ò&ÖWG&–72#à¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîXŠNijŞ{¹>iéÃÂ÷7ããÇ7G&öæsâG¶Ö7FW&VBò.[{.hèÎhú"¢.K¸Ş™È[zY»¢'ÓÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîiŠşY
n˜xŞZHŞXéş™I“Â÷7ããÇ7G&öæsâG·7FFTfÆ÷rç6ÖTW'&÷%&WVFVBò.iŠò"¢.Y
b'ÓÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîhùzK®KÛşyJƒÂ÷7ããÇ7G&öæsâG·7FFTfÆ÷ræ†–çG5W6VBÇÂÓÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîhèÎhúXùXÉcÂ÷7ããÇ7G&öæsâG¶Æö÷æ–×&÷fVÖVçBæ&Vf÷&TÖ7FW'—Ò^(i"G¶Æö÷æ–×&÷fVÖVçBægFW$Ö7FW'—ÒSÂ÷7G&öæsãÂöF—cà¢ÂöF—cà¢Â÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'æVÂ#à¢Æƒ#äXhŞjÊXˆniéÂöƒ#à¢ÆF—b6Æ73Ò&6&G2#à¢Æ'F–6ÆR6Æ73Ò&6&B#ãÆƒ3îzÊÎKˆjÊX[>™Jî™IŠúóÂöƒ3ãÇâG¶W66T‡FÖÂ‡fW&–g’æf—'7DW'&÷"—ÓÂ÷ãÂö'F–6ÆSà¢Æ'F–6ÆR6Æ73Ò&6&B#ãÆƒ3îzÊÎK¨ÎjÊŠxëÂöƒ3ãÇâG¶W66T‡FÖÂ†Ö7FW&VBòfW&–g’æÖ7FW&VDfVVF&6²¢fW&–g’ç&V–æf÷&6TfVVF&6²—ÓÂ÷ãÂö'F–6ÆSà¢Æ'F–6ÆR6Æ73Ò&6&B#ãÆƒ3îKˆ¾KˆjÚSÂöƒ3ãÇâG¶W66T‡FÖÂ†Ö7FW&VBò.‹ù¾XZ^™Iš)iK¾XX¾hª^Y®ûÈÎi»NikhèÎhú[ªn8""¢.‹ùNY¹îyú^Šønx+ZHŞKšûÈÎhÚ.KˆzxŞŠë.Šz>ik[ÈşûÈÎ[›n™˜ŞKØîy»KËÎš)™«î[ªn8""—ÓÂ÷ãÂö'F–6ÆSà¢ÂöF—cà¢ÆF—b6Æ73Ò'&÷r#ãÆ'WGFöâ6Æ73Ò'&–Ö'’"FF×f–WsÒ"G¶Ö7FW&VBò&–×&÷fVÖVçB"¢&¶æ÷vÆVFvU&Wf–Wr'Ò#âG¶Ö7FW&VBò.iú^yÈ¾™Iš)iK¾XX¾hª^Y¢"¢.˜xŞikZÚnKš'ÓÂö'WGFöããÆ'WGFöâ6Æ73Ò&v†÷7B"FF×f–WsÒ&÷&–v–æÅ&WG'’#îXhŞjÊ˜xŞX£Âö'WGFöããÂöF—cà¢Â÷6V7F–öãæ“°§Ğ ¦7–æ2gVæ7F–öâ&VæFW%G&–æ–æuÆâ‚’°¢6öç7BÆö÷Òv—BÆöDÆö÷‚“°¢6öç7BÆâÒÆö÷çG&–æ–æuÆã°¢6öç7BF6·2ÒÆâæ—FV×2æÖ‚†—FVÒÂ–æFW‚’ÓâÆ'F–6ÆR6Æ73Ò'G&–æ–ær×F6²#à¢ÆF—cãÇ7â6Æ73Ò&&FvR#âG¶W66T‡FÖÂ†—FVÒçG—R—ÓÂ÷7ããÆƒ3âG¶–æFW‚²ÒâG¶W66T‡FÖÂ†—FVÒçF—FÆR—ÓÂöƒ3ãÂöF—cà¢ÇâG¶W66T‡FÖÂ†—FVÒçW'÷6R—ÓÂ÷à¢ÇãÇ7G&öæsîZû[©N‰hN[Ëx+ûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ†—FVÒæ¶æ÷vÆVFvUö–çB—Ò+rG¶W66T‡FÖÂ†—FVÒæW'&÷%G—R—ÓÂ÷à¢Æ'WGFöâ6Æ73Ò&v†÷7B"FFÖ6ö×ÆWFR×F6³Ò"G¶–æFW‡Ò#âG¶—FVÒæ6ö×ÆWFVBò.[{.ZèÎh‰"¢.j~ŠëZèÎh‰'ÓÂö'WGFöãà¢Âö'F–6ÆSæ’æ¦ö–â‚""“°¢6†VÆÂ‚.™(ZûŠêŞ{¸2"ÂG¶Æö÷&öw&W72‚'G&–æ–ær"—Ğ¢Ç6V7F–öâ6Æ73Ò'æVÂ#à¢Æƒ#âG¶W66T‡FÖÂ‡ÆâævöÂ—ÓÂöƒ#à¢ÆF—b6Æ73Ò&ÖWG&–72#à¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîŠêŞ{¸>š)˜xóÂ÷7ããÇ7G&öæsâG·ÆâçF÷FÅVW7F–öç7ÓÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîš(NŠêyJi{cÂ÷7ããÇ7G&öæsâG·ÆâæW7F–ÖFVDÖ–çWFW7ŞXˆn™)óÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîZèÎh‰j~XxcÂ÷7ããÇ7G&öæsâG¶W66T‡FÖÂ‡Æâæ6ö×ÆWF–öå7FæF&B—ÓÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîŠêŞ{¸>š®[¨óÂ÷7ããÇ7G&öæsîY¹¾™‹njëSÂ÷7G&öæsãÂöF—cà¢ÂöF—cà¢Â÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'æVÂ#ãÆƒ#îŠêŞ{¸>K»¾XªÂöƒ#ãÆF—b6Æ73Ò&6&G2#âG·F6·7ÓÂöF—cãÆF—b6Æ73Ò'&÷r#ãÆ'WGFöâ6Æ73Ò'&–Ö'’"–CÒ&f–æ—6…G&–æ–ær#îZèÎh‰ŠêŞ{¸>[›n‹ù¾XZ^ZHŞkX³Âö'WGFöããÆ'WGFöâ6Æ73Ò&v†÷7B"FF×f–WsÒ&F–væ÷6—2#î‹ùNY¹îŠø®ijÓÂö'WGFöããÂöF—cãÂ÷6V7F–öãæ“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FFÖ6ö×ÆWFR×F6µÒ"’æf÷$V6‚‚†'WGFöâ’Óâ°¢'WGFöâæöæ6Æ–6²Ò‚’Óâ°¢'WGFöâçFW‡D6öçFVçBÒ.[{.ZèÎh‰#°¢'WGFöâæF—6&ÆVBÒG'VS°¢Ó°¢Ò“°¢6öç7Bf–æ—6‚ÒB‚"6f–æ—6…G&–æ–ær"“°¢–b†f–æ—6‚’f–æ—6‚æöæ6Æ–6²Ò‚’Óâ6WEf–Wr‚'&WFW7B"“°§Ğ ¦7–æ2gVæ7F–öâ&VæFW%&WFW7B‚’°¢6öç7BÆö÷Òv—BÆöDÆö÷‚“°¢6öç7B&WFW7BÒÆö÷ç&WFW7C°¢6öç7BVW7F–öç2Ò&WFW7BçVW7F–öç2æÖ‚‡Â–æFW‚’ÓâÆ'F–6ÆR6Æ73Ò&6&B&WFW7BÖ6&B#à¢Æƒ3îZHŞkX²G¶–æFW‚²Ò+rG¶W66T‡FÖÂ‡çG—TÆ&VÂ—ÒÇ7â6Æ73Ò&&FvRv&â#âG¶W66T‡FÖÂ‡æF–ff–7VÇG’—ÓÂ÷7ããÂöƒ3à¢Ç6Æ73Ò'7FVÒ#âG¶W66T‡FÖÂ‡ç7FVÒ—ÓÂ÷à¢ÇãÇ7G&öæsîZHŞkX¾yºîj~ûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ‡çF&vWB—ÓÂ÷à¢ÇãÇ7G&öæsäXŠNijŞûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ‡ç&W7VÇB—ÓÂ÷à¢Âö'F–6ÆSæ’æ¦ö–â‚""“°¢6†VÆÂ‚.ZHŞkX²"ÂG¶Æö÷&öw&W72‚'&WFW7B"—Ğ¢Ç6V7F–öâ6Æ73Ò'æVÂ#à¢Æƒ#îYÎyú^Šønx+Xù[ÈşZHŞkX³Âöƒ#à¢ÇîZHŞkX¾š)KˆîXéş™Iš)yú^Šønx+Kˆˆ{NûÈÎKØni[ZÙ~8h8^Z(>Y(Î™zîk9^KˆŞYÎûÈÎyJiÚ^š¨ÎŠøŠêŞ{¸>YîiŠşY
nyÉşjÚ>hèÎhú8#Â÷à¢ÆF—b6Æ73Ò&ÖWG&–72#à¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîZHŞkX¾[é~XˆcÂ÷7ããÇ7G&öæsâG·&WFW7Bç66÷&WÓÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîxºÎz¸¾ZèÎh‰Â÷7ããÇ7G&öæsâG·&WFW7Bæ–æFWVæFVçBò.iŠò"¢.Y
b'ÓÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîhùzK®KÛşyJƒÂ÷7ããÇ7G&öæsâG·&WFW7Bæ†–çG5W6VGÓÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîiŠşY
n‹ëîjsÂ÷7ããÇ7G&öæsâG·&WFW7Bç76VBò.‹ëîjr"¢.™È[zY»¢'ÓÂ÷7G&öæsãÂöF—cà¢ÂöF—cà¢Â÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'æVÂ#ãÆF—b6Æ73Ò&6&G2#âG·VW7F–öç7ÓÂöF—cãÆF—b6Æ73Ò'&÷r#ãÆ'WGFöâ6Æ73Ò'&–Ö'’"FF×f–WsÒ&–×&÷fVÖVçB#îiú^yÈ¾hùXØ~hª^Y£Âö'WGFöããÆ'WGFöâ6Æ73Ò&v†÷7B"FF×f–WsÒ'G&–æ–æuÆâ#î‹ùNY¹îŠêŞ{¸3Âö'WGFöããÂöF—cãÂ÷6V7F–öãæ“°§Ğ ¦7–æ2gVæ7F–öâ&VæFW$–×&÷fVÖVçB‚’°¢6öç7BÆö÷Òv—BÆöDÆö÷‚“°¢6öç7B—FVÒÒÆö÷æ–×&÷fVÖVçC°¢6öç7B6ö×&—6öâÒÆö÷æ6ö×&—6öå&W÷'C°¢6†VÆÂ‚.™Iš)iK¾XX¾hª^Y¢"ÂG¶Æö÷&öw&W72‚&–×&÷fVÖVçB"—Ğ¢Ç6V7F–öâ6Æ73Ò'æVÂ–×&÷fVÖVçBÖ†W&ò#à¢Æƒ#îŠêŞ{¸>X˜ŞYîˆ;ŞX©¾XùXÉcÂöƒ#à¢ÆF—b6Æ73Ò&ÖWG&–72#à¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîŠêŞ{¸>X˜ŞhèÎhú[ªcÂ÷7ããÇ7G&öæsâG¶—FVÒæ&Vf÷&TÖ7FW'—ÒSÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîŠêŞ{¸>YîhèÎhú[ªcÂ÷7ããÇ7G&öæsâG¶—FVÒægFW$Ö7FW'—ÒSÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãîhùXØsÂ÷7ããÇ7G&öæsâ²G¶—FVÒæ–×&÷fVÖVçEfÇVWÒSÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&ÖWG&–2#ãÇ7ãî{¹>Šë£Â÷7ããÇ7G&öæsâG¶W66T‡FÖÂ†—FVÒç7FGW2—ÓÂ÷7G&öæsãÂöF—cà¢ÂöF—cà¢Â÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'æVÂ#à¢Æƒ#îzÊÎKˆjÊKˆîzÊÎK¨ÎjÊKÙÎzÙNZûjùCÂöƒ#à¢ÆF—b6Æ73Ò&6ö×&—6öâÖw&–B#à¢Æ'F–6ÆR6Æ73Ò&6ö×&—6öâÖ6öÂ#à¢Æƒ3îzÊÎKˆjÊKÙÎzÙCÂöƒ3à¢ÇãÇ7G&öæsî[é~XˆnûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ†6ö×&—6öãòæf—'7E66÷&RÇÂ—FVÒæ&Vf÷&TÖ7FW'’²"R"—ÓÂ÷à¢ÇãÇ7G&öæsîyJi{nûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ†6ö×&—6öãòæf—'7DGW&F–öâÇÂ.iÊ®Šë[ÙR"—ÓÂ÷à¢ÇãÇ7G&öæsî™IŠúşjÚ^šªNûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ†6ö×&—6öãòæf—'7DW'&÷%7FWÇÂ—FVÒæ÷&–v–æÄW'&÷"—ÓÂ÷à¢ÇãÇ7G&öæsîKÙÎzÙNiŠhûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ†6ö×&—6öãòæf—'7E7FW2ÇÂ.ŠxŠø®ijŞšR"—ÓÂ÷à¢Âö'F–6ÆSà¢Æ'F–6ÆR6Æ73Ò&6ö×&—6öâÖ6öÂvööB#à¢Æƒ3î˜xŞikKÙÎzÙCÂöƒ3à¢ÇãÇ7G&öæsî[é~XˆnûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ†6ö×&—6öãòç&WG'•66÷&RÇÂ—FVÒægFW$Ö7FW'’²"R"—ÓÂ÷à¢ÇãÇ7G&öæsîyJi{nûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ†6ö×&—6öãòç&WG'”GW&F–öâÇÂ.[{.˜xŞikŠë[ÙR"—ÓÂ÷à¢ÇãÇ7G&öæsîjÚ^šªNŠxëûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ†6ö×&—6öãòç&WG'•7FWW&f÷&Öæ6RÇÂ.X[>™Jî™IŠúş[{.{ªjÚ2"—ÓÂ÷à¢ÇãÇ7G&öæsîiŠşY
n˜xŞZHŞXéş™IûÉ£Â÷7G&öæsâG¶W66T‡FÖÂ†6ö×&—6öãòç6ÖTW'&÷%&WVFVBò.iŠò"¢.Y
b"—ÓÂ÷à¢Âö'F–6ÆSà¢ÂöF—cà¢Â÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'æVÂ#à¢Æƒ#î™zŞxêş{¹>Šë£Âöƒ#à¢ÆF—b6Æ73Ò&6&G2#à¢Æ'F–6ÆR6Æ73Ò&6&B#ãÆƒ3îXéş™IŠúóÂöƒ3ãÇâG¶W66T‡FÖÂ†—FVÒæ÷&–v–æÄW'&÷"—ÓÂ÷ãÂö'F–6ÆSà¢Æ'F–6ÆR6Æ73Ò&6&B#ãÆƒ3îŠêŞ{¸>{¹>iéÃÂöƒ3ãÇâG¶W66T‡FÖÂ†—FVÒçG&–æ–æu&W7VÇB—ÓÂ÷ãÂö'F–6ÆSà¢Æ'F–6ÆR6Æ73Ò&6&B#ãÆƒ3îK¸Ş™ÈX[>k:ƒÂöƒ3ãÇâG¶W66T‡FÖÂ†—FVÒææW‡E&—6²—ÓÂ÷ãÂö'F–6ÆSà¢ÂöF—cà¢ÆF—b6Æ73Ò'&÷r#ãÆ'WGFöâ6Æ73Ò'&–Ö'’"FF×f–WsÒ'&öf–ÆR#îi»Nikˆ;ŞX©¾yK¾X8óÂö'WGFöããÆ'WGFöâ6Æ73Ò&v†÷7B"FF×f–WsÒ&6†FW'2#î‹ù¾XZ^Kˆ¾Kˆ‹ÚîZÚnKšÂö'WGFöããÂöF—cà¢Â÷6V7F–öãæ“°§Ğ ¦7–æ2gVæ7F–öâ&VæFW%&öf–ÆR‚’°¢6öç7BÆö÷Òv—BÆöDÆö÷‚“°¢6öç7B&–Æ—F–W2ÒÆö÷ç&öf–ÆRæ&–Æ—F–W2æÖ‚†—FVÒ’ÓâÆ'F–6ÆR6Æ73Ò&&–Æ—G’Ö6&B#à¢ÆF—b6Æ73Ò&&–Æ—G’Ö†VB#ãÆƒ3âG¶W66T‡FÖÂ†—FVÒææÖR—ÓÂöƒ3ãÇ7G&öæsâG¶—FVÒæ7W'&VçGÓÂ÷7G&öæsãÂöF—cà¢ÆF—b6Æ73Ò&&"#ãÆ’7G–ÆSÒ'v–GFƒ¢G¶—FVÒæ7W'&VçGÒR#ãÂö“ãÂöF—cà¢ÇîKˆ®jÊûÉ¢G¶—FVÒç&Wf–÷W7Ò+r‹h¾X«şûÉ¢G¶W66T‡FÖÂ†—FVÒçG&VæB—Ò+rKéŞhÚîûÉ¢G¶W66T‡FÖÂ†—FVÒæWf–FVæ6R—ÓÂ÷à¢Çî[»®ŠêîûÉ¢G¶W66T‡FÖÂ†—FVÒç7VvvW7F–öâ—ÓÂ÷à¢Âö'F–6ÆSæ’æ¦ö–â‚""“°¢6†VÆÂ‚.ˆ;ŞX©¾yK¾X8ò"ÂÇ6V7F–öâ6Æ73Ò'æVÂ#à¢Æƒ#îKŠ®K«®i[ZÚnˆ;ŞX©¾yK¾X8óÂöƒ#à¢Çîˆ;ŞX©¾Xˆni[iÚ^ˆz®[Ù>X˜ŞZÚnyIşy¨NKÙÎzÙN8jÚ^šªNXˆnié8™IŠúş{¾Yè¾Y(ÎZHŞkX¾ŠxëûÉ¾kÉNzK®jŠ[ÈşKÛşyJY»®Zé®j~Kè¾i[hÚîûÈÎKˆŞKÛşyJ™¨şiË®i[8#Â÷à¢Â÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'æVÂ&–Æ—G’Öw&–B#âG¶&–Æ—F–W7ÓÂ÷6V7F–öãæ“°§Ğ ¢B‚"6Æöv÷WB"’æöæ6Æ–6²Ò‚’Óâ°¢Æö6Å7F÷&vRæ6ÆV"‚“°¢Æö6F–öâç&VÆöB‚“°§Ó° §v–æF÷ræöç÷7FFRÒ‚’Óâ°¢7FFRçf–WrÒ&÷WFUFõf–Wu¶7W'&VçE&÷WFUF‚‚•ÒÇÂ&†öÖR#°¢Æö6Å7F÷&vRç6WD—FVÒ‚'f–Wr"Â7FFRçf–Wr“°¢&VæFW"‚“°§Ó° ¦–æ—B‚’æ6F6‚‚†W'&÷"’Óâ°¢Fö7VÖVçBæ&öG’æ–ææW$…DÔÂÒÇ&SâG¶W'&÷"æÖW76vWÓÂ÷&Sæ°§Ò“° 