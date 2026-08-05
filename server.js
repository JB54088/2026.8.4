const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createTrainingQuestion: createGeneratedTrainingQuestion, validateTrainingQuestion } = require("./public/training-factory.js");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DB_FILE = path.join(ROOT, "data", "db.json");

function loadEnvFile() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index <= 0) return;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvFile();

const PORT = Number(process.env.PORT || 5188);
const NODE_ENV = process.env.NODE_ENV || "development";
const ADMIN_KEY = process.env.ADMIN_KEY || (NODE_ENV === "production" ? "" : "admin2026");
const PUBLIC_API_BASE_URL = process.env.PUBLIC_API_BASE_URL || "";
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const requestHits = new Map();

function configuredOpenAIKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key || key.includes("æŠŠä½ çš„OpenAI_API_Keyç²˜è´´åˆ°è¿™é‡Œ")) return "";
  return key;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function db() {
  if (!fs.existsSync(DB_FILE)) writeJson(DB_FILE, seedDb());
  const store = readJson(DB_FILE);
  if (!Array.isArray(store.questions) || store.questions.length < 10000 || store.meta.questionSchemaVersion !== 12) {
    store.questions = buildQuestions();
    store.meta.questionSchemaVersion = 12;
    saveDb(store);
  }
  if (!Array.isArray(store.submissions)) {
    store.submissions = [];
    saveDb(store);
  }
  if (!Array.isArray(store.trainingBatches)) store.trainingBatches = [];
  if (!Array.isArray(store.trainingRecords)) store.trainingRecords = [];
  if (!Array.isArray(store.retestRecords)) store.retestRecords = [];
  return store;
}

function saveDb(next) {
  writeJson(DB_FILE, next);
}

function readPastExamSources() {
  const file = path.join(ROOT, "data", "past-exam-sources.json");
  if (!fs.existsSync(file)) return { trustedSources: [], candidateSourcesNeedReview: [] };
  return readJson(file);
}

function readPastExamQuestions() {
  const file = path.join(ROOT, "data", "past-exam-questions.json");
  if (!fs.existsSync(file)) return [];
  return readJson(file);
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function cleanId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
}

function nowIso() {
  return new Date().toISOString();
}

function publicOrigin(req) {
  return req.headers?.origin || "";
}

function corsHeaders(req) {
  const origin = publicOrigin(req);
  const allowed = !origin
    || ALLOWED_ORIGINS.includes(origin)
    || (NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    "access-control-allow-origin": allowed && origin ? origin : "null",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin"
  };
}

function rateLimited(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const minute = Math.floor(Date.now() / 60000);
  const key = `${ip}:${minute}`;
  const count = (requestHits.get(key) || 0) + 1;
  requestHits.set(key, count);
  if (requestHits.size > 5000) {
    const minKey = Math.floor(Date.now() / 60000) - 2;
    for (const existing of requestHits.keys()) {
      if (Number(existing.split(":").pop()) < minKey) requestHits.delete(existing);
    }
  }
  return count > Number(process.env.RATE_LIMIT_PER_MINUTE || 180);
}

function seedDb() {
  const students = Array.from({ length: 10 }, (_, index) => ({
    id: `stu_${index + 1}`,
    inviteCode: `MATH${String(index + 1).padStart(2, "0")}`,
    name: "",
    mathType: "",
    targetScore: 120,
    stage: "å¼ºåŒ–é˜¶æ®µ",
    dailyMinutes: 60,
    createdAt: nowIso(),
    lastLoginAt: ""
  }));

  return {
    meta: { createdAt: nowIso(), version: 1 },
    students,
    submissions: [],
    trainingBatches: [],
    trainingRecords: [],
    retestRecords: [],
    attempts: [],
    notes: [],
    questions: buildQuestions()
  };
}

