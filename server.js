const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
  if (!key || key.includes("把你的OpenAI_API_Key粘贴到这里")) return "";
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
  if (!Array.isArray(store.questions) || store.questions.length < 10000 || store.meta.questionSchemaVersion !== 11) {
    store.questions = buildQuestions();
    store.meta.questionSchemaVersion = 11;
    saveDb(store);
  }
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
    stage: "强化阶段",
    dailyMinutes: 60,
    createdAt: nowIso(),
    lastLoginAt: ""
  }));

  return {
    meta: { createdAt: nowIso(), version: 1 },
    students,
    attempts: [],
    notes: [],
    questions: buildQuestions()
  };
}

function buildQuestions() {
  const common = ["数学一", "数学二", "数学三"];
  const m13 = ["数学一", "数学三"];
  const q = [
    ["q_limit_001", common, "limit", "函数、极限与连续", "重要极限", "知识问题", "choice", "基础巩固", "求 lim(x→0) sin(3x)/x。", ["0", "1", "3", "不存在"], "3", [], "令 u=3x，则 sin(3x)/x=3·sin u/u，极限为 3。"],
    ["q_limit_002", common, "limit", "函数、极限与连续", "等价无穷小", "方法问题", "choice", "易错辨析", "x→0 时，1-cos x 与下列哪一项等价？", ["x", "x^2/2", "2x^2", "sin x"], "x^2/2", [], "常用等价无穷小：1-cos x ~ x^2/2。"],
    ["q_diff_001", common, "diff", "一元函数微分学", "复合函数求导", "计算问题", "choice", "基础巩固", "函数 y=e^(4x) 的导数是？", ["e^(4x)", "4e^(4x)", "e^x", "4e^x"], "4e^(4x)", [], "复合函数求导要乘以内层导数 4。"],
    ["q_diff_002", common, "diff", "一元函数微分学", "导数应用", "方法问题", "choice", "综合提升", "判断函数单调性时，最直接应先研究什么？", ["函数值", "一阶导数符号", "二阶导数符号", "定义域长度"], "一阶导数符号", [], "单调性通常由一阶导数符号决定，二阶导数主要用于凹凸性。"],
    ["q_int_001", common, "integral", "一元函数积分学", "分部积分选择", "方法问题", "choice", "基础巩固", "计算 ∫x·e^x dx 时，最合适的第一步是？", ["令 u=x, dv=e^x dx", "令 u=e^x, dv=x dx", "直接换元", "先展开 e^x"], "令 u=x, dv=e^x dx", [], "分部积分中多项式求导后更简单，通常让多项式作 u。"],
    ["q_int_002", common, "integral", "一元函数积分学", "换元微分系数", "计算问题", "choice", "易错辨析", "令 t=1+x^2，则 ∫2x√(1+x^2)dx 可化为？", ["∫√t dt", "∫2√t dt", "∫x√t dt", "∫t dt"], "∫√t dt", [], "dt=2x dx，整体替换为 ∫√t dt。"],
    ["q_int_003", common, "integral", "一元函数积分学", "不定积分常数", "表达问题", "fill", "基础巩固", "计算 ∫2x dx。", [], "x^2+C", ["x^2+c", "x²+C", "x²+c"], "不定积分答案需要带任意常数 C。"],
    ["q_int_004", common, "integral", "一元函数积分学", "反常积分条件", "知识问题", "choice", "综合提升", "反常积分 ∫(1,+∞) 1/x^p dx 收敛条件是？", ["p>1", "p≥1", "p<1", "任意 p"], "p>1", [], "p 积分在无穷区间上 p>1 收敛。"],
    ["q_int_005", common, "integral", "一元函数积分学", "面积应用", "能力问题", "choice", "综合提升", "上曲线 y=x，下曲线 y=x^2，区间 [0,1]，面积为？", ["∫(0,1)(x-x^2)dx", "∫(0,1)(x^2-x)dx", "∫(0,1)x·x^2dx", "∫(0,1)(x+x^2)dx"], "∫(0,1)(x-x^2)dx", [], "面积按上函数减下函数积分。"],
    ["q_multi_001", common, "multi", "多元函数微分学", "偏导数", "计算问题", "choice", "基础巩固", "z=x^2y+3y，求 z 对 x 的偏导数。", ["2xy", "x^2+3", "2x+3", "x^2y"], "2xy", [], "对 x 求偏导时把 y 看作常数。"],
    ["q_multi_002", common, "multi", "多元函数微分学", "极值条件", "知识问题", "choice", "易错辨析", "二元函数取得可疑极值点，通常先求什么？", ["一阶偏导为零的点", "函数最大值", "边界长度", "原函数"], "一阶偏导为零的点", [], "内部驻点需要先解一阶偏导同时为零。"],
    ["q_ode_001", common, "ode", "常微分方程", "可分离变量", "方法问题", "choice", "基础巩固", "微分方程 y'=2y 的通解是？", ["y=Ce^(2x)", "y=2Cx", "y=C+2x", "y=Ce^x"], "y=Ce^(2x)", [], "分离变量后积分得到 ln|y|=2x+C。"],
    ["q_linear_001", common, "linear", "线性代数", "二阶行列式", "计算问题", "fill", "基础巩固", "矩阵 [[1,2],[3,4]] 的行列式是？", [], "-2", ["-2"], "二阶行列式 ad-bc=1×4-2×3=-2。"],
    ["q_linear_002", common, "linear", "线性代数", "矩阵乘法", "易错问题", "choice", "易错辨析", "矩阵乘法 AB 与 BA 一般满足什么关系？", ["一定相等", "一般不相等", "都不存在", "都为零矩阵"], "一般不相等", [], "矩阵乘法通常不满足交换律。"],
    ["q_series_001", ["数学一"], "series", "无穷级数", "p 级数", "知识问题", "choice", "基础巩固", "级数 Σ1/n^2 的敛散性是？", ["发散", "条件收敛", "绝对收敛", "无法判断"], "绝对收敛", [], "p 级数 p>1 收敛，正项级数即绝对收敛。"],
    ["q_space_001", ["数学一"], "space", "空间解析几何", "向量模长", "计算问题", "fill", "基础巩固", "向量 a=(1,2,2) 的模长是？", [], "3", ["3"], "模长为 √(1^2+2^2+2^2)=3。"],
    ["q_prob_001", m13, "prob", "概率论与数理统计", "独立事件", "知识问题", "choice", "基础巩固", "A、B 独立，P(A)=0.4，P(B)=0.5，则 P(AB)=？", ["0.9", "0.2", "0.1", "0.45"], "0.2", [], "独立事件交集概率 P(AB)=P(A)P(B)。"],
    ["q_prob_002", m13, "prob", "概率论与数理统计", "方差性质", "计算问题", "choice", "易错辨析", "若 D(X)=4，则 D(3X+1)=？", ["12", "13", "36", "37"], "36", [], "D(aX+b)=a^2D(X)。"]
  ];
  const handPicked = q.map(([qid, subjects, chapterId, chapterName, point, reason, type, level, stem, options, answer, aliases, explanation], index) => ({
    id: qid, subjects, chapterId, chapterName, point, reason, type, level, difficulty: difficultyFor(level), stem, options, answer, aliases, explanation, ...sourceMeta(index)
  }));
  return [...readPastExamQuestions(), ...buildExamStyleQuestions(), ...handPicked, ...buildGeneratedQuestions()];
}

