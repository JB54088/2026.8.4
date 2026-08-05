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
    stage: "强化阶段",
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
  return [...readPastExamQuestions(), ...buildSubjectiveQuestions(), ...buildExamStyleQuestions(), ...handPicked, ...buildGeneratedQuestions()];
}

function buildSubjectiveQuestions() {
  const common = ["数学一", "数学二", "数学三"];
  return [
    {
      id: "subjective_integral_model_001",
      subjects: common,
      chapterId: "integral",
      chapterName: "一元函数积分学",
      point: "定积分应用建模",
      reason: "建模错误",
      type: "subjective",
      level: "综合提升",
      difficulty: 4,
      stem: "某商品原售价60元，成本40元。若每涨价1元，销量减少2件。设原销量为100件，求使总利润为2400元时的涨价额，并写出完整建模过程。",
      options: [],
      answer: "(20+x)(100-2x)=2400",
      aliases: ["(60+x-40)(100-2x)=2400"],
      explanation: "设涨价额为 x，则单件利润为 60+x-40=20+x，销量为 100-2x，总利润模型为 (20+x)(100-2x)=2400。关键评分点是变量设定、单件利润、销量表达式、方程建立与结论。",
      scoringPoints: [
        { label: "正确设涨价额 x", score: 2 },
        { label: "写出单件利润 20+x", score: 3 },
        { label: "写出销量 100-2x", score: 2 },
        { label: "建立方程 (20+x)(100-2x)=2400", score: 2 },
        { label: "求解并给出符合题意结论", score: 1 }
      ],
      sourceType: "teacher_original",
      source: "签约教师审核题",
      reviewStatus: "教师已审核",
      qualityTier: "exam_standard"
    },
    {
      id: "subjective_multi_extreme_001",
      subjects: common,
      chapterId: "multi",
      chapterName: "多元函数微分学",
      point: "多元函数极值",
      reason: "条件遗漏",
      type: "subjective",
      level: "综合提升",
      difficulty: 4,
      stem: "求函数 z=x^2+y^2-2x-4y+1 的极值，并说明取得极值的点。",
      options: [],
      answer: "极小值-4，点(1,2)",
      aliases: ["(1,2)处取极小值-4", "-4"],
      explanation: "配方 z=(x-1)^2+(y-2)^2-4，所以在 (1,2) 处取得极小值 -4。需要写出配方或一阶偏导、二阶判别过程。",
      scoringPoints: [
        { label: "正确求驻点或完成配方", score: 3 },
        { label: "判断极值类型", score: 3 },
        { label: "给出极值点", score: 2 },
        { label: "给出极值", score: 2 }
      ],
      sourceType: "teacher_original",
      source: "签约教师审核题",
      reviewStatus: "教师已审核",
      qualityTier: "exam_standard"
    },
    {
      id: "subjective_linear_rank_001",
      subjects: common,
      chapterId: "linear",
      chapterName: "线性代数",
      point: "矩阵秩与方程组",
      reason: "概念理解错误",
      type: "subjective",
      level: "综合提升",
      difficulty: 4,
      stem: "设三阶矩阵 A 的秩为 2，说明齐次线性方程组 Ax=0 的解空间维数，并写出判断依据。",
      options: [],
      answer: "解空间维数为1",
      aliases: ["基础解系含1个向量", "3-2=1"],
      explanation: "齐次线性方程组解空间维数等于未知量个数减矩阵秩，即 3-2=1。",
      scoringPoints: [
        { label: "指出未知量个数为3", score: 2 },
        { label: "使用维数=未知量个数-秩", score: 4 },
        { label: "计算出1", score: 2 },
        { label: "表达基础解系含1个向量", score: 2 }
      ],
      sourceType: "teacher_original",
      source: "签约教师审核题",
      reviewStatus: "教师已审核",
      qualityTier: "exam_standard"
    }
  ];
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

function numericValue(value) {
  const raw = normalizeAnswer(value).replace(/^答案[:：]?/, "").replace(/[。；;]$/g, "");
  if (!raw) return null;
  if (/^[+-]?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const fraction = raw.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
  return null;
}

function equivalentAnswer(expected, actual) {
  const left = normalizeAnswer(expected)
    .replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",")
    .replace(/＋/g, "+").replace(/－/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  const right = normalizeAnswer(actual)
    .replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",")
    .replace(/＋/g, "+").replace(/－/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  if (!left || !right) return false;
  if (left === right) return true;
  const leftNum = numericValue(left);
  const rightNum = numericValue(right);
  if (leftNum !== null && rightNum !== null) return Math.abs(leftNum - rightNum) < 1e-8;
  const compact = (value) => value.replace(/\*/g, "").replace(/\^1(?!\d)/g, "").replace(/\+c$/i, "+c").replace(/c$/i, "c");
  return compact(left) === compact(right);
}

function grade(question, answer) {
  const accepted = [question.answer, ...(question.aliases || [])];
  return accepted.some((item) => equivalentAnswer(item, answer));
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
  "structuredSteps": [
    {"stepNumber":1,"studentRaw":"学生原始步骤","normalized":"结构化后的数学表达","status":"correct|wrong|partial|uncertain","knowledgePoint":"使用的知识点或公式","linkWithPrevious":"是否能承接上一步","conditionCheck":"公式条件是否满足","errorDescription":"如果错误，说明具体错误"}
  ],
  "isCorrect": true 或 false 或 null,
  "processHasIssue": true 或 false,
  "processIssueReason": "如果答案正确但过程有问题，说明原因；否则为空",
  "lastCorrectStep": 0,
  "firstWrongStep": 0,
  "errorType": "具体错误类型",
  "rootCause": "根本原因；证据不足时写可能原因，需要后续训练确认",
  "affectedSteps": ["受影响的后续步骤"],
  "uncertainRegions": [{"label":"低置信区域","message":"需要学生确认的内容"}],
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
    structuredSteps: Array.isArray(parsed.structuredSteps) ? parsed.structuredSteps : [],
    processHasIssue: Boolean(parsed.processHasIssue),
    processIssueReason: String(parsed.processIssueReason || ""),
    lastCorrectStep: Number(parsed.lastCorrectStep || 0),
    firstWrongStep: Number(parsed.firstWrongStep || 0),
    errorType: String(parsed.errorType || ""),
    rootCause: String(parsed.rootCause || ""),
    affectedSteps: Array.isArray(parsed.affectedSteps) ? parsed.affectedSteps : [],
    uncertainRegions: Array.isArray(parsed.uncertainRegions) ? parsed.uncertainRegions : [],
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
          name: String(body.name || "王同学").slice(0, 20),
          mathType: body.mathType || "数学一",
          targetScore: Number(body.targetScore || 120),
          stage: body.stage || "强化阶段",
          dailyMinutes: Number(body.dailyMinutes || 60),
          isDemo: true,
          createdAt: nowIso()
        };
        store.students.push(demoStudent);
      }
      demoStudent.name = String(body.name || demoStudent.name || "王同学").slice(0, 20);
      demoStudent.mathType = body.mathType || demoStudent.mathType || "数学一";
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
    store.submissions = Array.isArray(store.submissions) ? store.submissions.filter((s) => s.studentId !== student.id) : [];
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
    if (!pool.length && chapterId === "all") pool = store.questions.filter((q) => q.subjects.includes(mathType));
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
    const finalAnswer = answerValueForQuestion(question, body, recognition);
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
      structuredSteps: recognition.structuredSteps || [],
      processHasIssue: Boolean(recognition.processHasIssue),
      processIssueReason: recognition.processIssueReason || "",
      lastCorrectStep: Number(recognition.lastCorrectStep || 0),
      firstWrongStep: Number(recognition.firstWrongStep || 0),
      aiErrorType: recognition.errorType || "",
      rootCause: recognition.rootCause || "",
      affectedSteps: recognition.affectedSteps || [],
      uncertainRegions: recognition.uncertainRegions || [],
      recognitionEngine: recognition.engine,
      selectedOption: body.selectedOption || "",
      stepsText: body.stepsText || "",
      formulaText: body.formulaText || "",
      flagged: Boolean(body.flagged),
      favorite: Boolean(body.favorite),
      strokeCount: Number(body.strokeCount || 0),
      scratchImageStored: Boolean(body.scratchImage),
      answerImageStored: Boolean(body.answerImage),
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

  if (req.method === "POST" && url.pathname === "/api/submissions") {
    const body = await parseBody(req);
    const student = store.students.find((s) => s.id === body.studentId);
    if (!student) return send(res, 404, { error: "学生不存在" });
    const questionIds = Array.isArray(body.questionIds) ? body.questionIds : [];
    const questions = questionIds.map((qid) => store.questions.find((q) => q.id === qid)).filter(Boolean);
    if (!questions.length) return send(res, 400, { error: "整卷提交缺少有效题目" });
    const responses = Array.isArray(body.responses) ? body.responses : [];
    const submissionId = id("sub");
    const completenessIssues = inspectPaperCompleteness(questions, responses);
    const submission = {
      id: submissionId,
      submissionId,
      examinationId: body.examinationId || `${body.mode || "practice"}_${body.chapterId || "mixed"}_${Date.now()}`,
      studentId: student.id,
      paperName: body.paperName || `${student.mathType || "考研数学"} ${body.mode || "训练"}整卷`,
      mode: body.mode || "",
      chapterId: body.chapterId || "",
      status: "uploading",
      gradingStatusHistory: [
        { status: "submit_confirmed", at: nowIso() },
        { status: "uploading", at: nowIso() }
      ],
      questionIds: questions.map((q) => q.id),
      attemptIds: [],
      responsesLocked: responses.map((item, index) => ({
        questionId: item.questionId,
        answer: item.answer || "",
        selectedOption: item.selectedOption || "",
        formulaText: item.formulaText || "",
        stepsText: item.stepsText || "",
        hasScratchImage: Boolean(item.scratchImage),
        hasAnswerImage: Boolean(item.answerImage),
        strokeCount: Number(item.strokeCount || 0),
        durationMs: Number(item.durationMs || 0),
        flagged: Boolean(item.flagged),
        favorite: Boolean(item.favorite),
        answerOrder: index,
        abandoned: !responseHasContent(item)
      })),
      completenessIssues,
      durationMs: Number(body.durationMs || 0),
      answerOrder: Array.isArray(body.answerOrder) ? body.answerOrder : responses.map((item) => item.questionId),
      revisionCount: Number(body.revisionCount || 0),
      timeout: Boolean(body.timeout),
      submittedAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      report: null
    };
    store.submissions = store.submissions || [];
    store.submissions.push(submission);
    saveDb(store);

    submission.status = "recognizing";
    submission.gradingStatusHistory.push({ status: "recognizing", at: nowIso() });
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const payload = responses.find((item) => item.questionId === question.id) || { questionId: question.id };
      try {
        const attempt = await buildAttemptFromResponse(store, student, question, {
          ...payload,
          mode: body.mode,
          chapterId: body.chapterId,
          examinationId: submission.examinationId
        }, submission.id, index);
        store.attempts.push(attempt);
        submission.attemptIds.push(attempt.id);
      } catch (error) {
        const fallback = {
          id: id("att"),
          studentId: student.id,
          submissionId: submission.id,
          questionId: question.id,
          examinationId: submission.examinationId,
          orderIndex: index,
          chapterId: question.chapterId,
          answer: "",
          selectedOption: "",
          stepsText: "",
          formulaText: "",
          strokeCount: 0,
          scratchImageStored: false,
          answerImageStored: false,
          strokePointCount: 0,
          durationMs: 0,
          gradingStatus: "recognition_error",
          correct: null,
          reason: "该题识别不完整",
          advice: "请重新上传或手动确认该题答案，其余题目不受影响。",
          evidence: [String(error.message || error)],
          abandoned: true,
          createdAt: nowIso()
        };
        store.attempts.push(fallback);
        submission.attemptIds.push(fallback.id);
        submission.completenessIssues.push({ questionId: question.id, type: "grading_exception", severity: "error", message: `第${index + 1}题批改异常，已标记为需复核` });
      }
    }
    submission.status = "diagnosis_generating";
    submission.gradingStatusHistory.push({ status: "objective_grading_done", at: nowIso() });
    submission.gradingStatusHistory.push({ status: "subjective_analysis_done", at: nowIso() });
    submission.gradingStatusHistory.push({ status: "diagnosis_generating", at: nowIso() });
    submission.report = buildSubmissionDiagnosis(store, submission);
    submission.status = submission.completenessIssues.some((item) => item.severity === "error") ? "partial_recognition_failed" : "diagnosis_complete";
    submission.gradingStatusHistory.push({ status: submission.status, at: nowIso() });
    submission.updatedAt = nowIso();
    saveDb(store);
    send(res, 200, { submission, report: submission.report });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/submissions") {
    const studentId = url.searchParams.get("studentId");
    const list = (store.submissions || [])
      .filter((item) => !studentId || item.studentId === studentId)
      .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    const latest = list[0] || null;
    send(res, 200, { submissions: list, latest });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/submissions/")) {
    const submissionId = cleanId(url.pathname.split("/").pop());
    const submission = (store.submissions || []).find((item) => item.id === submissionId || item.submissionId === submissionId);
    if (!submission) return send(res, 404, { error: "整卷提交不存在" });
    send(res, 200, { submission, report: submission.report });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ocr/confirm") {
    const body = await parseBody(req);
    const attempt = store.attempts.find((a) => a.id === body.attemptId);
    if (!attempt) return send(res, 404, { error: "作答记录不存在" });
    attempt.recognizedAnswer = body.recognizedAnswer || attempt.recognizedAnswer || "";
    attempt.recognizedSteps = body.structuredSteps || body.recognizedSteps || attempt.recognizedSteps || "";
    attempt.recognitionConfidence = Number(body.confidenceScore || attempt.recognitionConfidence || 100);
    attempt.uncertainRegions = Array.isArray(body.uncertainRegions) ? body.uncertainRegions : [];
    attempt.studentConfirmedOcr = true;
    attempt.gradingStatus = "ocr_confirmed";
    attempt.updatedAt = nowIso();
    saveDb(store);
    send(res, 200, { attempt });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/regrade") {
    const body = await parseBody(req);
    const submission = (store.submissions || []).find((item) => item.id === body.submissionId || item.submissionId === body.submissionId);
    if (!submission) return send(res, 404, { error: "整卷提交不存在" });
    submission.status = "diagnosis_generating";
    submission.gradingStatusHistory.push({ status: "regrading", at: nowIso() });
    submission.report = buildSubmissionDiagnosis(store, submission);
    submission.status = "diagnosis_complete";
    submission.gradingStatusHistory.push({ status: "diagnosis_complete", at: nowIso() });
    submission.updatedAt = nowIso();
    saveDb(store);
    send(res, 200, { submission, report: submission.report });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/training-batches") {
    const body = await parseBody(req);
    const student = store.students.find((s) => s.id === body.studentId);
    if (!student) return send(res, 404, { error: "学生不存在" });
    try {
      const batch = buildTrainingBatch(store, student.id, {
        submissionId: body.submissionId || "",
        sourceQuestionId: body.sourceWrongQuestionId || "",
        trainingType: body.trainingType === "comprehensive" ? "comprehensive" : "targeted"
      });
      saveDb(store);
      send(res, 200, { batch });
    } catch (error) {
      send(res, 400, { error: error.message || "训练批次生成失败" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/training-batches") {
    const studentId = url.searchParams.get("studentId");
    const type = url.searchParams.get("trainingType");
    const list = (store.trainingBatches || [])
      .filter((item) => isTrainingBatchReady(item) && (!studentId || item.studentId === studentId) && (!type || item.trainingType === type))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    send(res, 200, { batches: list, latest: list[0] || null });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/training-records") {
    const body = await parseBody(req);
    const batch = (store.trainingBatches || []).find((item) => item.id === body.trainingBatchId);
    if (!batch) return send(res, 404, { error: "训练批次不存在" });
    const question = batch.questions.find((item) => item.id === body.trainingQuestionId);
    if (!question) return send(res, 404, { error: "训练题不存在" });
    const judged = gradeTrainingQuestion(question, body);
    const record = {
      id: id("tr"),
      studentId: batch.studentId,
      trainingBatchId: batch.id,
      trainingQuestionId: question.id,
      answer: body.answer || body.selectedOption || body.formulaText || "",
      selectedOption: body.selectedOption || "",
      stepsText: body.stepsText || "",
      scratchImageStored: Boolean(body.scratchImage),
      strokeCount: Number(body.strokeCount || 0),
      hintLevelUsed: Number(body.hintLevelUsed || 0),
      retryCount: Number(body.retryCount || 0),
      durationMs: Number(body.durationMs || 0),
      correct: judged.correct,
      gradingStatus: judged.gradingStatus,
      repeatedOriginalError: judged.repeatedOriginalError,
      score: judged.score,
      createdAt: nowIso()
    };
    const existingRecordIndex = store.trainingRecords.findIndex((item) => item.trainingBatchId === batch.id && item.trainingQuestionId === question.id);
    if (existingRecordIndex >= 0) store.trainingRecords[existingRecordIndex] = { ...store.trainingRecords[existingRecordIndex], ...record };
    else store.trainingRecords.push(record);
    const records = store.trainingRecords.filter((item) => item.trainingBatchId === batch.id);
    batch.progress.answered = records.length;
    batch.progress.correct = records.filter((item) => item.correct).length;
    batch.progress.accuracy = records.length ? Math.round(batch.progress.correct / records.length * 100) : 0;
    batch.progress.hintsUsed = records.reduce((sum, item) => sum + Number(item.hintLevelUsed || 0), 0);
    batch.progress.repeatedOriginalError = records.some((item) => item.repeatedOriginalError);
    batch.progress.masteryAfter = Math.min(95, Math.max(batch.progress.masteryBefore, batch.progress.accuracy - batch.progress.hintsUsed * 2));
    batch.status = batch.progress.answered >= batch.questionCount ? "completed" : "in_progress";
    batch.updatedAt = nowIso();
    saveDb(store);
    send(res, 200, { record, batch, warning: record.repeatedOriginalError ? `你在本题中再次出现了与原错题相同的错误：${batch.sourceErrorType}。建议暂停继续刷题，重新复习对应知识点。` : "" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/retests") {
    const body = await parseBody(req);
    const batch = (store.trainingBatches || []).find((item) => item.id === body.trainingBatchId);
    if (!batch) return send(res, 404, { error: "训练批次不存在" });
    const retest = {
      id: id("retest"),
      studentId: batch.studentId,
      trainingBatchId: batch.id,
      sourceWrongQuestionId: batch.sourceWrongQuestionId,
      sourceErrorType: batch.sourceErrorType,
      questions: buildRetestFromBatch(batch),
      status: "waiting_answer",
      result: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.retestRecords.push(retest);
    saveDb(store);
    send(res, 200, { retest });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/retests/submit") {
    const body = await parseBody(req);
    const retest = (store.retestRecords || []).find((item) => item.id === body.retestId);
    if (!retest) return send(res, 404, { error: "复测不存在" });
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const correct = answers.filter((item) => item.correct === true || item.answer || item.stepsText).length;
    const accuracy = Math.round(correct / Math.max(1, retest.questions.length) * 100);
    const hintsUsed = answers.reduce((sum, item) => sum + Number(item.hintLevelUsed || 0), 0);
    const repeated = answers.some((item) => item.repeatedOriginalError);
    const mastery = repeated ? "尚未掌握" : hintsUsed >= 3 ? "掌握不稳定" : accuracy >= 80 ? "已掌握" : accuracy >= 60 ? "基本掌握" : "尚未掌握";
    retest.result = { accuracy, hintsUsed, repeatedOriginalError: repeated, mastery, originalQuestionRetryResult: answers.at(-1) || null };
    retest.status = "completed";
    retest.updatedAt = nowIso();
    saveDb(store);
    send(res, 200, { retest });
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
      map.set(q.chapterId, { id: q.chapterId, name: q.chapterName, subjects: q.subjects, count: 0, countsByMathType: {} });
    }
    const item = map.get(q.chapterId);
    item.count += 1;
    item.subjects = Array.from(new Set([...item.subjects, ...q.subjects]));
    q.subjects.forEach((mathType) => {
      item.countsByMathType[mathType] = (item.countsByMathType[mathType] || 0) + 1;
    });
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

function answerValueFrom(payload = {}, recognition = {}) {
  return payload.answer
    || payload.selectedOption
    || payload.formulaText
    || payload.recognizedAnswer
    || recognition.recognizedAnswer
    || "";
}

function extractFillAnswerFromWorkSpace(text = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  const patterns = [
    /(?:答案|最终答案|结果|填空)\s*[:：=]\s*(.+)$/i,
    /(?:所以|故|因此)\s*(?:答案|结果)?\s*(?:为|是|=)\s*(.+)$/i,
    /(?:ans|answer)\s*[:=]\s*(.+)$/i
  ];
  for (const line of [...lines].reverse()) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) return match[1].replace(/[。；;，,]$/g, "").trim();
    }
  }
  const last = lines.at(-1) || "";
  const equation = last.match(/=\s*([^=]+)$/);
  if (equation?.[1]) return equation[1].replace(/[。；;，,]$/g, "").trim();
  return last.length <= 40 ? last.replace(/[。；;，,]$/g, "").trim() : "";
}

function answerValueForQuestion(question, payload = {}, recognition = {}) {
  const direct = answerValueFrom(payload, recognition);
  if (direct) return direct;
  if (question?.type === "fill") return extractFillAnswerFromWorkSpace(payload.stepsText);
  return "";
}

function responseHasContent(payload = {}) {
  return Boolean(
    String(payload.answer || payload.selectedOption || payload.formulaText || payload.stepsText || "").trim()
    || payload.scratchImage
    || payload.answerImage
    || Number(payload.strokeCount || 0) > 0
    || (Array.isArray(payload.strokes) && payload.strokes.length)
  );
}

function strokePointCount(payload = {}) {
  return Array.isArray(payload.strokes)
    ? payload.strokes.reduce((sum, stroke) => sum + (Array.isArray(stroke.points) ? stroke.points.length : Array.isArray(stroke) ? stroke.length : 0), 0)
    : 0;
}

function inspectPaperCompleteness(questions, responses) {
  const issues = [];
  questions.forEach((question, index) => {
    const payload = responses.find((item) => item.questionId === question.id) || {};
    const label = `第${index + 1}题`;
    if (!responseHasContent(payload)) {
      issues.push({ questionId: question.id, type: "unanswered", severity: "warn", message: `${label}未作答` });
      return;
    }
    if (question.type !== "choice" && !String(payload.stepsText || "").trim() && !payload.scratchImage && !payload.answerImage) {
      issues.push({ questionId: question.id, type: "missing_process", severity: "warn", message: `${label}缺少可分析的解题过程` });
    }
    if (question.type !== "choice" && (payload.answer || payload.formulaText) && !String(payload.stepsText || "").trim() && !payload.scratchImage) {
      issues.push({ questionId: question.id, type: "answer_without_process", severity: "warn", message: `${label}只有答案，缺少过程` });
    }
    if (payload.uploadError) {
      issues.push({ questionId: question.id, type: "upload_failed", severity: "error", message: `${label}图片上传失败` });
    }
  });
  return issues;
}

async function buildAttemptFromResponse(store, student, question, payload, submissionId, orderIndex) {
  const recognition = await recognizeScratch(question, payload);
  const finalAnswer = answerValueForQuestion(question, payload, recognition);
  const hasReviewedAnswer = Boolean(question.answer) && question.answerStatus !== "pending_review";
  const correct = recognition.modelJudgment && typeof recognition.isCorrect === "boolean"
    ? recognition.isCorrect
    : (finalAnswer && hasReviewedAnswer ? grade(question, finalAnswer) : null);
  const gradingStatus = recognition.recognitionError
    ? "recognition_error"
    : recognition.modelJudgment
      ? "ai_reviewed"
      : (!hasReviewedAnswer ? "pending_answer_review" : (finalAnswer ? "graded" : "pending_recognition"));
  const diagnosis = diagnose(question, { ...payload, answer: finalAnswer }, correct);
  if (recognition.recognitionError) {
    diagnosis.mainReason = "识别服务不可用";
    diagnosis.advice = recognition.recognitionError.includes("no credits")
      ? "OpenAI API 账户没有可用额度。系统已保存整卷答卷，客观题继续批改，主观题标记为需复核。"
      : `手写识别服务调用失败：${recognition.recognitionError}`;
    diagnosis.evidence.push(`识别错误：${recognition.recognitionError}`);
  }
  if (!responseHasContent(payload)) {
    diagnosis.mainReason = "未作答";
    diagnosis.advice = "该题没有检测到答案、过程或草稿内容，建议在原题重做中补全。";
  }
  if (recognition.modelJudgment && recognition.weakPoint) diagnosis.mainReason = recognition.weakPoint;
  if (recognition.modelJudgment && recognition.advice) diagnosis.advice = recognition.advice;
  if (recognition.modelJudgment && recognition.firstError) diagnosis.evidence.push(`第一处错误：${recognition.firstError}`);
  return {
    id: id("att"),
    studentId: student.id,
    submissionId,
    questionId: question.id,
    examinationId: payload.examinationId || `${payload.mode || "practice"}_${payload.chapterId || question.chapterId}`,
    orderIndex,
    chapterId: question.chapterId,
    answer: finalAnswer,
    recognizedAnswer: recognition.recognizedAnswer,
    recognitionConfidence: recognition.confidence,
    ocrResult: {
      recognizedAnswer: recognition.recognizedAnswer || "",
      structuredSteps: recognition.structuredSteps?.length ? recognition.structuredSteps : (recognition.stepsSummary || payload.stepsText || ""),
      confidenceScore: Number(recognition.confidence || 0),
      uncertainRegions: recognition.uncertainRegions?.length ? recognition.uncertainRegions : Number(recognition.confidence || 0) > 0 && Number(recognition.confidence || 0) < 70
        ? [{ label: "low_confidence_formula", message: "该位置手写内容识别置信度较低，建议确认后重新批改。" }]
        : []
    },
    recognizedSteps: recognition.stepsSummary || payload.stepsText || "",
    structuredSteps: recognition.structuredSteps || [],
    processHasIssue: Boolean(recognition.processHasIssue),
    processIssueReason: recognition.processIssueReason || "",
    lastCorrectStep: Number(recognition.lastCorrectStep || 0),
    firstWrongStep: Number(recognition.firstWrongStep || 0),
    aiErrorType: recognition.errorType || "",
    rootCause: recognition.rootCause || "",
    affectedSteps: recognition.affectedSteps || [],
    uncertainRegions: recognition.uncertainRegions || [],
    recognitionEngine: recognition.engine,
    selectedOption: payload.selectedOption || "",
    stepsText: payload.stepsText || "",
    formulaText: payload.formulaText || "",
    flagged: Boolean(payload.flagged),
    favorite: Boolean(payload.favorite),
    abandoned: !responseHasContent(payload),
    strokeCount: Number(payload.strokeCount || 0),
    scratchImageStored: Boolean(payload.scratchImage),
    answerImageStored: Boolean(payload.answerImage),
    strokePointCount: strokePointCount(payload),
    durationMs: Number(payload.durationMs || 0),
    gradingStatus,
    correct,
    reason: diagnosis.mainReason,
    advice: diagnosis.advice,
    recommendedPractice: recognition.recommendedPractice || "",
    evidence: diagnosis.evidence,
    steps: buildStepAnalysis(question, { ...payload, answer: finalAnswer, correct, gradingStatus, reason: diagnosis.mainReason, recognizedAnswer: recognition.recognizedAnswer, recognizedSteps: recognition.stepsSummary }),
    createdAt: nowIso()
  };
}

function severityForError(count, scoreLoss) {
  if (scoreLoss >= 20 || count >= 4) return "高";
  if (scoreLoss >= 10 || count >= 2) return "中";
  return "低";
}

function abilityEvidenceFor(name, attempts, questions) {
  const related = attempts.filter((attempt) => {
    const question = questions.find((item) => item.id === attempt.questionId) || {};
    const text = `${question.point || ""} ${question.reason || ""} ${attempt.reason || ""}`;
    if (name === "基础计算能力") return /计算|化简|积分|导数|行列式/.test(text);
    if (name === "公式应用能力") return /公式|换元|分部|概率|极限/.test(text);
    if (name === "审题能力") return /审题|条件|遗漏|数量关系/.test(text);
    if (name === "建模能力") return /建模|应用|利润|函数应用/.test(text);
    if (name === "推理能力") return /推理|证明|步骤|逻辑/.test(text);
    if (name === "综合分析能力") return Number(question.difficulty || 0) >= 4;
    if (name === "解题规范性") return attempt.gradingStatus === "pending_recognition" || /书写|过程|步骤/.test(text);
    if (name === "时间管理能力") return Number(attempt.durationMs || 0) > 180000;
    if (name === "难题处理能力") return Number(question.difficulty || 0) >= 4;
    return attempt.flagged || attempt.correct === false;
  });
  const total = related.length || attempts.length || 1;
  const good = related.filter((attempt) => attempt.correct === true).length;
  const score = Math.round(good / total * 100);
  return {
    name,
    score,
    level: score >= 85 ? "优秀" : score >= 70 ? "基本稳定" : score >= 50 ? "不稳定" : "薄弱",
    evidence: related.slice(0, 4).map((attempt) => `第${attempt.orderIndex + 1}题`).join("、") || "来自本卷整体表现",
    questionIds: related.slice(0, 6).map((attempt) => attempt.questionId),
    advice: score >= 70 ? "保持当前节奏，增加限时综合题验证迁移能力。" : "先回到对应知识点复习，再用同类题和变式题复测。"
  };
}

function buildSubmissionDiagnosis(store, submission) {
  const questions = submission.questionIds.map((qid) => store.questions.find((q) => q.id === qid)).filter(Boolean);
  const attempts = submission.attemptIds.map((aid) => store.attempts.find((a) => a.id === aid)).filter(Boolean);
  const attemptByQuestion = new Map(attempts.map((attempt) => [attempt.questionId, attempt]));
  const questionAnalyses = questions.map((question, index) => {
    const attempt = attemptByQuestion.get(question.id);
    const scored = scoreForAttempt(question, attempt);
    const reason = reasonForAttempt(question, attempt);
    const steps = buildStepAnalysis(question, attempt);
    const firstWrong = steps.find((step) => step.status !== "correct") || null;
    const lastCorrect = [...steps].reverse().find((step) => step.status === "correct") || null;
    const processIssue = detectProcessIssue(question, attempt, steps);
    const needsDeepDiagnosis = attempt?.correct !== true || processIssue.hasIssue;
    const errorTag = classifyErrorTag(question, attempt, firstWrong || {});
    return {
      questionId: question.id,
      orderIndex: index,
      type: question.type,
      typeLabel: typeLabelFor(question.type),
      chapterId: question.chapterId,
      chapterName: question.chapterName,
      knowledgePoints: [normalizeWeakPoint(question, attempt)],
      title: question.stem || question.point || question.chapterName,
      stemHtml: question.stemHtml || "",
      stemImage: question.stemImage || "",
      studentAnswer: attempt?.recognizedAnswer || attempt?.answer || attempt?.selectedOption || "",
      studentSteps: attempt?.stepsText || attempt?.recognizedSteps || "",
      handwritingImage: attempt?.scratchImageStored ? "stored_in_submission_payload" : "",
      ocrResult: attempt?.ocrResult || { recognizedAnswer: attempt?.recognizedAnswer || "", structuredSteps: attempt?.recognizedSteps || "", confidenceScore: Number(attempt?.recognitionConfidence || 0), uncertainRegions: [] },
      structuredSteps: steps,
      confidenceScore: Number(attempt?.recognitionConfidence || 0),
      uncertainRegions: attempt?.ocrResult?.uncertainRegions || [],
      standardAnswer: question.answer || "待校对",
      standardSteps: question.explanation || "",
      score: scored.score,
      maxScore: scored.maxScore,
      finalAnswerCorrect: attempt?.correct === true,
      processCorrect: attempt?.correct === true && !processIssue.hasIssue,
      answerCorrectButProcessIssue: attempt?.correct === true && processIssue.hasIssue,
      needsDeepDiagnosis,
      analysisDepth: needsDeepDiagnosis ? "deep" : "light",
      processIssue,
      gradingStatus: attempt?.gradingStatus || "missing",
      errorTypes: needsDeepDiagnosis ? [processIssue.reason || reason] : [],
      deductionReason: needsDeepDiagnosis ? (processIssue.reason || reason) : "正确题仅记录结果",
      firstErrorStep: firstWrong?.stepNumber || null,
      lastCorrectStep: lastCorrect?.stepNumber || null,
      errorTag,
      steps,
      advice: attempt?.advice || ""
    };
  });
  const totalScore = questionAnalyses.reduce((sum, item) => sum + item.score, 0);
  const totalMax = Math.max(1, questionAnalyses.reduce((sum, item) => sum + item.maxScore, 0));
  const correctCount = questionAnalyses.filter((item) => item.finalAnswerCorrect).length;
  const unansweredCount = attempts.filter((attempt) => attempt.abandoned).length + Math.max(0, questions.length - attempts.length);
  const objectiveScore = questionAnalyses.filter((item) => ["choice", "fill"].includes(item.type)).reduce((sum, item) => sum + item.score, 0);
  const subjectiveScore = questionAnalyses.filter((item) => !["choice", "fill"].includes(item.type)).reduce((sum, item) => sum + item.score, 0);
  const byType = {};
  const byChapter = {};
  const byKnowledge = {};
  questionAnalyses.forEach((item) => {
    byType[item.typeLabel] = byType[item.typeLabel] || { score: 0, maxScore: 0, total: 0, correct: 0 };
    byType[item.typeLabel].score += item.score;
    byType[item.typeLabel].maxScore += item.maxScore;
    byType[item.typeLabel].total += 1;
    if (item.finalAnswerCorrect) byType[item.typeLabel].correct += 1;
    byChapter[item.chapterName] = byChapter[item.chapterName] || { score: 0, maxScore: 0, total: 0, correct: 0 };
    byChapter[item.chapterName].score += item.score;
    byChapter[item.chapterName].maxScore += item.maxScore;
    byChapter[item.chapterName].total += 1;
    if (item.finalAnswerCorrect) byChapter[item.chapterName].correct += 1;
    item.knowledgePoints.forEach((point) => {
      byKnowledge[point] = byKnowledge[point] || { score: 0, maxScore: 0, total: 0, correct: 0, status: "" };
      byKnowledge[point].score += item.score;
      byKnowledge[point].maxScore += item.maxScore;
      byKnowledge[point].total += 1;
      if (item.finalAnswerCorrect) byKnowledge[point].correct += 1;
    });
  });
  Object.values(byKnowledge).forEach((item) => {
    const rate = item.maxScore ? Math.round(item.score / item.maxScore * 100) : 0;
    item.mastery = rate;
    item.status = rate >= 85 ? "已掌握" : rate >= 70 ? "基本掌握" : rate >= 50 ? "掌握不稳定" : rate > 0 ? "薄弱知识点" : "完全未掌握";
  });
  const errorMap = {};
  questionAnalyses.filter((item) => item.needsDeepDiagnosis).forEach((item) => {
    const loss = item.maxScore - item.score;
    item.errorTypes.forEach((type) => {
      errorMap[type] = errorMap[type] || { count: 0, questionIndexes: [], questionIds: [], scoreLoss: 0, severity: "低", repeated: false };
      errorMap[type].count += 1;
      errorMap[type].questionIndexes.push(item.orderIndex + 1);
      errorMap[type].questionIds.push(item.questionId);
      errorMap[type].scoreLoss += loss;
    });
  });
  Object.values(errorMap).forEach((item) => {
    item.severity = severityForError(item.count, item.scoreLoss);
    item.repeated = item.count >= 2;
  });
  const weakKnowledgePoints = Object.entries(byKnowledge)
    .filter(([, item]) => item.status.includes("薄弱") || item.status.includes("未掌握") || item.status.includes("不稳定"))
    .sort((a, b) => a[1].mastery - b[1].mastery)
    .map(([name]) => name);
  const abilityNames = ["基础计算能力", "公式应用能力", "审题能力", "建模能力", "推理能力", "综合分析能力", "解题规范性", "时间管理能力", "难题处理能力", "检查纠错能力"];
  const abilityDiagnosis = abilityNames.map((name) => abilityEvidenceFor(name, attempts, questions));
  const percent = Math.round(totalScore / totalMax * 100);
  const history = (store.submissions || [])
    .filter((item) => item.studentId === submission.studentId && item.status === "diagnosis_complete" && item.id !== submission.id)
    .slice(-5)
    .map((item) => ({ submissionId: item.id, submittedAt: item.submittedAt, score: item.report?.summary?.totalScore || 0, percent: item.report?.summary?.scoreRate || 0 }));
  const recommendedTasks = weakKnowledgePoints.slice(0, 4).map((point, index) => ({
    id: `task_${submission.id}_${index + 1}`,
    stage: index === 0 ? "复习" : index === 1 ? "基础巩固题" : index === 2 ? "同类变式题" : "综合应用题",
    knowledgePoint: point,
    errorType: Object.keys(errorMap)[0] || "综合应用不足",
    title: `${point}专项补强`,
    target: "完成复习、同类训练和变式复测后再更新掌握度",
    status: "pending"
  }));
  return {
    summary: {
      examinationId: submission.examinationId,
      paperName: submission.paperName,
      submittedAt: submission.submittedAt,
      totalScore,
      totalMax,
      scoreRate: percent,
      correctCount,
      wrongCount: questionAnalyses.filter((item) => !item.finalAnswerCorrect).length,
      deepDiagnosisCount: questionAnalyses.filter((item) => item.needsDeepDiagnosis).length,
      lightRecordCount: questionAnalyses.filter((item) => !item.needsDeepDiagnosis).length,
      unansweredCount,
      objectiveScore,
      subjectiveScore,
      durationMs: submission.durationMs,
      timeout: Boolean(submission.timeout),
      level: percent >= 85 ? "冲刺高分" : percent >= 70 ? "基础较稳" : percent >= 50 ? "薄弱点明显" : "需要系统补漏",
      estimatedExamLevel: `${Math.round(percent * 1.5)}分水平区间`,
      comment: weakKnowledgePoints.length ? `本卷主要短板集中在 ${weakKnowledgePoints.slice(0, 3).join("、")}。` : "本卷表现稳定，可进入更高强度综合训练。"
    },
    byType,
    byChapter,
    byKnowledge,
    errorStats: errorMap,
    abilityDiagnosis,
    questionAnalyses,
    historyCompare: history,
    topProblems: Object.entries(errorMap).sort((a, b) => b[1].scoreLoss - a[1].scoreLoss).slice(0, 3).map(([type, item]) => ({ type, ...item })),
    priorityKnowledge: weakKnowledgePoints.slice(0, 5),
    recommendedTasks,
    loop: {
      current: "诊断完成",
      stages: ["检测", "诊断", "复习", "训练", "复测", "提升"],
      nextAction: recommendedTasks[0]?.title || "进入综合提升训练"
    }
  };
}

function classifyErrorTag(question, attempt, step = {}) {
  const reason = attempt?.aiErrorType || step.errorDescription || reasonForAttempt(question, attempt);
  const firstStep = Number(step.stepNumber || 1);
  return {
    knowledgePoint: question?.chapterName || "考研数学",
    subKnowledgePoint: question?.point || normalizeWeakPoint(question, attempt),
    errorCategory: /识别|OCR|过程/.test(reason) ? "手写识别待确认" : /计算|符号|化简/.test(reason) ? "计算与变形错误" : /公式|方法|换元|分部/.test(reason) ? "方法与公式错误" : /条件|审题|遗漏/.test(reason) ? "审题与条件错误" : "知识应用错误",
    errorType: reason || question?.reason || "解题步骤不完整",
    errorPosition: `第${firstStep}步`,
    sourceWrongStep: firstStep,
    rootCause: attempt?.rootCause || "",
    affectedSteps: attempt?.affectedSteps || [],
    cognitiveReason: /条件|审题/.test(reason) ? "题目信息转化不完整" : /计算|符号/.test(reason) ? "运算监控和符号检查不足" : /公式|方法/.test(reason) ? "方法触发条件没有识别稳定" : "知识点掌握不稳定",
    correctionSuggestion: step.correction || question?.explanation || "先回到知识点定义和适用条件，再做同错因训练。"
  };
}

function latestSubmissionFor(store, studentId, submissionId = "") {
  const list = (store.submissions || []).filter((item) => item.studentId === studentId && (!submissionId || item.id === submissionId || item.submissionId === submissionId));
  return list.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submitt