function buildQuestions() {
  const common = ["æ•°å­¦ä¸€", "æ•°å­¦äºŒ", "æ•°å­¦ä¸‰"];
  const m13 = ["æ•°å­¦ä¸€", "æ•°å­¦ä¸‰"];
  const q = [
    ["q_limit_001", common, "limit", "å‡½æ•°ã€æžé™ä¸Žè¿žç»­", "é‡è¦æžé™", "çŸ¥è¯†é—®é¢˜", "choice", "åŸºç¡€å·©å›º", "æ±‚ lim(xâ†’0) sin(3x)/xã€‚", ["0", "1", "3", "ä¸å­˜åœ¨"], "3", [], "ä»¤ u=3xï¼Œåˆ™ sin(3x)/x=3Â·sin u/uï¼Œæžé™ä¸º 3ã€‚"],
    ["q_limit_002", common, "limit", "å‡½æ•°ã€æžé™ä¸Žè¿žç»­", "ç­‰ä»·æ— ç©·å°", "æ–¹æ³•é—®é¢˜", "choice", "æ˜“é”™è¾¨æž", "xâ†’0 æ—¶ï¼Œ1-cos x ä¸Žä¸‹åˆ—å“ªä¸€é¡¹ç­‰ä»·ï¼Ÿ", ["x", "x^2/2", "2x^2", "sin x"], "x^2/2", [], "å¸¸ç”¨ç­‰ä»·æ— ç©·å°ï¼š1-cos x ~ x^2/2ã€‚"],
    ["q_diff_001", common, "diff", "ä¸€å…ƒå‡½æ•°å¾®åˆ†å­¦", "å¤åˆå‡½æ•°æ±‚å¯¼", "è®¡ç®—é—®é¢˜", "choice", "åŸºç¡€å·©å›º", "å‡½æ•° y=e^(4x) çš„å¯¼æ•°æ˜¯ï¼Ÿ", ["e^(4x)", "4e^(4x)", "e^x", "4e^x"], "4e^(4x)", [], "å¤åˆå‡½æ•°æ±‚å¯¼è¦ä¹˜ä»¥å†…å±‚å¯¼æ•° 4ã€‚"],
    ["q_diff_002", common, "diff", "ä¸€å…ƒå‡½æ•°å¾®åˆ†å­¦", "å¯¼æ•°åº”ç”¨", "æ–¹æ³•é—®é¢˜", "choice", "ç»¼åˆæå‡", "åˆ¤æ–­å‡½æ•°å•è°ƒæ€§æ—¶ï¼Œæœ€ç›´æŽ¥åº”å…ˆç ”ç©¶ä»€ä¹ˆï¼Ÿ", ["å‡½æ•°å€¼", "ä¸€é˜¶å¯¼æ•°ç¬¦å·", "äºŒé˜¶å¯¼æ•°ç¬¦å·", "å®šä¹‰åŸŸé•¿åº¦"], "ä¸€é˜¶å¯¼æ•°ç¬¦å·", [], "å•è°ƒæ€§é€šå¸¸ç”±ä¸€é˜¶å¯¼æ•°ç¬¦å·å†³å®šï¼ŒäºŒé˜¶å¯¼æ•°ä¸»è¦ç”¨äºŽå‡¹å‡¸æ€§ã€‚"],
    ["q_int_001", common, "integral", "ä¸€å…ƒå‡½æ•°ç§¯åˆ†å­¦", "åˆ†éƒ¨ç§¯åˆ†é€‰æ‹©", "æ–¹æ³•é—®é¢˜", "choice", "åŸºç¡€å·©å›º", "è®¡ç®— âˆ«xÂ·e^x dx æ—¶ï¼Œæœ€åˆé€‚çš„ç¬¬ä¸€æ­¥æ˜¯ï¼Ÿ", ["ä»¤ u=x, dv=e^x dx", "ä»¤ u=e^x, dv=x dx", "ç›´æŽ¥æ¢å…ƒ", "å…ˆå±•å¼€ e^x"], "ä»¤ u=x, dv=e^x dx", [], "åˆ†éƒ¨ç§¯åˆ†ä¸­å¤šé¡¹å¼æ±‚å¯¼åŽæ›´ç®€å•ï¼Œé€šå¸¸è®©å¤šé¡¹å¼ä½œ uã€‚"],
    ["q_int_002", common, "integral", "ä¸€å…ƒå‡½æ•°ç§¯åˆ†å­¦", "æ¢å…ƒå¾®åˆ†ç³»æ•°", "è®¡ç®—é—®é¢˜", "choice", "æ˜“é”™è¾¨æž", "ä»¤ t=1+x^2ï¼Œåˆ™ âˆ«2xâˆš(1+x^2)dx å¯åŒ–ä¸ºï¼Ÿ", ["âˆ«âˆšt dt", "âˆ«2âˆšt dt", "âˆ«xâˆšt dt", "âˆ«t dt"], "âˆ«âˆšt dt", [], "dt=2x dxï¼Œæ•´ä½“æ›¿æ¢ä¸º âˆ«âˆšt dtã€‚"],
    ["q_int_003", common, "integral", "ä¸€å…ƒå‡½æ•°ç§¯åˆ†å­¦", "ä¸å®šç§¯åˆ†å¸¸æ•°", "è¡¨è¾¾é—®é¢˜", "fill", "åŸºç¡€å·©å›º", "è®¡ç®— âˆ«2x dxã€‚", [], "x^2+C", ["x^2+c", "xÂ²+C", "xÂ²+c"], "ä¸å®šç§¯åˆ†ç­”æ¡ˆéœ€è¦å¸¦ä»»æ„å¸¸æ•° Cã€‚"],
    ["q_int_004", common, "integral", "ä¸€å…ƒå‡½æ•°ç§¯åˆ†å­¦", "åå¸¸ç§¯åˆ†æ¡ä»¶", "çŸ¥è¯†é—®é¢˜", "choice", "ç»¼åˆæå‡", "åå¸¸ç§¯åˆ† âˆ«(1,+âˆž) 1/x^p dx æ”¶æ•›æ¡ä»¶æ˜¯ï¼Ÿ", ["p>1", "pâ‰¥1", "p<1", "ä»»æ„ p"], "p>1", [], "p ç§¯åˆ†åœ¨æ— ç©·åŒºé—´ä¸Š p>1 æ”¶æ•›ã€‚"],
    ["q_int_005", common, "integral", "ä¸€å…ƒå‡½æ•°ç§¯åˆ†å­¦", "é¢ç§¯åº”ç”¨", "èƒ½åŠ›é—®é¢˜", "choice", "ç»¼åˆæå‡", "ä¸Šæ›²çº¿ y=xï¼Œä¸‹æ›²çº¿ y=x^2ï¼ŒåŒºé—´ [0,1]ï¼Œé¢ç§¯ä¸ºï¼Ÿ", ["âˆ«(0,1)(x-x^2)dx", "âˆ«(0,1)(x^2-x)dx", "âˆ«(0,1)xÂ·x^2dx", "âˆ«(0,1)(x+x^2)dx"], "âˆ«(0,1)(x-x^2)dx", [], "é¢ç§¯æŒ‰ä¸Šå‡½æ•°å‡ä¸‹å‡½æ•°ç§¯åˆ†ã€‚"],
    ["q_multi_001", common, "multi", "å¤šå…ƒå‡½æ•°å¾®åˆ†å­¦", "åå¯¼æ•°", "è®¡ç®—é—®é¢˜", "choice", "åŸºç¡€å·©å›º", "z=x^2y+3yï¼Œæ±‚ z å¯¹ x çš„åå¯¼æ•°ã€‚", ["2xy", "x^2+3", "2x+3", "x^2y"], "2xy", [], "å¯¹ x æ±‚åå¯¼æ—¶æŠŠ y çœ‹ä½œå¸¸æ•°ã€‚"],
    ["q_multi_002", common, "multi", "å¤šå…ƒå‡½æ•°å¾®åˆ†å­¦", "æžå€¼æ¡ä»¶", "çŸ¥è¯†é—®é¢˜", "choice", "æ˜“é”™è¾¨æž", "äºŒå…ƒå‡½æ•°å–å¾—å¯ç–‘æžå€¼ç‚¹ï¼Œé€šå¸¸å…ˆæ±‚ä»€ä¹ˆï¼Ÿ", ["ä¸€é˜¶åå¯¼ä¸ºé›¶çš„ç‚¹", "å‡½æ•°æœ€å¤§å€¼", "è¾¹ç•Œé•¿åº¦", "åŽŸå‡½æ•°"], "ä¸€é˜¶åå¯¼ä¸ºé›¶çš„ç‚¹", [], "å†…éƒ¨é©»ç‚¹éœ€è¦å…ˆè§£ä¸€é˜¶åå¯¼åŒæ—¶ä¸ºé›¶ã€‚"],
    ["q_ode_001", common, "ode", "å¸¸å¾®åˆ†æ–¹ç¨‹", "å¯åˆ†ç¦»å˜é‡", "æ–¹æ³•é—®é¢˜", "choice", "åŸºç¡€å·©å›º", "å¾®åˆ†æ–¹ç¨‹ y'=2y çš„é€šè§£æ˜¯ï¼Ÿ", ["y=Ce^(2x)", "y=2Cx", "y=C+2x", "y=Ce^x"], "y=Ce^(2x)", [], "åˆ†ç¦»å˜é‡åŽç§¯åˆ†å¾—åˆ° ln|y|=2x+Cã€‚"],
    ["q_linear_001", common, "linear", "çº¿æ€§ä»£æ•°", "äºŒé˜¶è¡Œåˆ—å¼", "è®¡ç®—é—®é¢˜", "fill", "åŸºç¡€å·©å›º", "çŸ©é˜µ [[1,2],[3,4]] çš„è¡Œåˆ—å¼æ˜¯ï¼Ÿ", [], "-2", ["-2"], "äºŒé˜¶è¡Œåˆ—å¼ ad-bc=1Ã—4-2Ã—3=-2ã€‚"],
    ["q_linear_002", common, "linear", "çº¿æ€§ä»£æ•°", "çŸ©é˜µä¹˜æ³•", "æ˜“é”™é—®é¢˜", "choice", "æ˜“é”™è¾¨æž", "çŸ©é˜µä¹˜æ³• AB ä¸Ž BA ä¸€èˆ¬æ»¡è¶³ä»€ä¹ˆå…³ç³»ï¼Ÿ", ["ä¸€å®šç›¸ç­‰", "ä¸€èˆ¬ä¸ç›¸ç­‰", "éƒ½ä¸å­˜åœ¨", "éƒ½ä¸ºé›¶çŸ©é˜µ"], "ä¸€èˆ¬ä¸ç›¸ç­‰", [], "çŸ©é˜µä¹˜æ³•é€šå¸¸ä¸æ»¡è¶³äº¤æ¢å¾‹ã€‚"],
    ["q_series_001", ["æ•°å­¦ä¸€"], "series", "æ— ç©·çº§æ•°", "p çº§æ•°", "çŸ¥è¯†é—®é¢˜", "choice", "åŸºç¡€å·©å›º", "çº§æ•° Î£1/n^2 çš„æ•›æ•£æ€§æ˜¯ï¼Ÿ", ["å‘æ•£", "æ¡ä»¶æ”¶æ•›", "ç»å¯¹æ”¶æ•›", "æ— æ³•åˆ¤æ–­"], "ç»å¯¹æ”¶æ•›", [], "p çº§æ•° p>1 æ”¶æ•›ï¼Œæ­£é¡¹çº§æ•°å³ç»å¯¹æ”¶æ•›ã€‚"],
    ["q_space_001", ["æ•°å­¦ä¸€"], "space", "ç©ºé—´è§£æžå‡ ä½•", "å‘é‡æ¨¡é•¿", "è®¡ç®—é—®é¢˜", "fill", "åŸºç¡€å·©å›º", "å‘é‡ a=(1,2,2) çš„æ¨¡é•¿æ˜¯ï¼Ÿ", [], "3", ["3"], "æ¨¡é•¿ä¸º âˆš(1^2+2^2+2^2)=3ã€‚"],
    ["q_prob_001", m13, "prob", "æ¦‚çŽ‡è®ºä¸Žæ•°ç†ç»Ÿè®¡", "ç‹¬ç«‹äº‹ä»¶", "çŸ¥è¯†é—®é¢˜", "choice", "åŸºç¡€å·©å›º", "Aã€B ç‹¬ç«‹ï¼ŒP(A)=0.4ï¼ŒP(B)=0.5ï¼Œåˆ™ P(AB)=ï¼Ÿ", ["0.9", "0.2", "0.1", "0.45"], "0.2", [], "ç‹¬ç«‹äº‹ä»¶äº¤é›†æ¦‚çŽ‡ P(AB)=P(A)P(B)ã€‚"],
    ["q_prob_002", m13, "prob", "æ¦‚çŽ‡è®ºä¸Žæ•°ç†ç»Ÿè®¡", "æ–¹å·®æ€§è´¨", "è®¡ç®—é—®é¢˜", "choice", "æ˜“é”™è¾¨æž", "è‹¥ D(X)=4ï¼Œåˆ™ D(3X+1)=ï¼Ÿ", ["12", "13", "36", "37"], "36", [], "D(aX+b)=a^2D(X)ã€‚"]
  ];
  const handPicked = q.map(([qid, subjects, chapterId, chapterName, point, reason, type, level, stem, options, answer, aliases, explanation], index) => ({
    id: qid, subjects, chapterId, chapterName, point, reason, type, level, difficulty: difficultyFor(level), stem, options, answer, aliases, explanation, ...sourceMeta(index)
  }));
  return [...readPastExamQuestions(), ...buildSubjectiveQuestions(), ...buildExamStyleQuestions(), ...handPicked, ...buildGeneratedQuestions()];
}