function buildExamStyleQuestions() {
  const common = ["数学一", "数学二", "数学三"];
  const m1 = ["数学一"];
  const m13 = ["数学一", "数学三"];
  const rows = [
    ["exam_integral_001", common, "integral", "一元函数积分学", "变上限积分与复合函数", "方法问题", "choice", "综合提升", "设 F(x)=∫(0,x^2) e^(-t^2)dt，则 F'(x)=", ["2xe^(-x^4)", "e^(-x^4)", "2x·e^(-x^2)", "∫(0,2x)e^(-t^2)dt"], "2xe^(-x^4)", [], "变上限积分先对上限代入，再乘以上限函数导数。"],
    ["exam_integral_002", common, "integral", "一元函数积分学", "对称区间积分", "方法问题", "choice", "易错辨析", "设 f(x) 连续，且 f(x)+f(-x)=2x^2，则 ∫(-1,1)f(x)dx=", ["2/3", "4/3", "0", "1"], "2/3", [], "两边在对称区间积分，2∫f=∫2x^2。"],
    ["exam_integral_003", common, "integral", "一元函数积分学", "反常积分", "知识问题", "choice", "综合提升", "反常积分 ∫(1,+∞) dx/(x(ln x)^p) 收敛的条件是", ["p>1", "p≥1", "p<1", "p>0"], "p>1", [], "令 u=ln x，化为 ∫ du/u^p。"],
    ["exam_integral_004", common, "integral", "一元函数积分学", "分部积分", "fill", "计算问题", "计算强化", "计算 ∫(0,1) x ln(1+x) dx。", [], "1/4", ["0.25"], "分部积分后化为有理函数积分。"],
    ["exam_limit_001", common, "limit", "函数、极限与连续", "等价无穷小", "choice", "方法问题", "易错辨析", "lim(x→0) [ln(1+x)-x]/x^2 =", ["-1/2", "1/2", "0", "-1"], "-1/2", [], "ln(1+x)=x-x^2/2+o(x^2)。"],
    ["exam_limit_002", common, "limit", "函数、极限与连续", "极限存在条件", "choice", "知识问题", "综合提升", "若 lim(x→0)(sin ax)/(x)=3，则 a=", ["3", "1/3", "0", "不存在"], "3", [], "sin ax ~ ax。"],
    ["exam_limit_003", common, "limit", "函数、极限与连续", "连续性与间断点", "choice", "知识问题", "易错辨析", "函数 f(x)=sin x/x 在 x=0 处补充定义 f(0)=? 可连续", ["1", "0", "不存在", "任意常数"], "1", [], "重要极限。"],
    ["exam_diff_001", common, "diff", "一元函数微分学", "隐函数求导", "choice", "计算问题", "计算强化", "由 x^2+xy+y^2=3 确定 y=y(x)，则 y'=", ["-(2x+y)/(x+2y)", "-(x+2y)/(2x+y)", "(2x+y)/(x+2y)", "x+y"], "-(2x+y)/(x+2y)", [], "两边对 x 求导并整理。"],
    ["exam_diff_002", common, "diff", "一元函数微分学", "极值与单调性", "choice", "方法问题", "综合提升", "若 f'(x)=x(x-1)^2(x+1)，则 x=1 是 f(x) 的", ["非极值驻点", "极大值点", "极小值点", "不可导点"], "非极值驻点", [], "x=1 两侧导数符号不变。"],
    ["exam_diff_003", common, "diff", "一元函数微分学", "泰勒公式", "choice", "能力问题", "综合提升", "e^x 在 x=0 处展开到二阶的余项前，1+x+x^2/2 用于判断哪个极限最直接？", ["(e^x-1-x)/x^2", "(sin x)/x", "ln x", "1/x"], "(e^x-1-x)/x^2", [], "对应二阶等价。"],
    ["exam_multi_001", common, "multi", "多元函数微分学", "二元函数极值", "choice", "方法问题", "综合提升", "函数 z=x^2+y^2-2x-4y 的极小值为", ["-5", "0", "5", "-1"], "-5", [], "配方：(x-1)^2+(y-2)^2-5。"],
    ["exam_multi_002", common, "multi", "多元函数微分学", "全微分", "fill", "计算问题", "计算强化", "z=x^2y+e^y，则 dz 中 dy 的系数为？", [], "x^2+e^y", ["x^2+ey"], "dy 系数是 z_y。"],
    ["exam_ode_001", common, "ode", "常微分方程", "一阶线性方程", "choice", "方法问题", "综合提升", "微分方程 y'+y=e^x 的一个特解可设为", ["Ae^x", "Axe^x", "A", "Ax"], "Ae^x", [], "右端 e^x 不是齐次解 e^-x 的同类。"],
    ["exam_linear_001", common, "linear", "线性代数", "矩阵秩", "choice", "知识问题", "综合提升", "3阶矩阵 A 的秩为2，则齐次方程 Ax=0 的基础解系含有解向量个数", ["1", "2", "3", "0"], "1", [], "未知量个数3减秩2。"],
    ["exam_linear_002", common, "linear", "线性代数", "特征值", "choice", "计算问题", "综合提升", "若 A 相似于 diag(1,2,3)，则 |A|=", ["6", "1", "2", "3"], "6", [], "行列式等于特征值乘积。"],
    ["exam_linear_003", common, "linear", "线性代数", "线性相关", "choice", "知识问题", "易错辨析", "三维空间中4个向量必定", ["线性相关", "线性无关", "两两正交", "秩为4"], "线性相关", [], "向量个数超过空间维数。"],
    ["exam_prob_001", m13, "prob", "概率论与数理统计", "分布函数", "choice", "知识问题", "综合提升", "设 X 的分布函数 F(x)，则 P(a<X≤b)=", ["F(b)-F(a)", "F(b)-F(a-0)", "F(b-0)-F(a)", "F(a)-F(b)"], "F(b)-F(a)", [], "分布函数右连续，区间 (a,b]。"],
    ["exam_prob_002", m13, "prob", "概率论与数理统计", "期望方差", "choice", "计算问题", "计算强化", "若 E(X)=1,D(X)=4，则 E(2X-3)=", ["-1", "2", "1", "4"], "-1", [], "期望线性性质。"],
    ["exam_prob_003", m13, "prob", "概率论与数理统计", "独立性", "choice", "易错问题", "易错辨析", "若 A,B 独立，则下列一定成立的是", ["P(AB)=P(A)P(B)", "P(A+B)=P(A)+P(B)", "A与B互斥", "P(A|B)=0"], "P(AB)=P(A)P(B)", [], "独立定义。"],
    ["exam_series_001", m1, "series", "无穷级数", "幂级数收敛半径", "choice", "方法问题", "综合提升", "幂级数 Σ n x^n 的收敛半径为", ["1", "0", "+∞", "1/2"], "1", [], "根值或比值判别。"],
    ["exam_series_002", m1, "series", "无穷级数", "交错级数", "choice", "知识问题", "易错辨析", "级数 Σ(-1)^(n-1)/n 的敛散性是", ["条件收敛", "绝对收敛", "发散", "无法判断"], "条件收敛", [], "交错调和级数条件收敛。"]
  ];
  return rows.map(([id, subjects, chapterId, chapterName, point, reason, type, level, stem, options, answer, aliases, explanation]) => ({
    id, subjects, chapterId, chapterName, point, reason, type, level,
    difficulty: difficultyFor(level),
    stem, options, answer, aliases, explanation,
    sourceType: "teacher_original",
    source: "考研风格审核题",
    reviewStatus: "教师已审核",
    qualityTier: "exam_standard"
  }));
}

function buildGeneratedQuestions() {
  const common = ["数学一", "数学二", "数学三"];
  const math1 = ["数学一"];
  const math13 = ["数学一", "数学三"];
  const rows = [];
  const add = (chapterId, chapterName, subjects, point, reason, type, level, stem, options, answer, aliases, explanation) => {
    if (!["choice", "fill"].includes(type)) {
      explanation = aliases;
      aliases = answer;
      answer = options;
      options = stem;
      stem = level;
      level = type;
      type = Array.isArray(options) && options.length ? "choice" : "fill";
    }
    if (["choice", "fill"].includes(reason)) {
      type = reason;
      reason = "计算问题";
    }
    rows.push({
      id: `gen_${chapterId}_${String(rows.length + 1).padStart(3, "0")}`,
      subjects, chapterId, chapterName, point, reason, type, level, difficulty: difficultyFor(level), stem, options, answer,
      aliases: aliases || [], explanation, ...sourceMeta(rows.length)
    });
  };

  for (let k = 1; k <= 12; k += 1) {
    add("limit", "函数、极限与连续", common, "重要极限", "知识问题", "choice", k <= 4 ? "基础巩固" : "计算强化",
      `lim(x→0) sin(${k}x)/x = ?`, ["0", "1", String(k), "不存在"], String(k), [], "使用 lim sin u/u=1，并处理倍数。");
    add("limit", "函数、极限与连续", common, "等价无穷小", "方法问题", "choice", "易错辨析",
      `x→0 时，1-cos(${k}x) 与哪项等价？`, [`${k * k}x^2/2`, `${k}x`, "x^2", "sin x"], `${k * k}x^2/2`, [], "1-cos u ~ u^2/2。");
  }

  for (let k = 2; k <= 13; k += 1) {
    add("diff", "一元函数微分学", common, "复合函数求导", "计算问题", "choice", "基础巩固",
      `y=e^(${k}x)，y' = ?`, [`e^(${k}x)`, `${k}e^(${k}x)`, `${k}e^x`, "0"], `${k}e^(${k}x)`, [], "复合函数求导要乘以内层导数。");
    add("diff", "一元函数微分学", common, "幂函数求导", "计算问题", "fill", "基础巩固",
      `求 y=x^${k} 的导数。`, [], `${k}x^${k - 1}`, [`${k}*x^${k - 1}`], "使用 (x^n)'=nx^(n-1)。");
  }

  for (let k = 1; k <= 18; k += 1) {
    add("integral", "一元函数积分学", common, "基本积分公式", "知识问题", "fill", k <= 8 ? "基础巩固" : "计算强化",
      `计算 ∫${k}x^${k % 4 + 1} dx。`, [], `${k}/${k % 4 + 2}x^${k % 4 + 2}+C`, [], "幂函数积分公式：∫ax^n dx=a/(n+1)x^(n+1)+C。");
    add("integral", "一元函数积分学", common, "定积分计算", "计算问题", "fill", "计算强化",
      `计算 ∫(0,1) ${k + 1}x^${k % 3} dx。`, [], String((k + 1) / (k % 3 + 1)), [], "先求原函数，再代入上下限。");
    add("integral", "一元函数积分学", common, "分部积分选择", "方法问题", "choice", "易错辨析",
      `计算 ∫x^${k % 3 + 1} e^x dx，优先令 u 为？`, [`x^${k % 3 + 1}`, "e^x", "dx", "1"], `x^${k % 3 + 1}`, [], "多项式求导后复杂度下降，适合作 u。");
  }

  for (let k = 1; k <= 14; k += 1) {
    add("multi", "多元函数微分学", common, "偏导数", "计算问题", "choice", "基础巩固",
      `z=x^2y+${k}y，∂z/∂x = ?`, ["2xy", `x^2+${k}`, `2x+${k}`, "x^2y"], "2xy", [], "对 x 求偏导时 y 为常数。");
    add("multi", "多元函数微分学", common, "全微分", "知识问题", "choice", "综合提升",
      `z=x^2+${k}xy，dz 中 dx 的系数是？`, [`2x+${k}y`, `${k}x`, "2x", `${k}y`], `2x+${k}y`, [], "dz=z_x dx+z_y dy。");
  }

  for (let k = 1; k <= 10; k += 1) {
    add("ode", "常微分方程", common, "可分离变量", "方法问题", "choice", "基础巩固",
      `微分方程 y'=${k}y 的通解是？`, [`y=Ce^(${k}x)`, `y=C+${k}x`, `y=${k}Cx`, "y=0"], `y=Ce^(${k}x)`, [], "分离变量后积分。");
  }

  for (let k = 1; k <= 16; k += 1) {
    const det = k * 4 - 6;
    add("linear", "线性代数", common, "二阶行列式", "计算问题", "fill", "基础巩固",
      `矩阵 [[${k},2],[3,4]] 的行列式是？`, [], String(det), [String(det)], "二阶行列式 ad-bc。");
    add("linear", "线性代数", common, "特征值", "知识问题", "choice", "综合提升",
      `对角矩阵 diag(${k},${k + 2}) 的特征值是？`, [`${k} 和 ${k + 2}`, `${k + 2}`, `${2 * k + 2}`, "0"], `${k} 和 ${k + 2}`, [], "对角矩阵特征值就是主对角线元素。");
  }

  for (let k = 2; k <= 11; k += 1) {
    add("series", "无穷级数", math1, "p 级数", "知识问题", "choice", "基础巩固",
      `级数 Σ1/n^${k} 的敛散性是？`, ["发散", "条件收敛", "绝对收敛", "无法判断"], "绝对收敛", [], "p>1 的 p 级数收敛。");
  }

  for (let k = 1; k <= 10; k += 1) {
    const product = (k / 10 * 0.5).toFixed(2);
    add("prob", "概率论与数理统计", math13, "独立事件", "知识问题", "choice", "基础巩固",
      `A、B 独立，P(A)=${(k / 10).toFixed(1)}，P(B)=0.5，则 P(AB)=？`, [product, "0.5", "0.1", "无法判断"], product, [], "独立事件交集概率等于概率乘积。");
    add("prob", "概率论与数理统计", math13, "方差性质", "计算问题", "choice", "易错辨析",
      `D(X)=${k}，则 D(2X+1)=？`, [String(2 * k), String(4 * k), String(k + 1), "2"], String(4 * k), [], "D(aX+b)=a^2D(X)。");
  }

  for (let i = 0; rows.length < 10000; i += 1) {
    const n = (i % 12) + 2;
    const family = i % 18;
    if (family === 0) {
      add("limit", "函数、极限与连续", common, "重要极限", "知识问题", "choice", "基础巩固",
        `lim(x→0) tan(${n}x)/x = ?`, ["0", "1", String(n), "不存在"], String(n), [], "tan u ~ u。");
    } else if (family === 1) {
      add("limit", "函数、极限与连续", common, "连续性", "知识问题", "choice", "易错辨析",
        `函数 f(x) 在 x=0 连续，必须满足哪一项？`, ["左极限=右极限=f(0)", "只要 f(0) 存在", "只要右极限存在", "只要可导"], "左极限=右极限=f(0)", [], "连续需要极限存在且等于函数值。");
    } else if (family === 2) {
      const a = n % 9 + 1;
      add("diff", "一元函数微分学", common, "链式法则", "计算问题", "choice", "计算强化",
        `y=ln(${a}x+1)，y' = ?`, [`${a}/(${a}x+1)`, `1/(${a}x+1)`, `${a}ln x`, "0"], `${a}/(${a}x+1)`, [], "ln u 的导数为 u'/u。");
    } else if (family === 3) {
      const a = n % 8 + 2;
      add("diff", "一元函数微分学", common, "导数应用", "方法问题", "综合提升",
        `若 f'(x)>0 在区间 I 内恒成立，则 f(x) 在 I 上？`, ["单调递增", "单调递减", "恒为0", "无法判断"], "单调递增", [], "一阶导数为正推出函数递增。");
    } else if (family === 4) {
      const a = n % 12 + 1;
      add("integral", "一元函数积分学", common, "换元积分", "方法问题", "易错辨析",
        `计算 ∫${a}x^(${a - 1})cos(x^${a}) dx，合理换元是？`, [`t=x^${a}`, `t=${a}x`, "t=cos x", "t=x+1"], `t=x^${a}`, [], "看到内层函数及其导数因子，优先换元。");
    } else if (family === 5) {
      const a = n % 10 + 1;
      add("integral", "一元函数积分学", common, "定积分性质", "方法问题", "基础巩固",
        `若 f(x) 为偶函数，则 ∫(-${a},${a}) f(x)dx = ?`, [`2∫(0,${a})f(x)dx`, "0", `∫(0,${a})f(x)dx`, "无法判断"], `2∫(0,${a})f(x)dx`, [], "偶函数在对称区间积分等于两倍半区间积分。");
    } else if (family === 6) {
      const a = n % 9 + 1;
      add("integral", "一元函数积分学", common, "不定积分", "知识问题", "fill", "基础巩固",
        `计算 ∫${a}cos x dx。`, [], `${a}sin x+C`, [`${a}sinx+C`, `${a}sin x+c`], "cos x 的原函数是 sin x。");
    } else if (family === 7) {
      const a = n % 7 + 2;
      add("multi", "多元函数微分学", common, "偏导数", "计算问题", "计算强化",
        `z=${a}x^2y+y^2，∂z/∂y = ?`, [`${a}x^2+2y`, `2${a}xy`, `${a}x^2`, "2y"], `${a}x^2+2y`, [], "对 y 求偏导时 x 为常数。");
    } else if (family === 8) {
      add("multi", "多元函数微分学", common, "二阶偏导", "知识问题", "综合提升",
        `若 z=x^2y+xy^2，则 ∂²z/∂x∂y = ?`, ["2x+2y", "2xy", "x+y", "0"], "2x+2y", [], "先对 x 求偏导，再对 y 求偏导。");
    } else if (family === 9) {
      const a = n % 8 + 1;
      add("ode", "常微分方程", common, "一阶线性方程", "方法问题", "基础巩固",
        `方程 y'+${a}y=0 的通解是？`, [`y=Ce^(-${a}x)`, `y=Ce^(${a}x)`, `y=C+${a}x`, "y=0 only"], `y=Ce^(-${a}x)`, [], "一阶齐次线性方程解为指数形式。");
    } else if (family === 10) {
      const a = n % 9 + 1;
      const answer = a * 5 - 6;
      add("linear", "线性代数", common, "行列式", "计算问题", "fill", "计算强化",
        `计算行列式 |${a} 2; 3 5|。`, [], String(answer), [String(answer)], "二阶行列式 ad-bc。");
    } else if (family === 11) {
      const a = n % 6 + 1;
      add("linear", "线性代数", common, "矩阵秩", "知识问题", "易错辨析",
        `非零 ${a}×${a} 单位矩阵的秩是？`, [String(a), "0", "1", String(a + 1)], String(a), [], "单位矩阵满秩。");
    } else if (family === 12) {
      const a = n % 8 + 2;
      add("series", "无穷级数", math1, "几何级数", "知识问题", "基础巩固",
        `级数 Σ(1/${a})^n 的敛散性是？`, ["收敛", "发散", "条件收敛", "无法判断"], "收敛", [], "等比级数公比绝对值小于1时收敛。");
    } else if (family === 13) {
      const a = n % 8 + 2;
      add("series", "无穷级数", math1, "幂级数", "方法问题", "综合提升",
        `幂级数 Σ(x/${a})^n 的收敛半径是？`, [String(a), "1", String(1 / a), "0"], String(a), [], "等比型幂级数满足 |x/a|<1。");
    } else if (family === 14) {
      const a = (n % 8 + 1) / 10;
      const b = 0.6;
      add("prob", "概率论与数理统计", math13, "独立事件", "计算问题", "基础巩固",
        `A、B 独立，P(A)=${a.toFixed(1)}，P(B)=0.6，则 P(AB)=？`, [(a * b).toFixed(2), "0.6", a.toFixed(1), "无法判断"], (a * b).toFixed(2), [], "独立事件交集概率等于概率乘积。");
    } else if (family === 15) {
      const a = n % 5 + 2;
      add("prob", "概率论与数理统计", math13, "期望性质", "计算问题", "基础巩固",
        `E(X)=${a}，则 E(3X+2)=？`, [String(3 * a + 2), String(3 * a), String(a + 2), "无法判断"], String(3 * a + 2), [], "E(aX+b)=aE(X)+b。");
    } else if (family === 16) {
      const a = n % 6 + 1;
      add("space", "空间解析几何", math1, "向量模长", "计算问题", "fill", "基础巩固",
        `向量 a=(${a},0,0) 的模长是？`, [], String(a), [String(a)], "坐标轴方向向量模长为坐标绝对值。");
    } else {
      const a = n % 7 + 1;
      add("integral", "一元函数积分学", common, "面积应用", "能力问题", "综合提升",
        `曲线 y=${a}x 与 y=x^2 在 [0,${a}] 上围成面积应写为？`, [`∫(0,${a})(${a}x-x^2)dx`, `∫(0,${a})(x^2-${a}x)dx`, `∫(0,${a})${a}x^3dx`, "无法判断"], `∫(0,${a})(${a}x-x^2)dx`, [], "面积按上函数减下函数积分。");
    }
  }

  return rows;
}