function buildSubjectiveQuestions() {
  const common = ["æ•°å­¦ä¸€", "æ•°å­¦äºŒ", "æ•°å­¦ä¸‰"];
  return [
    {
      id: "subjective_integral_model_001",
      subjects: common,
      chapterId: "integral",
      chapterName: "ä¸€å…ƒå‡½æ•°ç§¯åˆ†å­¦",
      point: "å®šç§¯åˆ†åº”ç”¨å»ºæ¨¡",
      reason: "å»ºæ¨¡é”™è¯¯",
      type: "subjective",
      level: "ç»¼åˆæå‡",
      difficulty: 4,
      stem: "æŸå•†å“åŽŸå”®ä»·60å…ƒï¼Œæˆæœ¬40å…ƒã€‚è‹¥æ¯æ¶¨ä»·1å…ƒï¼Œé”€é‡å‡å°‘2ä»¶ã€‚è®¾åŽŸé”€é‡ä¸º100ä»¶ï¼Œæ±‚ä½¿æ€»åˆ©æ¶¦ä¸º2400å…ƒæ—¶çš„æ¶¨ä»·é¢ï¼Œå¹¶å†™å‡ºå®Œæ•´å»ºæ¨¡è¿‡ç¨‹ã€‚",
      options: [],
      answer: "(20+x)(100-2x)=2400",
      aliases: ["(60+x-40)(100-2x)=2400"],
      explanation: "è®¾æ¶¨ä»·é¢ä¸º xï¼Œåˆ™å•ä»¶åˆ©æ¶¦ä¸º 60+x-40=20+xï¼Œé”€é‡ä¸º 100-2xï¼Œæ€»åˆ©æ¶¦æ¨¡åž‹ä¸º (20+x)(100-2x)=2400ã€‚å…³é”®è¯„åˆ†ç‚¹æ˜¯å˜é‡è®¾å®šã€å•ä»¶åˆ©æ¶¦ã€é”€é‡è¡¨è¾¾å¼ã€æ–¹ç¨‹å»ºç«‹ä¸Žç»“è®ºã€‚",
      scoringPoints: [
        { label: "æ­£ç¡®è®¾æ¶¨ä»·é¢ x", score: 2 },
        { label: "å†™å‡ºå•ä»¶åˆ©æ¶¦ 20+x", score: 3 },
        { label: "å†™å‡ºé”€é‡ 100-2x", score: 2 },
        { label: "å»ºç«‹æ–¹ç¨‹ (20+x)(100-2x)=2400", score: 2 },
        { label: "æ±‚è§£å¹¶ç»™å‡ºç¬¦åˆé¢˜æ„ç»“è®º", score: 1 }
      ],
      sourceType: "teacher_original",
      source: "ç­¾çº¦æ•™å¸ˆå®¡æ ¸é¢˜",
      reviewStatus: "æ•™å¸ˆå·²å®¡æ ¸",
      qualityTier: "exam_standard"
    },
    {
      id: "subjective_multi_extreme_001",
      subjects: common,
      chapterId: "multi",
      chapterName: "å¤šå…ƒå‡½æ•°å¾®åˆ†å­¦",
      point: "å¤šå…ƒå‡½æ•°æžå€¼",
      reason: "æ¡ä»¶é—æ¼",
      type: "subjective",
      level: "ç»¼åˆæå‡",
      difficulty: 4,
      stem: "æ±‚å‡½æ•° z=x^2+y^2-2x-4y+1 çš„æžå€¼ï¼Œå¹¶è¯´æ˜Žå–å¾—æžå€¼çš„ç‚¹ã€‚",
      options: [],
      answer: "æžå°å€¼-4ï¼Œç‚¹(1,2)",
      aliases: ["(1,2)å¤„å–æžå°å€¼-4", "-4"],
      explanation: "é…æ–¹ z=(x-1)^2+(y-2)^2-4ï¼Œæ‰€ä»¥åœ¨ (1,2) å¤„å–å¾—æžå°å€¼ -4ã€‚éœ€è¦å†™å‡ºé…æ–¹æˆ–ä¸€é˜¶åå¯¼ã€äºŒé˜¶åˆ¤åˆ«è¿‡ç¨‹ã€‚",
      scoringPoints: [
        { label: "æ­£ç¡®æ±‚é©»ç‚¹æˆ–å®Œæˆé…æ–¹", score: 3 },
        { label: "åˆ¤æ–­æžå€¼ç±»åž‹", score: 3 },
        { label: "ç»™å‡ºæžå€¼ç‚¹", score: 2 },
        { label: "ç»™å‡ºæžå€¼", score: 2 }
      ],
      sourceType: "teacher_original",
      source: "ç­¾çº¦æ•™å¸ˆå®¡æ ¸é¢˜",
      reviewStatus: "æ•™å¸ˆå·²å®¡æ ¸",
      qualityTier: "exam_standard"
    },
    {
      id: "subjective_linear_rank_001",
      subjects: common,
      chapterId: "linear",
      chapterName: "çº¿æ€§ä»£æ•°",
      point: "çŸ©é˜µç§©ä¸Žæ–¹ç¨‹ç»„",
      reason: "æ¦‚å¿µç†è§£é”™è¯¯",
      type: "subjective",
      level: "ç»¼åˆæå‡",
      difficulty: 4,
      stem: "è®¾ä¸‰é˜¶çŸ©é˜µ A çš„ç§©ä¸º 2ï¼Œè¯´æ˜Žé½æ¬¡çº¿æ€§æ–¹ç¨‹ç»„ Ax=0 çš„è§£ç©ºé—´ç»´æ•°ï¼Œå¹¶å†™å‡ºåˆ¤æ–­ä¾æ®ã€‚",
      options: [],
      answer: "è§£ç©ºé—´ç»´æ•°ä¸º1",
      aliases: ["åŸºç¡€è§£ç³»å«1ä¸ªå‘é‡", "3-2=1"],
      explanation: "é½æ¬¡çº¿æ€§æ–¹ç¨‹ç»„è§£ç©ºé—´ç»´æ•°ç­‰äºŽæœªçŸ¥é‡ä¸ªæ•°å‡çŸ©é˜µç§©ï¼Œå³ 3-2=1ã€‚",
      scoringPoints: [
        { label: "æŒ‡å‡ºæœªçŸ¥é‡ä¸ªæ•°ä¸º3", score: 2 },
        { label: "ä½¿ç”¨ç»´æ•°=æœªçŸ¥é‡ä¸ªæ•°-ç§©", score: 4 },
        { label: "è®¡ç®—å‡º1", score: 2 },
        { label: "è¡¨è¾¾åŸºç¡€è§£ç³»å«1ä¸ªå‘é‡", score: 2 }
      ],
      sourceType: "teacher_original",
      source: "ç­¾çº¦æ•™å¸ˆå®¡æ ¸é¢˜",
      reviewStatus: "æ•™å¸ˆå·²å®¡æ ¸",
      qualityTier: "exam_standard"
    }
  ];
}