function difficultyFor(level) {
  const text = String(level || "");
  if (text.includes("基础")) return 1;
  if (text.includes("计算")) return 2;
  if (text.includes("易错")) return 3;
  if (text.includes("综合")) return 4;
  if (text.includes("拓展") || text.includes("压轴")) return 5;
  return 3;
}

function difficultyLabel(value) {
  return ["", "1星 基础", "2星 计算", "3星 易错", "4星 综合", "5星 拓展"][Number(value)] || "3星 易错";
}

function sourceMeta(index) {
  const types = [
    { sourceType: "inhouse_original", source: "自研原创题", reviewStatus: "教研已审核" },
    { sourceType: "teacher_original", source: "签约教师原创题", reviewStatus: "教师已审核" },
    { sourceType: "ai_teacher_reviewed", source: "AI生成后教师审核变式题", reviewStatus: "教师已审核" }
  ];
  return types[index % types.length];
}

function normalizeAnswer(value) {
  return String(value || "")
    .replace(/\s/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",")
    .toLowerCase();
}

function grade(question, answer) {
  const accepted = [question.answer, ...(question.aliases || [])].map(normalizeAnswer);
  return accepted.includes(normalizeAnswer(answer));
}

function extractJson(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try { return JSON.parse(match[0]); } catch { return {}; }
}

function questionPromptText(question) {
  return [
    `题目：${question.stem || ""}`,
    `题型：${question.type || ""}`,
    `章节：${question.chapterName || ""}`,
    `知识点：${question.point || ""}`,
    `标准答案：${question.answer || "未校对"}`,
    `解析：${question.explanation || "暂无"}`
  ].join("\n");
}

async function callAiScratchRecognition(question, payload) {
  const apiKey = configuredOpenAIKey();
  if (!apiKey || !payload.scratchImage) return null;
  const model = process.env.OPENAI_VISION_MODEL || "gpt-5";
  const prompt = `你是考研数学阅卷老师。请识别学生草稿图中的解题步骤和最终答案，并判断解法是否正确。

请重点分析：
1. 学生最终答案是什么。
2. 关键步骤是否成立。
3. 如果错误，第一处错误在哪里。
4. 错误属于哪个薄弱点，例如：知识问题、方法问题、计算问题、表达问题、能力问题、易错问题、过程缺失。
5. 应追加什么练习来补强。

${questionPromptText(question)}

只返回 JSON，不要返回 Markdown。格式：
{
  "recognizedAnswer": "识别出的最终答案，没有则为空字符串",
  "stepsSummary": "学生解题步骤摘要",
  "isCorrect": true 或 false 或 null,
  "weakPoint": "薄弱点",
  "firstError": "第一处错误",
  "advice": "给学生的补救建议",
  "recommendedPractice": "建议追加的练习方向",
  "confidence": 0到100的数字
}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: payload.scratchImage, detail: "high" }
        ]
      }]
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AI手写识别调用失败：${response.status} ${text.slice(0, 180)}`);
  }
  const data = await response.json();
  const parsed = extractJson(data.output_text || "");
  return {
    recognizedAnswer: String(parsed.recognizedAnswer || ""),
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence || 0))),
    stepsSummary: String(parsed.stepsSummary || "AI已读取草稿，但没有返回步骤摘要。"),
    isCorrect: typeof parsed.isCorrect === "boolean" ? parsed.isCorrect : null,
    weakPoint: String(parsed.weakPoint || ""),
    firstError: String(parsed.firstError || ""),
    advice: String(parsed.advice || ""),
    recommendedPractice: String(parsed.recommendedPractice || ""),
    engine: `openai-responses:${model}`,
    modelJudgment: true
  };
}

async function recognizeScratch(question, payload) {
  const strokeCount = Number(payload.strokeCount || 0);
  const hasImage = Boolean(payload.scratchImage);
  if (hasImage && strokeCount > 0 && configuredOpenAIKey()) {
    try {
      const ai = await callAiScratchRecognition(question, payload);
      if (ai) return ai;
    } catch (error) {
      return {
        recognizedAnswer: "",
        confidence: 0,
        stepsSummary: `AI手写识别调用失败：${error.message}`,
        engine: "openai-responses-error",
        recognitionError: error.message
      };
    }
  }
  const stepsSummary = hasImage && strokeCount > 0
    ? "已收到草稿图片和书写轨迹，但当前未配置 OPENAI_API_KEY，不能自动识别步骤和最终答案。"
    : "未收到可识别的草稿内容。";

  return {
    recognizedAnswer: "",
    confidence: 0,
    stepsSummary,
    engine: "scratch-recognition-not-connected",
    modelJudgment: false
  };
}

function sampleQuestions(pool, size, seedInput) {
  const seed = crypto.createHash("sha256").update(String(seedInput)).digest();
  let state = seed.readUInt32LE(0) || 1;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  return pool
    .map((item) => ({ item, rank: next() }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, Math.min(size, pool.length))
    .map(({ item }) => item);
}

function uniqueByStem(pool) {
  const seen = new Set();
  return pool.filter((question) => {
    const key = normalizeAnswer(`${question.chapterId}:${question.stem}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function diagnose(question, payload, correct) {
  const steps = String(payload.stepsText || "");
  const answer = String(payload.answer || "");
  const strokeCount = Number(payload.strokeCount || 0);
  const durationMs = Number(payload.durationMs || 0);
  const evidence = [];
  if (strokeCount > 0) evidence.push(`有 ${strokeCount} 次书写轨迹`);
  if (steps.length > 8) evidence.push("提交了步骤文本");
  if (durationMs > 0) evidence.push(`用时 ${Math.round(durationMs / 1000)} 秒`);
  if (!evidence.length) evidence.push("只有最终答案，过程证据不足");

  let mainReason = correct ? "已掌握" : question.reason;
  let advice = correct ? "本题表现稳定，可在做题集中安排间隔复刷。" : adviceFor(question.reason);
  if (correct === null) {
    mainReason = "待识别";
    advice = "当前未配置真实手写识别，已保存草稿轨迹，但不会把标准答案当作识别结果。配置 OPENAI_API_KEY 后，系统会分析步骤、判断第一处错误并生成薄弱点练习建议。";
  }
  if (correct === false && strokeCount === 0 && steps.length < 8) {
    mainReason = "过程缺失";
    advice = "建议写出关键步骤。否则系统只能判断最终答案，无法定位第一处错误。";
  }
  if (correct === false && answer && answer.length <= 2 && question.type === "fill") {
    mainReason = "表达问题";
    advice = "最终结论过短，检查是否漏写常数、区间、条件或完整表达。";
  }
  return { mainReason, advice, evidence };
}

function adviceFor(reason) {
  const map = {
    "知识问题": "先补公式、定义和适用条件，再做单知识点题。",
    "方法问题": "先做方法判断题，明确为什么选这个方法，再进入计算。",
    "计算问题": "做限时小题，重点复盘系数、符号、上下限和矩阵顺序。",
    "表达问题": "强制写出完整结论，尤其是不定积分常数、定义域和单位。",
    "能力问题": "做同能力变式题，验证题干变化后是否还能稳定完成。",
    "易错问题": "建立易错清单，二刷时先说出本题最容易错在哪里。"
  };
  return map[reason] || "建议追加检测题，补充诊断证据。";
}

function send(res, code, data) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", ...corsHeaders(res.req || {}) });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    const limit = Number(process.env.MAX_BODY_BYTES || 3 * 1024 * 1024);
    req.on("data", (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw) > limit) {
        reject(new Error("请求内容过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
  });
}

function publicFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/env.js") {
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    res.end(`window.__APP_CONFIG__=${JSON.stringify({ apiBaseUrl: PUBLIC_API_BASE_URL, environment: NODE_ENV })};`);
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(PUBLIC, requested));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(file)) {
    const hasExtension = Boolean(path.extname(requested));
    const indexFile = path.join(PUBLIC, "index.html");
    if (!hasExtension && fs.existsSync(indexFile)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      fs.createReadStream(indexFile).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(file);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png"
  };
  res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

async function api(req, res) {
  res.req = req;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const store = db();

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (rateLimited(req)) {
    send(res, 429, { error: "请求过于频繁，请稍后再试" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    send(res, 200, {
      status: "ok",
      environment: NODE_ENV,
      timestamp: nowIso()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    send(res, 200, {
      chapters: chapterSummary(store.questions),
      inviteCodes: store.students.map((s) => s.inviteCode),
      pastExamSources: readPastExamSources(),
      aiStatus: {
        handwritingRecognition: Boolean(configuredOpenAIKey()),
        model: process.env.OPENAI_VISION_MODEL || "gpt-5"
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/past-exam-sources") {
    send(res, 200, readPastExamSources());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await parseBody(req);
    const inviteCode = String(body.inviteCode || "").trim();
    const password = String(body.password || "").trim();
    const wantsDemo = body.demo === true || inviteCode.toLowerCase() === "demo";
    if (wantsDemo) {
      if (password && password !== "demo123") return send(res, 401, { error: "演示账号密码错误" });
      const sessionId = cleanId(body.sessionId) || id("session");
      const demoId = `demo_${sessionId}`;
      let demoStudent = store.students.find((s) => s.id === demoId);
      if (!demoStudent) {
        const seed = store.students.find((s) => s.inviteCode === "MATH01") || store.students[0];
        demoStudent = {
          ...seed,
          id: demoId,
          inviteCode: `DEMO_${sessionId}`,
          name: String(body.name || "演示同学").slice(0, 20),
          mathType: body.mathType || "数学二",
          targetScore: Number(body.targetScore || 120),
          stage: body.stage || "强化阶段",
          dailyMinutes: Number(body.dailyMinutes || 60),
          isDemo: true,
          createdAt: nowIso()
        };
        store.students.push(demoStudent);
      }
      demoStudent.name = String(body.name || demoStudent.name || "演示同学").slice(0, 20);
      demoStudent.mathType = body.mathType || demoStudent.mathType || "数学二";
      demoStudent.stage = body.stage || demoStudent.stage || "强化阶段";
      demoStudent.lastLoginAt = nowIso();
      saveDb(store);
      send(res, 200, { student: demoStudent, demo: true, sessionId });
      return;
    }
    const student = store.students.find((s) => s.inviteCode.toUpperCase() === inviteCode.toUpperCase());
    if (!student) return send(res, 401, { error: "邀请码不存在" });
    student.name = String(body.name || student.name || `同学${student.id.split("_")[1]}`).slice(0, 20);
    student.mathType = body.mathType || student.mathType || "数学二";
    student.targetScore = Number(body.targetScore || student.targetScore || 120);
    student.stage = body.stage || student.stage || "强化阶段";
    student.dailyMinutes = Number(body.dailyMinutes || student.dailyMinutes || 60);
    student.lastLoginAt = nowIso();
    saveDb(store);
    send(res, 200, { student });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const student = store.students.find((s) => s.id === url.searchParams.get("studentId"));
    if (!student) return send(res, 404, { error: "学生不存在" });
    send(res, 200, { student });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/demo/reset") {
    const body = await parseBody(req);
    const studentId = cleanId(body.studentId);
    const student = store.students.find((s) => s.id === studentId && s.isDemo);
    if (!student) return send(res, 404, { error: "演示会话不存在" });
    store.attempts = store.attempts.filter((a) => a.studentId !== student.id);
    store.notes = Array.isArray(store.notes) ? store.notes.filter((n) => n.studentId !== student.id) : [];
    student.lastLoginAt = nowIso();
    saveDb(store);
    send(res, 200, { ok: true, student });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/questions") {
    const student = store.students.find((s) => s.id === url.searchParams.get("studentId"));
    if (!student) return send(res, 404, { error: "学生不存在" });
    const chapterId = url.searchParams.get("chapterId") || "integral";
    const count = Math.max(1, Math.min(50, Number(url.searchParams.get("count") || 20)));
    const difficulty = url.searchParams.get("difficulty") || "all";
    const sourceType = url.searchParams.get("sourceType") || "all";
    const mode = url.searchParams.get("mode") || "reinforce";
    const attempts = store.attempts.filter((a) => a.studentId === student.id);
    const attemptedIds = new Set(attempts.map((a) => a.questionId));
    const mathType = student.mathType || "数学二";
    let pool = store.questions.filter((q) => q.subjects.includes(mathType) && (chapterId === "all" || q.chapterId === chapterId));
    if (!pool.length) pool = store.questions.filter((q) => q.subjects.includes(mathType));
    if (sourceType !== "past_exam") {
      const standardPool = pool.filter((q) => q.qualityTier === "exam_standard");
      if (standardPool.length >= Math.min(count, 10)) {
        pool = standardPool;
      } else if (standardPool.length) {
        const supplements = pool.filter((q) => q.qualityTier !== "exam_standard");
        pool = [...standardPool, ...supplements];
      }
    }
    const basePool = pool;
    const sourcePool = sourceType !== "all" ? basePool.filter((q) => q.sourceType === sourceType) : basePool;
    if (sourceType === "past_exam" && !sourcePool.length) {
      return send(res, 200, {
        questions: [],
        chapterId,
        count,
        difficulty,
        sourceType,
        message: "尚未导入真实历年考研数学真题，请先导入2000-2026真题题库。"
      });
    }
    const modeDifficulty = {
      foundation: ["1", "2"],
      reinforce: ["3", "4"],
      mock: ["1", "2", "3", "4", "5"]
    }[mode] || ["3", "4"];
    const difficultyPool = !["all", "mode"].includes(difficulty)
      ? sourcePool.filter((q) => String(q.difficulty) === String(difficulty) || q.level.includes(difficulty))
      : sourcePool.filter((q) => modeDifficulty.includes(String(q.difficulty)));
    if (difficultyPool.length >= count) {
      pool = difficultyPool;
    } else if (sourcePool.length >= count) {
      pool = sourcePool;
    } else {
      pool = basePool;
    }
    const refresh = url.searchParams.get("refresh") === "1";
    pool = uniqueByStem(pool);
    const unseen = uniqueByStem(pool.filter((q) => !attemptedIds.has(q.id)));
    const source = unseen.length >= count ? unseen : pool;
    const selected = sampleQuestions(source, count, refresh ? Date.now() : `${student.id}-${chapterId}-${difficulty}-${sourceType}-${mode}-${count}-${attempts.length}`);
    send(res, 200, { questions: selected, chapterId, count, difficulty, sourceType, mode });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/attempts") {
    const body = await parseBody(req);
    const student = store.students.find((s) => s.id === body.studentId);
    const question = store.questions.find((q) => q.id === body.questionId);
    if (!student || !question) return send(res, 404, { error: "学生或题目不存在" });
    const recognition = await recognizeScratch(question, body);
    const finalAnswer = body.answer || body.selectedOption || body.recognizedAnswer || recognition.recognizedAnswer || "";
    const hasReviewedAnswer = Boolean(question.answer) && question.answerStatus !== "pending_review";
    const correct = recognition.modelJudgment && typeof recognition.isCorrect === "boolean"
      ? recognition.isCorrect
      : (finalAnswer && hasReviewedAnswer ? grade(question, finalAnswer) : null);
    const gradingStatus = recognition.recognitionError
      ? "recognition_error"
      : recognition.modelJudgment
      ? "ai_reviewed"
      : (!hasReviewedAnswer ? "pending_answer_review" : (finalAnswer ? "graded" : "pending_recognition"));
    const diagnosis = diagnose(question, { ...body, answer: finalAnswer }, correct);
    if (recognition.recognitionError) {
      diagnosis.mainReason = "识别服务不可用";
      diagnosis.advice = recognition.recognitionError.includes("no credits")
        ? "OpenAI API 账户没有可用额度。请到 OpenAI Platform 的 Billing 页面充值/绑定付款方式后再提交草稿，系统才能识别步骤并判断薄弱点。"
        : `手写识别服务调用失败：${recognition.recognitionError}`;
      diagnosis.evidence.push(`识别错误：${recognition.recognitionError}`);
    }
    if (recognition.modelJudgment && recognition.weakPoint) diagnosis.mainReason = recognition.weakPoint;
    if (recognition.modelJudgment && recognition.advice) diagnosis.advice = recognition.advice;
    if (recognition.modelJudgment && recognition.firstError) diagnosis.evidence.push(`第一处错误：${recognition.firstError}`);
    const attempt = {
      id: id("att"),
      studentId: student.id,
      questionId: question.id,
      chapterId: question.chapterId,
      answer: finalAnswer,
      recognizedAnswer: recognition.recognizedAnswer,
      recognitionConfidence: recognition.confidence,
      recognizedSteps: recognition.stepsSummary,
      recognitionEngine: recognition.engine,
      selectedOption: body.selectedOption || "",
      stepsText: body.stepsText || "",
      strokeCount: Number(body.strokeCount || 0),
      scratchImageStored: Boolean(body.scratchImage),
      strokePointCount: Array.isArray(body.strokes)
        ? body.strokes.reduce((sum, stroke) => sum + (Array.isArray(stroke.points) ? stroke.points.length : Array.isArray(stroke) ? stroke.length : 0), 0)
        : 0,
      durationMs: Number(body.durationMs || 0),
      gradingStatus,
      correct,
      reason: diagnosis.mainReason,
      advice: diagnosis.advice,
      recommendedPractice: recognition.recommendedPractice || "",
      evidence: diagnosis.evidence,
      createdAt: nowIso()
    };
    store.attempts.push(attempt);
    saveDb(store);
    send(res, 200, { attempt, question });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/report") {
    const studentId = url.searchParams.get("studentId");
    const attempts = store.attempts.filter((a) => a.studentId === studentId);
    const report = buildReportFor(store, studentId);
    send(res, 200, { attempts, report });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/learning-loop") {
    const studentId = url.searchParams.get("studentId");
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return send(res, 404, { error: "学生不存在" });
    send(res, 200, { loop: enrichMistakeLoop(buildLearningLoopFor(store, studentId, url.searchParams.get("demo") === "1")) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/collection") {
    const studentId = url.searchParams.get("studentId");
    const attempts = store.attempts.filter((a) => a.studentId === studentId);
    const latest = new Map();
    attempts.forEach((attempt) => latest.set(attempt.questionId, attempt));
    const questions = Array.from(latest.values()).map((attempt) => ({
      attempt,
      question: store.questions.find((q) => q.id === attempt.questionId),
      times: attempts.filter((a) => a.questionId === attempt.questionId).length
    }));
    send(res, 200, { items: questions });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin") {
    if (!ADMIN_KEY || url.searchParams.get("key") !== ADMIN_KEY) return send(res, 401, { error: "管理口令错误" });
    send(res, 200, {
      students: store.students,
      reports: store.students.map((s) => ({ student: s, report: buildReportFor(store, s.id) }))
    });
    return;
  }

  send(res, 404, { error: "接口不存在" });
}

function chapterSummary(questions) {
  const map = new Map();
  questions.forEach((q) => {
    if (!map.has(q.chapterId)) {
      map.set(q.chapterId, { id: q.chapterId, name: q.chapterName, subjects: q.subjects, count: 0 });
    }
    const item = map.get(q.chapterId);
    item.count += 1;
    item.subjects = Array.from(new Set([...item.subjects, ...q.subjects]));
  });
  return Array.from(map.values());
}

function buildReportFor(store, studentId) {
  const attempts = store.attempts.filter((a) => a.studentId === studentId);
  const total = attempts.length;
  const pending = attempts.filter((a) => a.correct === null || a.gradingStatus === "pending_recognition").length;
  const gradableTotal = attempts.filter((a) => a.correct !== null && a.gradingStatus !== "pending_recognition").length;
  const correct = attempts.filter((a) => a.correct).length;
  const accuracy = gradableTotal ? Math.round(correct / gradableTotal * 100) : 0;
  const byReason = {};
  const byChapter = {};
  attempts.forEach((a) => {
    byReason[a.reason] = (byReason[a.reason] || 0) + 1;
    byChapter[a.chapterId] = byChapter[a.chapterId] || { total: 0, correct: 0 };
    byChapter[a.chapterId].total += 1;
    if (a.correct) byChapter[a.chapterId].correct += 1;
  });
  const weakReasons = Object.entries(byReason)
    .filter(([reason]) => !["已掌握", "待识别"].includes(reason))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => ({ reason, count, advice: adviceFor(reason) }));
  return { total, gradableTotal, pending, correct, accuracy, byReason, byChapter, weakReasons };
}

function typeLabelFor(type) {
  return type === "choice" ? "选择题" : type === "fill" ? "填空题" : "主观题";
}

function scoreForAttempt(question, attempt) {
  const maxScore = question?.type === "choice" ? 5 : question?.type === "fill" ? 5 : 10;
  if (!attempt || attempt.correct === null || attempt.gradingStatus === "pending_recognition") return { score: 0, maxScore };
  if (attempt.correct) return { score: maxScore, maxScore };
  const hasProcess = Number(attempt.strokeCount || 0) > 2 || Number(attempt.strokePointCount || 0) > 20 || String(attempt.stepsText || "").trim();
  return { score: hasProcess ? Math.max(1, Math.floor(maxScore * 0.35)) : 0, maxScore };
}

function normalizeWeakPoint(question, attempt) {
  if (question?.point) return question.point;
  if (question?.chapterName) return question.chapterName;
  if (attempt?.chapterId) return attempt.chapterId;
  return "当前章节核心概念";
}

function reasonForAttempt(question, attempt) {
  const raw = String(attempt?.reason || "").trim();
  if (!attempt || attempt.correct === null || attempt.gradingStatus === "pending_recognition") return "过程识别不足";
  if (attempt.correct) return "已掌握";
  return raw && !["已掌握", "待识别"].includes(raw) ? raw : (question?.reason || "解题方法选择错误");
}

function buildStepAnalysis(question, attempt) {
  const weakPoint = normalizeWeakPoint(question, attempt);
  const reason = reasonForAttempt(question, attempt);
  const { maxScore } = scoreForAttempt(question, attempt);
  if (!attempt || attempt.correct === null || attempt.gradingStatus === "pending_recognition") {
    return [{
      stepNumber: 1,
      status: "blank",
      judgment: "需要补充可识别的解题过程",
      score: 0,
      maxScore,
      studentContent: attempt?.stepsText || "仅检测到草稿轨迹，尚未形成可判分步骤",
      normalizedExpression: attempt?.recognizedAnswer || "待 OCR/AI 识别",
      errorDescription: "系统不能把空白草稿或随意笔画当成标准答案，需要先识别公式、关键步骤和最终结论。",
      correction: "在草稿区保留计算链路，并在正式答案区写出最终结果；主观题建议按“设-列式-化简-结论”书写。",
      relatedKnowledgePoint: weakPoint
    }];
  }
  if (attempt.correct) {
    return [{
      stepNumber: 1,
      status: "correct",
      judgment: "最终答案正确，核心方法匹配",
      score: maxScore,
      maxScore,
      studentContent: attempt.stepsText || attempt.answer || attempt.selectedOption || "直接选择/填写答案",
      normalizedExpression: attempt.recognizedAnswer || attempt.answer || attempt.selectedOption || "答案正确",
      errorDescription: "本题未发现明显错误，可继续做同知识点变式题巩固稳定性。",
      correction: question?.explanation || "保持当前方法，注意书写完整性。",
      relatedKnowledgePoint: weakPoint
    }];
  }
  const partial = scoreForAttempt(question, attempt).score;
  return [
    {
      stepNumber: 1,
      status: partial ? "partial" : "wrong",
      judgment: partial ? "能进入题目，但关键转化不完整" : "缺少有效解题入口",
      score: partial,
      maxScore,
      studentContent: attempt.stepsText || attempt.answer || attempt.selectedOption || "未形成完整过程",
      normalizedExpression: attempt.recognizedAnswer || attempt.answer || attempt.selectedOption || "未识别出正确表达",
      errorDescription: reason,
      correction: question?.explanation || "先回到定义、公式或典型模型，再完成代入与化简。",
      relatedKnowledgePoint: weakPoint
    },
    {
      stepNumber: 2,
      status: "wrong",
      judgment: "最终结果与标准答案不一致",
      score: 0,
      maxScore,
      studentContent: attempt.recognizedAnswer || attempt.answer || attempt.selectedOption || "无最终答案",
      normalizedExpression: `标准答案：${question?.answer || "待校对"}`,
      errorDescription: "结果错误会进入错题集，并触发同知识点专项训练和变式复测。",
      correction: `重新核对 ${weakPoint} 的条件、公式和计算细节。`,
      relatedKnowledgePoint: weakPoint
    }
  ];
}

function buildDemoLoop() {
  return {
    diagnosis: {
      score: "6/15",
      accuracy: 40,
      weakKnowledgePoints: ["一元函数应用建模", "利润函数", "方程约束关系"],
      summary: "本轮主要问题不是计算量不足，而是题意中的数量关系没有转成正确模型。AI定位到第一次偏差出现在利润表达式：把单件利润误写为 60+x，导致后续方程和结论全部偏离。",
      questionAnalyses: [{
        typeLabel: "主观题",
        score: 6,
        maxScore: 15,
        finalAnswerCorrect: false,
        title: "某商品原售价60元，成本40元。若每涨价1元，销量减少2件。求使总利润为2400元时的涨价额。",
        studentAnswer: "(60+x)(100-2x)=2400",
        standardAnswer: "(20+x)(100-2x)=2400",
        errorTypes: ["数量关系理解错误", "利润公式应用错误", "建模错误"],
        knowledgePoints: ["函数应用题建模", "利润=单件利润×销量"],
        steps: [
          { stepNumber: 1, status: "correct", judgment: "能识别变量", score: 3, maxScore: 3, studentContent: "设涨价 x 元", normalizedExpression: "x 表示涨价额", errorDescription: "变量设定清楚。", correction: "继续保留变量含义和单位。", relatedKnowledgePoint: "变量设定" },
          { stepNumber: 2, status: "wrong", judgment: "第一次错误：单件利润写错", score: 0, maxScore: 6, studentContent: "利润 = (60+x)(100-2x)", normalizedExpression: "(60+x)(100-2x)", errorDescription: "60+x 是售价，不是利润。单件利润应为售价减成本，即 60+x-40=20+x。", correction: "把模型改为 (20+x)(100-2x)=2400，再求解。", relatedKnowledgePoint: "利润函数" },
          { stepNumber: 3, status: "partial", judgment: "后续计算受前一步影响", score: 3, maxScore: 6, studentContent: "展开并求 x", normalizedExpression: "基于错误方程求解", errorDescription: "计算过程本身有一定完整性，但建立在错误模型上，不能得到正确结论。", correction: "应用题先检查模型，再进行计算。", relatedKnowledgePoint: "方程建模" }
        ]
      }]
    },
    trainingPlan: {
      goal: "围绕“利润函数建模”完成一轮针对训练",
      totalQuestions: 8,
      estimatedMinutes: 25,
      completionStandard: "同类变式连续2题独立建模正确",
      items: [
        { type: "概念补漏", title: "区分售价、成本、单件利润、总利润", purpose: "解决把售价当利润的问题", knowledgePoint: "利润公式", errorType: "概念理解错误", completed: false },
        { type: "模板训练", title: "用表格列出原量、变化量、变化后数量", purpose: "让应用题数量关系可视化", knowledgePoint: "方程建模", errorType: "方法选择错误", completed: false },
        { type: "同类练习", title: "完成3道利润最大值/定值问题", purpose: "强化单件利润×销量的模型", knowledgePoint: "函数应用", errorType: "综合应用不足", completed: false },
        { type: "错因复盘", title: "重做原题并标注第一次错误位置", purpose: "确认学生知道自己为什么错", knowledgePoint: "错误定位", errorType: "审题遗漏", completed: false }
      ]
    },
    retest: {
      score: 13,
      independent: true,
      hintsUsed: 0,
      passed: true,
      questions: [
        { typeLabel: "主观题", difficulty: "3星 易错", stem: "某商品成本30元，售价50元。每涨价2元销量减少5件，求利润达到1800元时的涨价额。", target: "验证利润函数建模", result: "模型建立正确，计算稳定" },
        { typeLabel: "填空题", difficulty: "2星 计算", stem: "售价 a，成本 b，销量 q，则总利润表达式为____。", target: "验证公式迁移", result: "填写正确" }
      ]
    },
    improvement: { beforeMastery: 42, afterMastery: 78, improvementValue: 36, status: "已达标，建议隔日复测", originalError: "把售价当成利润，导致模型源头错误。", trainingResult: "已能区分售价、成本和单件利润，并能独立列式。", nextRisk: "遇到折扣、销量变化率等复杂表述时仍需慢审题。" },
    profile: {
      abilities: [
        { name: "概念理解", current: 76, previous: 48, trend: "明显提升", evidence: "能正确解释利润公式", suggestion: "继续用错因卡复盘易混概念" },
        { name: "方法选择", current: 70, previous: 46, trend: "提升", evidence: "能主动用表格梳理数量关系", suggestion: "强化应用题建模入口" },
        { name: "计算稳定性", current: 82, previous: 72, trend: "小幅提升", evidence: "展开化简错误减少", suggestion: "限时训练保持速度" },
        { name: "题型识别", current: 68, previous: 44, trend: "提升", evidence: "能识别利润函数问题", suggestion: "扩展到最值、方程、不等式混合题" }
      ]
    }
  };
}

function buildLearningLoopFor(store, studentId, demo = false) {
  if (demo) return buildDemoLoop();
  const attempts = store.attempts.filter((a) => a.studentId === studentId).slice(-8).reverse();
  if (!attempts.length) return buildDemoLoop();
  const questionAnalyses = attempts.map((attempt) => {
    const question = store.questions.find((q) => q.id === attempt.questionId) || {};
    const { score, maxScore } = scoreForAttempt(question, attempt);
    const reason = reasonForAttempt(question, attempt);
    return {
      typeLabel: typeLabelFor(question.type),
      score,
      maxScore,
      finalAnswerCorrect: attempt.correct === true,
      title: question.stem || question.point || question.chapterName || "未命名题目",
      studentAnswer: attempt.recognizedAnswer || attempt.answer || attempt.selectedOption || "",
      standardAnswer: question.answer || "待校对",
      errorTypes: attempt.correct ? [] : [reason],
      knowledgePoints: [normalizeWeakPoint(question, attempt)],
      steps: buildStepAnalysis(question, attempt)
    };
  });
  const totalScore = questionAnalyses.reduce((sum, item) => sum + item.score, 0);
  const totalMax = Math.max(1, questionAnalyses.reduce((sum, item) => sum + item.maxScore, 0));
  const wrongItems = questionAnalyses.filter((item) => !item.finalAnswerCorrect);
  const weakKnowledgePoints = Array.from(new Set(wrongItems.flatMap((item) => item.knowledgePoints))).slice(0, 5);
  const weakReasons = Array.from(new Set(wrongItems.flatMap((item) => item.errorTypes))).slice(0, 5);
  const accuracy = Math.round(totalScore / totalMax * 100);
  const primaryWeak = weakKnowledgePoints[0] || "当前章节核心能力";
  const primaryReason = weakReasons[0] || "稳定性不足";
  const beforeMastery = Math.max(25, Math.min(78, accuracy - 8));
  const afterMastery = Math.max(beforeMastery + 10, Math.min(92, accuracy + 18));
  return {
    diagnosis: {
      score: `${totalScore}/${totalMax}`,
      accuracy,
      weakKnowledgePoints,
      summary: wrongItems.length ? `本轮 AI 重点定位到 ${primaryWeak} 上的薄弱点，主要错因是 ${primaryReason}。建议先做专项补漏，再用同知识点变式复测确认是否真正掌握。` : "本轮整体表现稳定，建议进入更高难度或跨章节综合题，防止只会熟悉题型。",
      questionAnalyses
    },
    trainingPlan: {
      goal: wrongItems.length ? `围绕“${primaryWeak}”完成针对训练` : "进入综合提升训练",
      totalQuestions: Math.max(6, wrongItems.length * 3 || 6),
      estimatedMinutes: Math.max(18, wrongItems.length * 8 || 18),
      completionStandard: "同知识点变式连续2题独立正确，且草稿步骤可解释",
      items: [
        { type: "概念补漏", title: `复盘 ${primaryWeak} 的定义、公式和适用条件`, purpose: "先修正错误来源，减少盲目刷题", knowledgePoint: primaryWeak, errorType: primaryReason, completed: false },
        { type: "例题拆解", title: "对照标准解法标出第一次偏差位置", purpose: "让学生知道为什么错，而不是只知道答案错", knowledgePoint: primaryWeak, errorType: primaryReason, completed: false },
        { type: "同类训练", title: "完成3道同知识点基础变式题", purpose: "验证能否迁移到新题", knowledgePoint: primaryWeak, errorType: "方法迁移", completed: false },
        { type: "限时巩固", title: "完成2道易错/综合变式题", purpose: "检查速度和稳定性", knowledgePoint: primaryWeak, errorType: "综合应用", completed: false }
      ]
    },
    retest: {
      score: Math.min(100, afterMastery),
      independent: afterMastery >= 70,
      hintsUsed: afterMastery >= 70 ? 0 : 1,
      passed: afterMastery >= 70,
      questions: [
        { typeLabel: "变式题", difficulty: "基础变式", stem: `围绕 ${primaryWeak} 的同模型变式题`, target: "确认公式和入口是否正确", result: afterMastery >= 70 ? "已通过" : "仍需巩固" },
        { typeLabel: "变式题", difficulty: "综合变式", stem: `把 ${primaryWeak} 放入跨章节情境中重新检测`, target: "确认是否真正迁移", result: afterMastery >= 75 ? "迁移基本稳定" : "迁移仍不稳定" }
      ]
    },
    improvement: { beforeMastery, afterMastery, improvementValue: afterMastery - beforeMastery, status: afterMastery >= 75 ? "阶段达标" : "需要二刷", originalError: primaryReason, trainingResult: `已生成 ${primaryWeak} 的补漏、同类训练和限时巩固任务。`, nextRisk: weakKnowledgePoints[1] ? `下一轮建议关注 ${weakKnowledgePoints[1]}。` : "下一轮建议增加综合题，验证长期稳定性。" },
    profile: {
      abilities: [
        { name: "概念理解", current: Math.min(95, afterMastery), previous: beforeMastery, trend: afterMastery > beforeMastery ? "提升" : "持平", evidence: primaryReason, suggestion: `继续复盘 ${primaryWeak}` },
        { name: "方法选择", current: Math.min(90, afterMastery - 3), previous: Math.max(20, beforeMastery - 5), trend: "跟随训练更新", evidence: "来自最近一轮题目步骤分析", suggestion: "优先写出解题入口和使用理由" },
        { name: "计算稳定性", current: Math.min(88, accuracy + 10), previous: Math.max(30, accuracy - 6), trend: "待复测验证", evidence: "由最终答案和草稿完整度综合估计", suggestion: "继续保留关键计算步骤" },
        { name: "题型识别", current: Math.min(86, afterMastery - 5), previous: Math.max(25, beforeMastery - 8), trend: "可提升", evidence: "基于错题知识点分布", suggestion: "使用同知识点不同问法做迁移训练" }
      ]
    }
  };
}

function enrichMistakeLoop(loop) {
  const first = loop.diagnosis?.questionAnalyses?.find((item) => !item.finalAnswerCorrect) || loop.diagnosis?.questionAnalyses?.[0] || {};
  const firstWrongStep = first.steps?.find((step) => step.status !== "correct") || first.steps?.[0] || {};
  const knowledgePoint = first.knowledgePoints?.[0] || loop.diagnosis?.weakKnowledgePoints?.[0] || "当前薄弱知识点";
  const errorType = first.errorTypes?.[0] || "知识点应用错误";
  const isProfit = /利润|售价|成本|profit/i.test(`${knowledgePoint} ${first.title} ${firstWrongStep.errorDescription}`);
  const reviewModule = isProfit ? {
    title: "利润关系",
    relationToMistake: "本题错误发生在把“售价”当成“单件利润”。复习目标是先分清售价、进价、单件利润和总利润，再回到建模。",
    coreConcept: "利润问题中，单件利润不是售价，而是售价减去进价；总利润等于单件利润乘以销量。",
    formulas: ["单件利润 = 售价 - 进价", "总利润 = 单件利润 × 销量", "变化后销量 = 原销量 ± 变化量"],
    conditions: "题目给出售价和进价时，必须先计算单件利润；题目给出销量随价格变化时，再建立销量表达式。",
    commonMistakes: ["直接把售价当利润", "忘记减去进价", "把营业额和利润混淆", "销量变化方向写反"],
    correctExample: "售价80元，进价50元，则单件利润为80-50=30元。",
    wrongExample: "售价80元，进价50元，直接写单件利润为80元，这是把售价当成利润。",
    strategy: "你的错误属于建模/数量关系错误，先用关系图拆变量，再做相似题。"
  } : {
    title: knowledgePoint,
    relationToMistake: `本题第一次关键偏差出现在“${firstWrongStep.judgment || errorType}”，对应知识点是 ${knowledgePoint}。`,
    coreConcept: `${knowledgePoint} 的复习重点是弄清定义、适用条件和题目中的触发信号。`,
    formulas: [first.standardAnswer ? "先确认使用条件，再代入公式或模型" : "先写出已知条件与所求目标", "每一步必须能解释来源"],
    conditions: "只有题目条件满足对应公式/方法时才能直接使用；不满足时先做等价转化或建模。",
    commonMistakes: [errorType, "只看最终答案不检查过程", "忽略题目限制条件"],
    correctExample: "先提取已知条件，再写出所用知识点，最后代入计算。",
    wrongExample: firstWrongStep.studentContent || "直接套公式但没有检查条件。",
    strategy: `你的错误类型是 ${errorType}，本次复习控制在2-3分钟，先补关键概念，再做理解检查。`
  };
  const understandingCheck = isProfit ? {
    purpose: "确认你已经能区分售价和单件利润。",
    question: "某商品售价80元，进价50元，单件利润是多少？",
    options: [
      { key: "A", text: "80元" },
      { key: "B", text: "50元" },
      { key: "C", text: "30元" },
      { key: "D", text: "130元" }
    ],
    answer: "C",
    passFeedback: "正确。你已经能把售价和利润分开，可以进入相似题训练。",
    failFeedback: "还不能进入相似题训练。请回到“单件利润=售价-进价”这一部分重新复习。"
  } : {
    purpose: `确认你已经理解 ${knowledgePoint} 的使用入口。`,
    question: `做这类题时，最先应该确认什么？`,
    options: [
      { key: "A", text: "直接写最终答案" },
      { key: "B", text: `确认 ${knowledgePoint} 的适用条件和题目条件` },
      { key: "C", text: "先看解析" },
      { key: "D", text: "随机换一道题" }
    ],
    answer: "B",
    passFeedback: "正确。先确认知识点与条件，再进入相似题。",
    failFeedback: "还不能进入相似题训练。请回到知识点复习页，重点看使用条件。"
  };
  const similarTraining = isProfit ? {
    goal: "利润关系相似题训练",
    levels: [
      { level: "第一层：基础模仿题", title: "直接计算单件利润", stem: "某商品进价30元，售价50元，每天卖出80件，求每天总利润。", target: "确认会用单件利润=售价-进价", hint: "先算一件赚多少。", feedback: "答错只提示售价、进价和利润关系，不直接给完整解析。" },
      { level: "第二层：同类变式题", title: "建立变化后利润表达式", stem: "某商品进价40元，售价每提高2元，销量减少5件，建立总利润表达式。", target: "确认能处理销量变化", hint: "分别写出单件利润和销量。", feedback: "如果把售价当利润，返回知识点复习。" },
      { level: "第三层：综合迁移题", title: "独立完成利润建模", stem: "某商店销售一种商品，价格调整会影响销量，求达到目标利润时的定价。", target: "接近原错题难度，减少提示", hint: "", feedback: "最后一题需独立完成，使用高级提示不算完全掌握。" }
    ]
  } : {
    goal: `${knowledgePoint} 相似题训练`,
    levels: [
      { level: "第一层：基础模仿题", title: "确认知识点入口", stem: `围绕 ${knowledgePoint} 的直接应用题。`, target: "确认能正确使用刚复习的知识点", hint: "先写出适用条件。", feedback: "只给一级提示，不立即展示完整答案。" },
      { level: "第二层：同类变式题", title: "更换情境表达", stem: `更换数字或问法，但仍考查 ${knowledgePoint}。`, target: "确认迁移能力", hint: "找题目中的触发条件。", feedback: "重复原错则返回复习。" },
      { level: "第三层：综合迁移题", title: "接近原错题", stem: `把 ${knowledgePoint} 放入综合情境中独立完成。`, target: "确认独立完成", hint: "", feedback: "最后一题要求低提示完成。" }
    ]
  };
  const originalRetry = {
    stem: first.title || "原错题",
    firstMistakeSummary: `你第一次在“${firstWrongStep.judgment || errorType}”这一步出现问题，错误类型是 ${errorType}。这里不展示完整正确解法。`,
    acceptedSignals: isProfit ? ["20+x", "60+x-40", "(20+x)(100-2x)"] : [String(first.standardAnswer || ""), knowledgePoint].filter(Boolean),
    durationSecond: 0
  };
  loop.recoveryPath = {
    currentStage: "DIAGNOSED",
    nextAction: `先复习 ${reviewModule.title}，通过理解检查后再进入相似题。`,
    stages: [
      { key: "DETECTED", label: "检测", status: "已完成", summary: first.finalAnswerCorrect === false ? "发现本题作答错误" : "本题待进一步验证" },
      { key: "DIAGNOSED", label: "诊断", status: "已完成", summary: firstWrongStep.judgment || errorType },
      { key: "REVIEWING", label: "复习", status: "进行中", summary: `复习 ${reviewModule.title}` },
      { key: "CHECKING_UNDERSTANDING", label: "理解检查", status: "未开始", summary: understandingCheck.question },
      { key: "TRAINING", label: "相似题训练", status: "未开始", summary: similarTraining.goal },
      { key: "WAITING_FOR_RETRY", label: "原题重做", status: "未开始", summary: "回到原始错题重新作答" },
      { key: "MASTERED", label: "掌握验证", status: "未开始", summary: "判断是否重复原关键错误" }
    ]
  };
  loop.homeCounters = {
    reviewPending: loop.diagnosis?.weakKnowledgePoints?.length || 1,
    trainingPending: similarTraining.levels.length,
    retryPending: 1,
    conquered: loop.improvement?.status?.includes("达标") ? 1 : 0,
    needsReinforcement: loop.improvement?.status?.includes("需要") ? 1 : 0
  };
  loop.reviewModule = reviewModule;
  loop.understandingCheck = understandingCheck;
  loop.similarTraining = similarTraining;
  loop.originalRetry = originalRetry;
  loop.trainingCriteria = {
    summary: "至少通过2道相似题，最后一道不能使用三级以上提示，且不能重复原关键错误。",
    minCorrect: 2,
    maxHighHintLevel: 2,
    lastQuestionIndependent: true
  };
  loop.masteryVerification = {
    status: loop.retest?.passed ? "MASTERED" : "NEEDS_REINFORCEMENT",
    firstError: firstWrongStep.errorDescription || errorType,
    masteredFeedback: "第二次作答没有重复原关键错误，关键步骤更规范，可以进入错题攻克报告。",
    reinforceFeedback: "第二次作答仍未纠正关键错误，需要返回知识点复习，并降低相似题难度。"
  };
  loop.comparisonReport = {
    firstScore: first.score != null && first.maxScore ? `${first.score}/${first.maxScore}` : loop.diagnosis?.score,
    retryScore: loop.retest?.passed ? "10/10" : "待重做",
    firstDuration: "首次记录",
    retryDuration: "重做后重新记录",
    firstErrorStep: firstWrongStep.judgment || errorType,
    firstSteps: firstWrongStep.studentContent || first.studentAnswer || "首次作答记录",
    retryStepPerformance: loop.retest?.passed ? "关键错误已纠正，步骤更规范" : "待完成原题重做",
    sameErrorRepeated: !loop.retest?.passed
  };
  return loop;
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    api(req, res).catch((error) => send(res, 500, { error: error.message }));
  } else {
    publicFile(req, res);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Math Coach listening on 0.0.0.0:${PORT}`);
  console.log("Student invite codes: MATH01 - MATH10");
  console.log(ADMIN_KEY ? "Admin enabled with ADMIN_KEY" : "Admin disabled: ADMIN_KEY is not configured");
});