function buildExamStyleQuestions() {
  const common = ["æ•°å­¦ä¸€", "æ•°å­¦äºŒ", "æ•°å­¦ä¸‰"];
  const m1 = ["æ•°å­¦ä¸€"];
  const m13 = ["æ•°å­¦ä¸€", "æ•°å­¦ä¸‰"];
  const rows = [
    ["exam_integral_001", common, "integral", "ä¸€å…ƒå‡½æ•°ç§¯åˆ†å­¦", "å˜ä¸Šé™ç§¯åˆ†ä¸Žå¤åˆå‡½æ•°", "æ–¹æ³•é—®é¢˜", "choice", "ç»¼åˆæå‡", "è®¾ F(x)=âˆ«(0,x^2) e^(-t^2)dtï¼Œåˆ™ F'(x)=", ["2xe^(-x^4)", "e^(-x^4)", "2xÂ·e^(-x^2)", "âˆ«(0,2x)e^(-t^2)dt"], "2xe^(-x^4)", [], "å˜ä¸Šé™ç§¯åˆ†å…ˆå¯¹ä¸Šé™ä»£å…¥ï¼Œå†ä¹˜ä»¥ä¸Šé™å‡½æ•°å¯¼æ•°ã€‚"],
    ["exam_integral_002", common, "integral", "ä¸€å…ƒå‡½æ•°ç§¯åˆ†å­¦", "å¯¹ç§°åŒºé—´ç§¯åˆ†", "æ–¹æ³•é—®é¢˜", "choice", "æ˜“é”™è¾¨æž", "è®¾ f(x) è¿žç»­ï¼Œä¸” f(x)+f(-x)=2x^2ï¼Œåˆ™ âˆ«(-1,1)f(x)dx=", ["2/3", "4/3", "0", "1"], "2/3", [], "ä¸¤è¾¹åœ¨å¯¹ç§°åŒºé—´ç§¯åˆ†ï¼Œ2âˆ«f=âˆ«2x^2ã€‚"],
    ["exam_integral_003", common, "integral", "ä¸€å…ƒå‡½æ•°ç§¯åˆ†å­¦", "åå¸¸ç§¯åˆ†", "çŸ¥è¯†é—®é¢˜", "choice", "ç»¼åˆæå‡", "åå¸¸ç§¯åˆ† âˆ«(1,+âˆž) dx/(x(ln x)^p) æ”¶æ•›çš„æ¡ß^tÖÚ$z{-®éÜj×W7F–öäæÇ—6W2ÒGFV×G2æÖ‚†GFV×B’Óâ°¢6öç7BVW7F–öâÒ7F÷&RçVW7F–öç2æf–æB‚‡’Óâæ–BÓÓÒGFV×BçVW7F–öä–B’ÇÂ·Ó°¢6öç7B²66÷&RÂÖ…66÷&RÒÒ66÷&Tf÷$GFV×B‡VW7F–öâÂGFV×B“°¢6öç7B&V6öâÒ&V6öäf÷$GFV×B‡VW7F–öâÂGFV×B“°¢&WGW&â°¢G—TÆ&VÃ¢G—TÆ&VÄf÷"‡VW7F–öâçG—R’À¢66÷&RÀ¢Ö…66÷&RÀ¢f–æÄç7vW$6÷'&V7C¢GFV×Bæ6÷'&V7BÓÓÒG'VRÀ¢F—FÆS¢VW7F–öâç7FVÒÇÂVW7F–öâçö–çBÇÂVW7F–öâæ6†FW$æÖRÇÂ.iÊ®YÞYÞš)Žyºâ"À¢7GVFVçDç7vW#¢GFV×Bç&V6övæ—¦VDç7vW"ÇÂGFV×Bæç7vW"ÇÂGFV×Bç6VÆV7FVD÷F–öâÇÂ""À¢7FæF&Dç7vW#¢VW7F–öâæç7vW"ÇÂ.[è^j
Zû’"À¢W'&÷%G—W3¢GFV×Bæ6÷'&V7BòµÒ¢·&V6öåÒÀ¢¶æ÷vÆVFvUö–çG3¢¶æ÷&ÖÆ—¦UvVµö–çB‡VW7F–öâÂGFV×B•ÒÀ¢7FW3¢'V–ÆE7FWæÇ—6—2‡VW7F–öâÂGFV×B¢Ó°¢Ò“°¢6öç7BF÷FÅ66÷&RÒVW7F–öäæÇ—6W2ç&VGV6R‚‡7VÒÂ—FVÒ’Óâ7VÒ²—FVÒç66÷&RÂ“°¢6öç7BF÷FÄÖ‚ÒÖF‚æÖ‚ƒÂVW7F–öäæÇ—6W2ç&VGV6R‚‡7VÒÂ—FVÒ’Óâ7VÒ²—FVÒæÖ…66÷&RÂ’“°¢6öç7Bw&öæt—FV×2ÒVW7F–öäæÇ—6W2æf–ÇFW"‚†—FVÒ’Óâ—FVÒæf–æÄç7vW$6÷'&V7B“°¢6öç7BvV´¶æ÷vÆVFvUö–çG2Ò'&’æg&öÒ†æWr6WB‡w&öæt—FV×2æfÆDÖ‚†—FVÒ’Óâ—FVÒæ¶æ÷vÆVFvUö–çG2’’’ç6Æ–6RƒÂR“°¢6öç7BvVµ&V6öç2Ò'&’æg&öÒ†æWr6WB‡w&öæt—FV×2æfÆDÖ‚†—FVÒ’Óâ—FVÒæW'&÷%G—W2’’’ç6Æ–6RƒÂR“°¢6öç7B67W&7’ÒÖF‚ç&÷VæB‡F÷FÅ66÷&RòF÷FÄÖ‚¢“°¢6öç7B&–Ö'•vV²ÒvV´¶æ÷vÆVFvUö–çG5³ÒÇÂ.[Ù>X˜Þzºˆ¨.jŽ[ø>ˆ;ÞX©²#°¢6öç7B&–Ö'•&V6öâÒvVµ&V6öç5³ÒÇÂ.z‹>Zé®h
~KˆÞ‹k2#°¢6öç7B&Vf÷&TÖ7FW'’ÒÖF‚æÖ‚ƒ#RÂÖF‚æÖ–âƒs‚Â67W&7’Ò‚’“°¢6öç7BgFW$Ö7FW'’ÒÖF‚æÖ‚†&Vf÷&TÖ7FW'’²ÂÖF‚æÖ–âƒ“"Â67W&7’²‚’“°¢&WGW&â°¢F–væ÷6—3¢°¢66÷&S¢G·F÷FÅ66÷&WÒòG·F÷FÄÖ‡ÖÀ¢67W&7’À¢vV´¶æ÷vÆVFvUö–çG2À¢7VÖÖ'“¢w&öæt—FV×2æÆVæwF‚òiÊÎ‹Úâ’˜xÞx+žZé®KØÞX‹G·&–Ö'•vV·ÒKˆ®y¨N‰hN[Ëx+žûÈÎK‹¾Šh™IžYºiŠòG·&–Ö'•&V6öçÞ8.[»®ŠêîXXŽX®K‰>šžŠ^kÈþûÈÎXhÞyJŽYÎyú^Šønx+žXùŽ[ÈþZHÞkX¾zîŠêNiŠþY
nyÉþjÚ>hèÎhú8&¢.iÊÎ‹Úîi[NKÙ>ŠŽxëz‹>Zé®ûÈÎ[»®Šêî‹ù¾XZ^i»Nš¹Ž™«î[ªnh‰n‹zŽzºˆ¨.{»ÎYŽš)ŽûÈÎ™‹.jÚ.Xú®KÉ®xiþh(žš)ŽYè¾8""À¢VW7F–öäæÇ—6W0¢ÒÀ¢G&–æ–æuÆã¢°¢vöÃ¢w&öæt—FV×2æÆVæwF‚òY»N{¹^(	ÂG·&–Ö'•vV·Þ(	ÞZèÎh‰™(ŽZûžŠêÞ{¸6¢.‹ù¾XZ^{»ÎYŽhùXØ~ŠêÞ{¸2"À¢F÷FÅVW7F–öç3¢ÖF‚æÖ‚ƒbÂw&öæt—FV×2æÆVæwF‚¢2ÇÂb’À¢W7F–ÖFVDÖ–çWFW3¢ÖF‚æÖ‚ƒ‚Âw&öæt—FV×2æÆVæwF‚¢‚ÇÂ‚’À¢6ö×ÆWF–öå7FæF&C¢.YÎyú^Šønx+žXùŽ[Èþ‹ùî{ºÓ.š)ŽxºÎz¸¾jÚ>zîûÈÎK‰NˆØžz‹þjÚ^šªNXúþŠz>˜x¢"À¢—FV×3¢°¢²G—S¢.jh.[û^Š^kÈò"ÂF—FÆS¢ZHÞy¹‚G·&–Ö'•vV·Òy¨NZé®K˜ž8XZÎ[ÈþY(Î˜.yJŽiÚK»fÂW'÷6S¢.XXŽKúîjÚ>™IžŠúþiÚ^k©ûÈÎXxþ[	y».yºîX‹~š)‚"Â¶æ÷vÆVFvUö–çC¢&–Ö'•vV²ÂW'&÷%G—S¢&–Ö'•&V6öâÂ6ö×ÆWFVC¢fÇ6RÒÀ¢²G—S¢.Kè¾š)Žh¸nŠz2"ÂF—FÆS¢.ZûžxZ~j~XxnŠz>k9^j~X{®zÊÎKˆjÊXþ[zîKØÞ{Úâ"ÂW'÷6S¢.ŠêžZÚnyIþyú^˜>K‹®K¸K˜Ž™IžûÈÎˆÎKˆÞiŠþXú®yú^˜>zÙNjŽ™I’"Â¶æ÷vÆVFvUö–çC¢&–Ö'•vV²ÂW'&÷%G—S¢&–Ö'•&V6öâÂ6ö×ÆWFVC¢fÇ6RÒÀ¢²G—S¢.YÎ{¾ŠêÞ{¸2"ÂF—FÆS¢.ZèÎh‰>˜>YÎyú^Šønx+žYû®zXùŽ[Èþš)‚"ÂW'÷6S¢.š¨ÎŠøˆ;ÞY
n‹øz{¾X‹ikš)‚"Â¶æ÷vÆVFvUö–çC¢&–Ö'•vV²ÂW'&÷%G—S¢.ikžk9^‹øz{²"Â6ö×ÆWFVC¢fÇ6RÒÀ¢²G—S¢.™™i{n[zžY»¢"ÂF—FÆS¢.ZèÎh‰.˜>i‰>™I’þ{»ÎYŽXùŽ[Èþš)‚"ÂW'÷6S¢.j8iú^˜	þ[ªnY(Îz‹>Zé®h
r"Â¶æ÷vÆVFvUö–çC¢&–Ö'•vV²ÂW'&÷%G—S¢.{»ÎYŽ[©NyJ‚"Â6ö×ÆWFVC¢fÇ6RÐ¢Ð¢ÒÀ¢&WFW7C¢°¢66÷&S¢ÖF‚æÖ–âƒÂgFW$Ö7FW'’’À¢–æFWVæFVçC¢gFW$Ö7FW'’ãÒsÀ¢†–çG5W6VC¢gFW$Ö7FW'’ãÒsò¢À¢76VC¢gFW$Ö7FW'’ãÒsÀ¢VW7F–öç3¢°¢²G—TÆ&VÃ¢.XùŽ[Èþš)‚"ÂF–ff–7VÇG“¢.Yû®zXùŽ[Èò"Â7FVÓ¢Y»N{¹RG·&–Ö'•vV·Òy¨NYÎjŠYè¾XùŽ[Èþš)†ÂF&vWC¢.zîŠêNXZÎ[ÈþY(ÎXZ^Xú>iŠþY
njÚ>zâ"Â&W7VÇC¢gFW$Ö7FW'’ãÒsò.[{.˜	®‹ør"¢.K¸Þ™È[zžY»¢"ÒÀ¢²G—TÆ&VÃ¢.XùŽ[Èþš)‚"ÂF–ff–7VÇG“¢.{»ÎYŽXùŽ[Èò"Â7FVÓ¢h¨¢G·&–Ö'•vV·ÒiKîXZ^‹zŽzºˆ¨.h8^Z(>KŠÞ˜xÞikj8kX¶ÂF&vWC¢.zîŠêNiŠþY
nyÉþjÚ>‹øz{²"Â&W7VÇC¢gFW$Ö7FW'’ãÒsRò.‹øz{¾Yû®iÊÎz‹>Zé¢"¢.‹øz{¾K¸ÞKˆÞz‹>Zé¢"Ð¢Ð¢ÒÀ¢–×&÷fVÖVçC¢²&Vf÷&TÖ7FW'’ÂgFW$Ö7FW'’Â–×&÷fVÖVçEfÇVS¢gFW$Ö7FW'’Ò&Vf÷&TÖ7FW'’Â7FGW3¢gFW$Ö7FW'’ãÒsRò.™‹një^‹ëîjr"¢.™ÈŠhK¨ÎX‹r"Â÷&–v–æÄW'&÷#¢&–Ö'•&V6öâÂG&–æ–æu&W7VÇC¢[{.yIþh‰G·&–Ö'•vV·Òy¨NŠ^kÈþ8YÎ{¾ŠêÞ{¸>Y(Î™™i{n[zžY»®K»¾Xª8&ÂæW‡E&—6³¢vV´¶æ÷vÆVFvUö–çG5³ÒòKˆ¾Kˆ‹Úî[»®ŠêîX[>k:‚G·vV´¶æ÷vÆVFvUö–çG5³×Þ8&¢.Kˆ¾Kˆ‹Úî[»®ŠêîZ)îXª{»ÎYŽš)ŽûÈÎš¨ÎŠø™[þiÉþz‹>Zé®h
~8""ÒÀ¢&öf–ÆS¢°¢&–Æ—F–W3¢°¢²æÖS¢.jh.[û^ynŠz2"Â7W'&VçC¢ÖF‚æÖ–âƒ“RÂgFW$Ö7FW'’’Â&Wf–÷W3¢&Vf÷&TÖ7FW'’ÂG&VæC¢gFW$Ö7FW'’â&Vf÷&TÖ7FW'’ò.hùXØr"¢.hÈ[›2"ÂWf–FVæ6S¢&–Ö'•&V6öâÂ7VvvW7F–öã¢{º~{ºÞZHÞy¹‚G·&–Ö'•vV·ÖÒÀ¢²æÖS¢.ikžk9^˜žhº’"Â7W'&VçC¢ÖF‚æÖ–âƒ“ÂgFW$Ö7FW'’Ò2’Â&Wf–÷W3¢ÖF‚æÖ‚ƒ#Â&Vf÷&TÖ7FW'’ÒR’ÂG&VæC¢.‹yþ™¨þŠêÞ{¸>i»Nik"ÂWf–FVæ6S¢.iÚ^ˆz®iÈ‹ùKˆ‹Úîš)ŽyºîjÚ^šªNXˆnié"Â7VvvW7F–öã¢.KÉŽXXŽXižX{®Šz>š)ŽXZ^Xú>Y(ÎKÛþyJŽynyK"ÒÀ¢²æÖS¢.Šêzé~z‹>Zé®h
r"Â7W'&VçC¢ÖF‚æÖ–âƒƒ‚Â67W&7’²’Â&Wf–÷W3¢ÖF‚æÖ‚ƒ3Â67W&7’Òb’ÂG&VæC¢.[è^ZHÞkX¾š¨ÎŠø"ÂWf–FVæ6S¢.yKiÈ{¸ŽzÙNjŽY(ÎˆØžz‹þZèÎi[N[ªn{»ÎYŽKËŠê"Â7VvvW7F–öã¢.{º~{ºÞKùÞyYžX[>™JîŠêzé~jÚ^šªB"ÒÀ¢²æÖS¢.š)ŽYè¾ŠønXŠ²"Â7W'&VçC¢ÖF‚æÖ–âƒƒbÂgFW$Ö7FW'’ÒR’Â&Wf–÷W3¢ÖF‚æÖ‚ƒ#RÂ&Vf÷&TÖ7FW'’Ò‚’ÂG&VæC¢.XúþhùXØr"ÂWf–FVæ6S¢.Yû®K¨î™Ižš)Žyú^Šønx+žXˆn[ˆ2"Â7VvvW7F–öã¢.KÛþyJŽYÎyú^Šønx+žKˆÞYÎ™zîk9^X®‹øz{¾ŠêÞ{¸2"Ð¢Ð¢Ð¢Ó°§Ð ¦gVæ7F–öâVç&–6„Ö—7F¶TÆö÷†Æö÷’°¢6öç7Bf—'7BÒÆö÷æF–væ÷6—3òçVW7F–öäæÇ—6W3òæf–æB‚†—FVÒ’Óâ—FVÒæf–æÄç7vW$6÷'&V7B’ÇÂÆö÷æF–væ÷6—3òçVW7F–öäæÇ—6W3òå³ÒÇÂ·Ó°¢6öç7Bf—'7Ew&öæu7FWÒf—'7Bç7FW3òæf–æB‚‡7FW’Óâ7FWç7FGW2ÓÒ&6÷'&V7B"’ÇÂf—'7Bç7FW3òå³ÒÇÂ·Ó°¢6öç7B¶æ÷vÆVFvUö–çBÒf—'7Bæ¶æ÷vÆVFvUö–çG3òå³ÒÇÂÆö÷æF–væ÷6—3òçvV´¶æ÷vÆVFvUö–çG3òå³ÒÇÂ.[Ù>X˜Þ‰hN[Ëyú^Šønx+’#°¢6öç7BW'&÷%G—RÒf—'7BæW'&÷%G—W3òå³ÒÇÂ.yú^Šønx+ž[©NyJŽ™IžŠúò#°¢6öç7B—5&öf—BÒþXŠžkjgÎYJîK»wÎh‰iÊÇÇ&öf—Bö’çFW7B†G¶¶æ÷vÆVFvUö–çGÒG¶f—'7BçF—FÆWÒG¶f—'7Ew&öæu7FWæW'&÷$FW67&—F–öçÖ“°¢6öç7B&Wf–WtÖöGVÆRÒ—5&öf—Bò°¢F—FÆS¢.XŠžkjnX[>{;²"À¢&VÆF–öåFôÖ—7F¶S¢.iÊÎš)Ž™IžŠúþXùyIþYÊŽh¨®(	ÎYJîK»~(	Þ[Ù>h‰(	ÎXÙ^K»nXŠžkjn(	Þ8.ZHÞKšyºîj~iŠþXXŽXˆnkˆ^YJîK»~8‹ù¾K»~8XÙ^K»nXŠžkjnY(Îh¾XŠžkjnûÈÎXhÞY¹îX‹[»®jŠ8""À¢6÷&T6öæ6WC¢.XŠžkjn™zîš)ŽKŠÞûÈÎXÙ^K»nXŠžkjnKˆÞiŠþYJîK»~ûÈÎˆÎiŠþYJîK»~XxþXë¾‹ù¾K»~ûÉ¾h¾XŠžkjnzØžK¨îXÙ^K»nXŠžkjnK™ŽKº^™H˜xþ8""À¢f÷&×VÆ3¢².XÙ^K»nXŠžkjbÒYJîK»rÒ‹ù¾K»r"Â.h¾XŠžkjbÒXÙ^K»nXŠžkjb9r™H˜xò"Â.XùŽXÉnYî™H˜xòÒXéþ™H˜xò+XùŽXÉn˜xò%ÒÀ¢6öæF—F–öç3¢.š)Žyºî{¹žX{®YJîK»~Y(Î‹ù¾K»~i{nûÈÎ[ø^š¾XXŽŠêzé~XÙ^K»nXŠžkjnûÉ¾š)Žyºî{¹žX{®™H˜xþ™¨þK»~jÎXùŽXÉni{nûÈÎXhÞ[»®z¸¾™H˜xþŠŽ‹ëî[Èþ8""À¢6öÖÖöäÖ—7F¶W3¢².y»Nhê^h¨®YJîK»~[Ù>XŠžkjb"Â.[ùŽŠëXxþXë¾‹ù¾K»r"Â.h¨®‰
^K‰®š)ÞY(ÎXŠžkjnk{~kxb"Â.™H˜xþXùŽXÉnikžY	XižXøÒ%ÒÀ¢6÷'&V7DW†×ÆS¢.YJîK»sƒXX>ûÈÎ‹ù¾K»sSXX>ûÈÎX‰žXÙ^K»nXŠžkjnK‹£ƒÓSÓ3XX>8""À¢w&öætW†×ÆS¢.YJîK»sƒXX>ûÈÎ‹ù¾K»sSXX>ûÈÎy»Nhê^XižXÙ^K»nXŠžkjnK‹£ƒXX>ûÈÎ‹ùžiŠþh¨®YJîK»~[Ù>h‰XŠžkjn8""À¢7G&FVw“¢.KÚy¨N™IžŠúþ[îK¨î[»®jŠþi[˜xþX[>{;¾™IžŠúþûÈÎXXŽyJŽX[>{;¾Y»îh¸nXùŽ˜xþûÈÎXhÞX®y»ŽKËÎš)Ž8" ¢Ò¢°¢F—FÆS¢¶æ÷vÆVFvUö–çBÀ¢&VÆF–öåFôÖ—7F¶S¢iÊÎš)ŽzÊÎKˆjÊX[>™JîXþ[zîX{®xëYÊŽ(	ÂG¶f—'7Ew&öæu7FWæ§VFvÖVçBÇÂW'&÷%G—WÞ(	ÞûÈÎZûž[©Nyú^Šønx+žiŠòG¶¶æ÷vÆVFvUö–çGÞ8&À¢6÷&T6öæ6WC¢G¶¶æ÷vÆVFvUö–çGÒy¨NZHÞKš˜xÞx+žiŠþ[ÈNkˆ^Zé®K˜ž8˜.yJŽiÚK»nY(Îš)ŽyºîKŠÞy¨NŠznXùKúXû~8&À¢f÷&×VÆ3¢¶f—'7Bç7FæF&Dç7vW"ò.XXŽzîŠêNKÛþyJŽiÚK»nûÈÎXhÞKº>XZ^XZÎ[Èþh‰njŠYè²"¢.XXŽXižX{®[{.yú^iÚK»nKˆîh˜k.yºîjr"Â.jøþKˆjÚ^[ø^š¾ˆ;ÞŠz>˜x®iÚ^k©%ÒÀ¢6öæF—F–öç3¢.Xú®iÈžš)ŽyºîiÚK»nkº‹k>Zûž[©NXZÎ[Èòþikžk9^i{nh˜Þˆ;Þy»Nhê^KÛþyJŽûÉ¾KˆÞkº‹k>i{nXXŽX®zØžK»~‹ÚÎXÉnh‰n[»®jŠ8""À¢6öÖÖöäÖ—7F¶W3¢¶W'&÷%G—RÂ.Xú®yÈ¾iÈ{¸ŽzÙNjŽKˆÞj8iú^‹ø~zˆ²"Â.[ûÞyZ^š)Žyºî™™X‹niÚK»b%ÒÀ¢6÷'&V7DW†×ÆS¢.XXŽhùXùn[{.yú^iÚK»nûÈÎXhÞXižX{®h˜yJŽyú^Šønx+žûÈÎiÈYîKº>XZ^Šêzé~8""À¢w&öætW†×ÆS¢f—'7Ew&öæu7FWç7GVFVçD6öçFVçBÇÂ.y»Nhê^ZY~XZÎ[ÈþKØnk*iÈžj8iú^iÚK»n8""À¢7G&FVw“¢KÚy¨N™IžŠúþ{¾Yè¾iŠòG¶W'&÷%G—WÞûÈÎiÊÎjÊZHÞKšhê~X‹nYÊƒ"Ó>Xˆn™)þûÈÎXXŽŠ^X[>™Jîjh.[û^ûÈÎXhÞX®ynŠz>j8iú^8& ¢Ó°¢6öç7BVæFW'7FæF–æt6†V6²Ò—5&öf—Bò°¢W'÷6S¢.zîŠêNKÚ[{.{¸þˆ;ÞXË®XˆnYJîK»~Y(ÎXÙ^K»nXŠžkjn8""À¢VW7F–öã¢.iùYXnY8YJîK»sƒXX>ûÈÎ‹ù¾K»sSXX>ûÈÎXÙ^K»nXŠžkjniŠþZI®[	ûÉò"À¢÷F–öç3¢°¢²¶W“¢$"ÂFW‡C¢#ƒXX2"ÒÀ¢²¶W“¢$""ÂFW‡C¢#SXX2"ÒÀ¢²¶W“¢$2"ÂFW‡C¢#3XX2"ÒÀ¢²¶W“¢$B"ÂFW‡C¢#3XX2"Ð¢ÒÀ¢ç7vW#¢$2"À¢74fVVF&6³¢.jÚ>zî8.KÚ[{.{¸þˆ;Þh¨®YJîK»~Y(ÎXŠžkjnXˆn[ÈûÈÎXúþKº^‹ù¾XZ^y»ŽKËÎš)ŽŠêÞ{¸>8""À¢f–ÄfVVF&6³¢.‹ùŽKˆÞˆ;Þ‹ù¾XZ^y»ŽKËÎš)ŽŠêÞ{¸>8.Šû~Y¹îX‹(	ÎXÙ^K»nXŠžkjcÞYJîK»rÞ‹ù¾K»~(	Þ‹ùžKˆ˜:ŽXˆn˜xÞikZHÞKš8" ¢Ò¢°¢W'÷6S¢zîŠêNKÚ[{.{¸þynŠz2G¶¶æ÷vÆVFvUö–çGÒy¨NKÛþyJŽXZ^Xú>8&À¢VW7F–öã¢X®‹ùž{¾š)Ži{nûÈÎiÈXXŽ[©NŠú^zîŠêNK¸K˜ŽûÉöÀ¢÷F–öç3¢°¢²¶W“¢$"ÂFW‡C¢.y»Nhê^XižiÈ{¸ŽzÙNj‚"ÒÀ¢²¶W“¢$""ÂFW‡C¢zîŠêBG¶¶æ÷vÆVFvUö–çGÒy¨N˜.yJŽiÚK»nY(Îš)ŽyºîiÚK»fÒÀ¢²¶W“¢$2"ÂFW‡C¢.XXŽyÈ¾Šz>ié"ÒÀ¢²¶W“¢$B"ÂFW‡C¢.™¨þiË®hÚ.Kˆ˜>š)‚"Ð¢ÒÀ¢ç7vW#¢$""À¢74fVVF&6³¢.jÚ>zî8.XXŽzîŠêNyú^Šønx+žKˆîiÚK»nûÈÎXhÞ‹ù¾XZ^y»ŽKËÎš)Ž8""À¢f–ÄfVVF&6³¢.‹ùŽKˆÞˆ;Þ‹ù¾XZ^y»ŽKËÎš)ŽŠêÞ{¸>8.Šû~Y¹îX‹yú^Šønx+žZHÞKšš^ûÈÎ˜xÞx+žyÈ¾KÛþyJŽiÚK»n8" ¢Ó°¢6öç7B6–Ö–Æ%G&–æ–ærÒ—5&öf—Bò°¢vöÃ¢.XŠžkjnX[>{;¾y»ŽKËÎš)ŽŠêÞ{¸2"À¢ÆWfVÇ3¢°¢²ÆWfVÃ¢.zÊÎKˆ[.ûÉ®Yû®zjŠK»þš)‚"ÂF—FÆS¢.y»Nhê^Šêzé~XÙ^K»nXŠžkjb"Â7FVÓ¢.iùYXnY8‹ù¾K»s3XX>ûÈÎYJîK»sSXX>ûÈÎjøþZJžXÙnX{£ƒK»nûÈÎk.jøþZJžh¾XŠžkjn8""ÂF&vWC¢.zîŠêNKÉ®yJŽXÙ^K»nXŠžkjcÞYJîK»rÞ‹ù¾K»r"Â†–çC¢.XXŽzé~KˆK»n‹Y®ZI®[	8""ÂfVVF&6³¢.zÙN™IžXú®hùzK®YJîK»~8‹ù¾K»~Y(ÎXŠžkjnX[>{;¾ûÈÎKˆÞy»Nhê^{¹žZèÎi[NŠz>ié8""ÒÀ¢²ÆWfVÃ¢.zÊÎK¨Î[.ûÉ®YÎ{¾XùŽ[Èþš)‚"ÂF—FÆS¢.[»®z¸¾XùŽXÉnYîXŠžkjnŠŽ‹ëî[Èò"Â7FVÓ¢.iùYXnY8‹ù¾K»sCXX>ûÈÎYJîK»~jøþhùš¹ƒ.XX>ûÈÎ™H˜xþXxþ[	^K»nûÈÎ[»®z¸¾h¾XŠžkjnŠŽ‹ëî[Èþ8""ÂF&vWC¢.zîŠêNˆ;ÞZHNyn™H˜xþXùŽXÉb"Â†–çC¢.XˆnXŠ¾XižX{®XÙ^K»nXŠžkjnY(Î™H˜xþ8""ÂfVVF&6³¢.Zh.iéÎh¨®YJîK»~[Ù>XŠžkjnûÈÎ‹ùNY¹îyú^Šønx+žZHÞKš8""ÒÀ¢²ÆWfVÃ¢.zÊÎKˆž[.ûÉ®{»ÎYŽ‹øz{¾š)‚"ÂF—FÆS¢.xºÎz¸¾ZèÎh‰XŠžkjn[»®jŠ"Â7FVÓ¢.iùYXn[©~™HYJîKˆzxÞYXnY8ûÈÎK»~jÎ‹>i[NKÉ®[ÛY8Þ™H˜xþûÈÎk.‹ëîX‹yºîj~XŠžkjni{ny¨NZé®K»~8""ÂF&vWC¢.hê^‹ùXéþ™Ižš)Ž™«î[ªnûÈÎXxþ[	hùzK¢"Â†–çC¢""ÂfVVF&6³¢.iÈYîKˆš)Ž™ÈxºÎz¸¾ZèÎh‰ûÈÎKÛþyJŽš¹Ž{ª~hùzK®KˆÞzé~ZèÎXZŽhèÎhú8""Ð¢Ð¢Ò¢°¢vöÃ¢G¶¶æ÷vÆVFvUö–çGÒy»ŽKËÎš)ŽŠêÞ{¸6À¢ÆWfVÇ3¢°¢²ÆWfVÃ¢.zÊÎKˆ[.ûÉ®Yû®zjŠK»þš)‚"ÂF—FÆS¢.zîŠêNyú^Šønx+žXZ^Xú2"Â7FVÓ¢Y»N{¹RG¶¶æ÷vÆVFvUö–çGÒy¨Ny»Nhê^[©NyJŽš)Ž8&ÂF&vWC¢.zîŠêNˆ;ÞjÚ>zîKÛþyJŽX‰®ZHÞKšy¨Nyú^Šønx+’"Â†–çC¢.XXŽXižX{®˜.yJŽiÚK»n8""ÂfVVF&6³¢.Xú®{¹žKˆ{ª~hùzK®ûÈÎKˆÞz¸¾XÛ>[^zK®ZèÎi[NzÙNjŽ8""ÒÀ¢²ÆWfVÃ¢.zÊÎK¨Î[.ûÉ®YÎ{¾XùŽ[Èþš)‚"ÂF—FÆS¢.i»NhÚ.h8^Z(>ŠŽ‹ëâ"Â7FVÓ¢i»NhÚ.i[ZÙ~h‰n™zîk9^ûÈÎKØnK¸Þˆ>iúRG¶¶æ÷vÆVFvUö–çGÞ8&ÂF&vWC¢.zîŠêN‹øz{¾ˆ;ÞX©²"Â†–çC¢.h›îš)ŽyºîKŠÞy¨NŠznXùiÚK»n8""ÂfVVF&6³¢.˜xÞZHÞXéþ™IžX‰ž‹ùNY¹îZHÞKš8""ÒÀ¢²ÆWfVÃ¢.zÊÎKˆž[.ûÉ®{»ÎYŽ‹øz{¾š)‚"ÂF—FÆS¢.hê^‹ùXéþ™Ižš)‚"Â7FVÓ¢h¨¢G¶¶æ÷vÆVFvUö–çGÒiKîXZ^{»ÎYŽh8^Z(>KŠÞxºÎz¸¾ZèÎh‰8&ÂF&vWC¢.zîŠêNxºÎz¸¾ZèÎh‰"Â†–çC¢""ÂfVVF&6³¢.iÈYîKˆš)ŽŠhk.KØîhùzK®ZèÎh‰8""Ð¢Ð¢Ó°¢6öç7B÷&–v–æÅ&WG'’Ò°¢7FVÓ¢f—'7BçF—FÆRÇÂ.Xéþ™Ižš)‚"À¢f—'7DÖ—7F¶U7VÖÖ'“¢KÚzÊÎKˆjÊYÊŽ(	ÂG¶f—'7Ew&öæu7FWæ§VFvÖVçBÇÂW'&÷%G—WÞ(	Þ‹ùžKˆjÚ^X{®xë™zîš)ŽûÈÎ™IžŠúþ{¾Yè¾iŠòG¶W'&÷%G—WÞ8.‹ùž˜xÎKˆÞ[^zK®ZèÎi[NjÚ>zîŠz>k9^8&À¢66WFVE6–væÇ3¢—5&öf—Bò²##·‚"Â#c·‚ÓC"Â"ƒ#·‚’ƒÓ'‚’%Ò¢µ7G&–ær†f—'7Bç7FæF&Dç7vW"ÇÂ""’Â¶æ÷vÆVFvUö–çEÒæf–ÇFW"„&ööÆVâ’À¢GW&F–öå6V6öæC¢ ¢Ó°¢Æö÷ç&V6÷fW'•F‚Ò°¢7W'&VçE7FvS¢$D”täõ4TB"À¢æW‡D7F–öã¢XXŽZHÞKšG·&Wf–WtÖöGVÆRçF—FÆWÞûÈÎ˜	®‹ø~ynŠz>j8iú^YîXhÞ‹ù¾XZ^y»ŽKËÎš)Ž8&À¢7FvW3¢°¢²¶W“¢$DUDT5DTB"ÂÆ&VÃ¢.j8kX²"Â7FGW3¢.[{.ZèÎh‰"Â7VÖÖ'“¢f—'7Bæf–æÄç7vW$6÷'&V7BÓÓÒfÇ6Rò.XùxëiÊÎš)ŽKÙÎzÙN™IžŠúò"¢.iÊÎš)Ž[è^‹ù¾KˆjÚ^š¨ÎŠø"ÒÀ¢²¶W“¢$D”täõ4TB"ÂÆ&VÃ¢.Šø®ijÒ"Â7FGW3¢.[{.ZèÎh‰"Â7VÖÖ'“¢f—'7Ew&öæu7FWæ§VFvÖVçBÇÂW'&÷%G—RÒÀ¢²¶W“¢%$Ud”Ut”är"ÂÆ&VÃ¢.ZHÞKš"Â7FGW3¢.‹ù¾ŠÎKŠÒ"Â7VÖÖ'“¢ZHÞKšG·&Wf–WtÖöGVÆRçF—FÆWÖÒÀ¢²¶W“¢$4„T4´”äuõTäDU%5DäD”är"ÂÆ&VÃ¢.ynŠz>j8iúR"Â7FGW3¢.iÊ®[ÈZx²"Â7VÖÖ'“¢VæFW'7FæF–æt6†V6²çVW7F–öâÒÀ¢²¶W“¢%E$”ä”är"ÂÆ&VÃ¢.y»ŽKËÎš)ŽŠêÞ{¸2"Â7FGW3¢.iÊ®[ÈZx²"Â7VÖÖ'“¢6–Ö–Æ%G&–æ–ærævöÂÒÀ¢²¶W“¢%t•D”äuôdõ%õ$UE%’"ÂÆ&VÃ¢.Xéþš)Ž˜xÞX¢"Â7FGW3¢.iÊ®[ÈZx²"Â7VÖÖ'“¢.Y¹îX‹XéþZx¾™Ižš)Ž˜xÞikKÙÎzÙB"ÒÀ¢²¶W“¢$Ô5DU$TB"ÂÆ&VÃ¢.hèÎhúš¨ÎŠø"Â7FGW3¢.iÊ®[ÈZx²"Â7VÖÖ'“¢.XŠNijÞiŠþY
n˜xÞZHÞXéþX[>™Jî™IžŠúò"Ð¢Ð¢Ó°¢Æö÷æ†öÖT6÷VçFW'2Ò°¢&Wf–WuVæF–æs¢Æö÷æF–væ÷6—3òçvV´¶æ÷vÆVFvUö–çG3òæÆVæwF‚ÇÂÀ¢G&–æ–æuVæF–æs¢6–Ö–Æ%G&–æ–æræÆWfVÇ2æÆVæwF‚À¢&WG'•VæF–æs¢À¢6öçVW&VC¢Æö÷æ–×&÷fVÖVçCòç7FGW3òæ–æ6ÇVFW2‚.‹ëîjr"’ò¢À¢æVVG5&V–æf÷&6VÖVçC¢Æö÷æ–×&÷fVÖVçCòç7FGW3òæ–æ6ÇVFW2‚.™ÈŠh"’ò¢ ¢Ó°¢Æö÷ç&Wf–WtÖöGVÆRÒ&Wf–WtÖöGVÆS°¢Æö÷çVæFW'7FæF–æt6†V6²ÒVæFW'7FæF–æt6†V6³°¢Æö÷ç6–Ö–Æ%G&–æ–ærÒ6–Ö–Æ%G&–æ–æs°¢Æö÷æ÷&–v–æÅ&WG'’Ò÷&–v–æÅ&WG'“°¢Æö÷çG&–æ–æt7&—FW&–Ò°¢7VÖÖ'“¢.ˆ{>[	˜	®‹øs.˜>y»ŽKËÎš)ŽûÈÎiÈYîKˆ˜>KˆÞˆ;ÞKÛþyJŽKˆž{ª~Kº^Kˆ®hùzK®ûÈÎK‰NKˆÞˆ;Þ˜xÞZHÞXéþX[>™Jî™IžŠúþ8""À¢Ö–ä6÷'&V7C¢"À¢Ö„†–v„†–çDÆWfVÃ¢"À¢Æ7EVW7F–öä–æFWVæFVçC¢G'VP¢Ó°¢Æö÷æÖ7FW'•fW&–f–6F–öâÒ°¢7FGW3¢Æö÷ç&WFW7Còç76VBò$Ô5DU$TB"¢$äTTE5õ$T”ädõ$4TÔTåB"À¢f—'7DW'&÷#¢f—'7Ew&öæu7FWæW'&÷$FW67&—F–öâÇÂW'&÷%G—RÀ¢Ö7FW&VDfVVF&6³¢.zÊÎK¨ÎjÊKÙÎzÙNk*iÈž˜xÞZHÞXéþX[>™Jî™IžŠúþûÈÎX[>™JîjÚ^šªNi»NŠxNˆÈ>ûÈÎXúþKº^‹ù¾XZ^™Ižš)ŽiK¾XX¾hª^Y®8""À¢&V–æf÷&6TfVVF&6³¢.zÊÎK¨ÎjÊKÙÎzÙNK¸ÞiÊ®{ªjÚ>X[>™Jî™IžŠúþûÈÎ™ÈŠh‹ùNY¹îyú^Šønx+žZHÞKšûÈÎ[›n™˜ÞKØîy»ŽKËÎš)Ž™«î[ªn8" ¢Ó°¢Æö÷æ6ö×&—6öå&W÷'BÒ°¢f—'7E66÷&S¢f—'7Bç66÷&RÒçVÆÂbbf—'7BæÖ…66÷&RòG¶f—'7Bç66÷&WÒòG¶f—'7BæÖ…66÷&WÖ¢Æö÷æF–væ÷6—3òç66÷&RÀ¢&WG'•66÷&S¢Æö÷ç&WFW7Còç76VBò#ó"¢.[è^˜xÞX¢"À¢f—'7DGW&F–öã¢.šinjÊŠë[ÙR"À¢&WG'”GW&F–öã¢.˜xÞX®Yî˜xÞikŠë[ÙR"À¢f—'7DW'&÷%7FW¢f—'7Ew&öæu7FWæ§VFvÖVçBÇÂW'&÷%G—RÀ¢f—'7E7FW3¢f—'7Ew&öæu7FWç7GVFVçD6öçFVçBÇÂf—'7Bç7GVFVçDç7vW"ÇÂ.šinjÊKÙÎzÙNŠë[ÙR"À¢&WG'•7FWW&f÷&Öæ6S¢Æö÷ç&WFW7Còç76VBò.X[>™Jî™IžŠúþ[{.{ªjÚ>ûÈÎjÚ^šªNi»NŠxNˆÈ2"¢.[è^ZèÎh‰Xéþš)Ž˜xÞX¢"À¢6ÖTW'&÷%&WVFVC¢Æö÷ç&WFW7Còç76V@¢Ó°¢&WGW&âÆö÷°§Ð ¦6öç7B6W'fW"Ò‡GGæ7&VFU6W'fW"‚‡&WÂ&W2’Óâ°¢–b‡&WçW&Âç7F'G5v—F‚‚"ö’ò"’’°¢’‡&WÂ&W2’æ6F6‚‚†W'&÷"’Óâ6VæB‡&W2ÂSÂ²W'&÷#¢W'&÷"æÖW76vRÒ’“°¢ÒVÇ6R°¢V&Æ–4f–ÆR‡&WÂ&W2“°¢Ð§Ò“° §6W'fW"æÆ—7FVâ…õ%BÂ#ããã"Â‚’Óâ°¢6öç6öÆRæÆör†’ÖF‚6ö6‚Æ—7FVæ–æröâããã¢Gµõ%GÖ“°¢6öç6öÆRæÆör‚%7GVFVçB–çf—FR6öFW3¢ÔDƒÒÔDƒ"“°¢6öç6öÆRæÆör„DÔ”åô´U’ò$FÖ–âVæ&ÆVBv—F‚DÔ”åô´U’"¢$FÖ–âF—6&ÆVC¢DÔ”åô´U’—2æ÷B6öæf–wW&VB"“°§Ò“° 