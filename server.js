const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createTrainingQuestion: createGeneratedTrainingQuestion, validateTrainingQuestion } = require("./public/training-factory.js");
const { gradeQuestion: runCanonicalGrading, canonicalQuestionType } = require("./public/grading-engine.js");

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
  if (!Array.isArray(store.questions) || store.questions.length < 10000 || store.meta.questionSchemaVersion !== 13) {
    store.questions = buildQuestions().map(enrichQuestionWithSolution);
    store.meta.questionSchemaVersion = 13;
    saveDb(store);
  } else {
    const missingSolutions = store.questions.some((question) => question.solutionVersion !== 1);
    if (missingSolutions) {
      store.questions = store.questions.map(enrichQuestionWithSolution);
      saveDb(store);
    }
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

function solutionStep(order, title, content) {
  return { order, title, content };
}

function buildDetailedSolution(question) {
  const stem = String(question.stem || "");
  const chapter = question.chapterName || "考研数学";
  const point = question.point || chapter;
  const answer = question.answer || "待教研校对";
  const formula = question.formula || "先写出定义、公式和适用条件";
  const explanation = question.explanation || "按等式逐步完成代入、变形和化简，并保留能够复核的中间结果。";
  const common = `本题考查${chapter}中的${point}。先把题干条件翻译成数学关系，再选择公式并逐步计算。`;
  let examFocus = common;
  let preAnalysis = "读题时先标出已知量、所求量、定义域和限制条件，确认每一步变形都在题目允许的范围内。";
  let formulas = [formula, "每一步保留等号或等价号的依据", "最后检查定义域、符号、范围和题目问法"];
  let steps = [
    solutionStep(1, "第1步：提取条件", "明确题目给出的量、关系式和最终所求，不能只看最后一个空。"),
    solutionStep(2, "第2步：选择方法", `根据${point}选择对应定义或公式，并先确认公式的适用条件。`),
    solutionStep(3, "第3步：逐步推导", explanation),
    solutionStep(4, "第4步：检查结论", `得到${answer}。回代原条件，检查符号、定义域、单位和结论是否真正回答了题目。`)
  ];
  let commonPitfall = `本题容易在${question.reason || "方法选择或计算过程"}处出错。不要跳过关键中间步骤，做完后再次核对最后一步。`;

  if (/极限|lim|sin|cos|tan|ln|e\^/i.test(stem)) {
    examFocus = `本题考查${point}，核心是判断分子、分母的最低非零阶并选择正确的极限工具。`;
    preAnalysis = "先代入判断是否为未定式，再观察是否存在相减相消；如果低阶项会相消，展开阶数必须至少达到分母的最低非零阶。";
    formulas = [formula, "sin u∼u，tan u∼u，1−cos u∼u²/2，ln(1+u)=u−u²/2+o(u²)", "等价无穷小只能在乘除结构中稳定替换，相减结构要先展开到保留下来的阶数"];
    steps = [
      solutionStep(1, "第1步：判断未定式与相消关系", "将趋近值代入，确定是 0/0 还是需要比较无穷小阶数；特别检查分子中是否有同阶项相减。"),
      solutionStep(2, "第2步：选取展开阶数", "分母是几阶，就至少保留分子中相应的最低非零阶；若一次项被消掉，就必须继续保留二次项。"),
      solutionStep(3, "第3步：代入等价无穷小或泰勒展开", explanation),
      solutionStep(4, "第4步：约去公共阶并求极限", `化去分子、分母的公共最低阶，得到最终结果 ${answer}，再检查是否遗漏高阶无穷小。`)
    ];
    commonPitfall = "不能在相减结构中直接把一阶等价无穷小代入；一次项相消后，真正决定极限的可能是二阶或更高阶项。";
  } else if (/积分|∫|面积|利润|应用建模/.test(stem + point)) {
    examFocus = `本题考查${point}，重点是识别积分模型、积分方法和上下限或常数条件。`;
    preAnalysis = "先判断是不定积分、定积分、反常积分还是应用建模题；写清被积函数、积分区间、换元关系或分部积分中的 u、dv。";
    formulas = [formula, "∫u dv=uv−∫v du", "定积分先求原函数再代入上下限；不定积分最后必须补常数 C"];
    steps = [
      solutionStep(1, "第1步：确定积分类型", "区分不定积分与定积分，检查上下限、被积函数和是否需要常数 C。"),
      solutionStep(2, "第2步：选择积分方法", "看到内层函数及其导数因子优先换元；乘积中多项式与指数、对数或三角函数组合时检查分部积分。"),
      solutionStep(3, "第3步：逐步计算", explanation),
      solutionStep(4, "第4步：回代与检查", `得到 ${answer}。检查上下限代入、常数项、符号以及应用题中的取值范围。`)
    ];
    commonPitfall = question.type === "fill" ? "不定积分漏写 C、定积分误保留 C、换元后忘记替换 dx，都是本类题的高频错误。" : "先写方法依据再计算，不能只凭形式套公式。";
  } else if (/导数|偏导|全微分|极值|单调/.test(stem + point)) {
    examFocus = `本题考查${point}，重点是变量依赖关系、求导规则和结论成立条件。`;
    preAnalysis = "先确定对哪个变量求导，以及其他变量是否视为常数；若判断极值或单调性，还要检查驻点附近符号或二阶条件。";
    formulas = [formula, "链式法则：对外层求导后乘以内层导数", "二元函数：dz=z_x dx+z_y dy；极值判断要结合驻点和判别条件"];
    steps = [
      solutionStep(1, "第1步：确定求导对象", "标明自变量和因变量；偏导时把其他自变量视为常数。"),
      solutionStep(2, "第2步：写出求导规则", `根据${point}选择链式法则、隐函数求导、偏导或极值判别公式。`),
      solutionStep(3, "第3步：逐步计算", explanation),
      solutionStep(4, "第4步：验证结论", `得到 ${answer}。检查内层导数、符号变化、驻点条件和定义域。`)
    ];
    commonPitfall = "复合函数漏乘内层导数、偏导时没有固定其他变量、极值题只求驻点不做判别，是本类题最常见的过程错误。";
  } else if (/矩阵|行列式|秩|线性|特征值/.test(stem + point)) {
    examFocus = `本题考查${point}，重点是矩阵运算规则、秩与维数关系或行列式性质。`;
    preAnalysis = "先确认矩阵阶数、行列式结构、秩和未知量个数，再选择按定义计算、初等变换或维数定理。";
    formulas = [formula, "二阶行列式 ad−bc", "齐次方程组解空间维数 = 未知量个数 − 矩阵秩"];
    steps = [
      solutionStep(1, "第1步：读出矩阵信息", "确认矩阵的阶数、元素位置、秩或相似关系，避免把矩阵乘法和数乘混淆。"),
      solutionStep(2, "第2步：选择运算依据", "按行列式展开、初等变换、秩-维数定理或特征值性质建立计算路径。"),
      solutionStep(3, "第3步：完成计算", explanation),
      solutionStep(4, "第4步：检查维数与符号", `得到 ${answer}。检查矩阵阶数、行列式符号和解空间维数是否与题意一致。`)
    ];
    commonPitfall = "矩阵乘法通常不满足交换律；行列式变换会影响符号或倍数；秩与未知量个数不能混为一谈。";
  } else if (/概率|期望|方差|独立|分布/.test(stem + point)) {
    examFocus = `本题考查${point}，重点是识别事件关系和期望、方差的线性性质。`;
    preAnalysis = "先确认题目给出的是独立、互斥还是一般事件，再根据随机变量的线性变换写出概率、期望或方差公式。";
    formulas = [formula, "独立事件：P(AB)=P(A)P(B)", "E(aX+b)=aE(X)+b；D(aX+b)=a²D(X)"];
    steps = [
      solutionStep(1, "第1步：识别关系", "区分独立与互斥；独立可以相乘，互斥只能说明交集为空，不能直接替代。"),
      solutionStep(2, "第2步：写出性质", `根据${point}写出对应概率、期望或方差公式。`),
      solutionStep(3, "第3步：代入计算", explanation),
      solutionStep(4, "第4步：检查范围", `得到 ${answer}。概率应位于 [0,1]，方差非负，线性变换的系数平方不能漏掉。`)
    ];
    commonPitfall = "把独立误认为互斥、把方差的系数写成一次方、忽略概率范围，是本类题的主要错误。";
  } else if (/微分方程|方程 y|通解/.test(stem + point)) {
    examFocus = `本题考查${point}，重点是识别方程类型并保留通解中的任意常数。`;
    preAnalysis = "先判断是可分离变量、一阶线性还是其他标准形式，再写出积分因子或分离后的积分关系；有初值时最后代入确定常数。";
    formulas = [formula, "可分离变量：dy/y=f(x)dx", "一阶线性方程先乘积分因子，再对左侧整体求导"];
    steps = [
      solutionStep(1, "第1步：识别方程类型", "观察方程是否能分离变量，或是否符合 y'+P(x)y=Q(x) 的一阶线性形式。"),
      solutionStep(2, "第2步：建立积分关系", "分离变量或写出积分因子，保证每一步都记录任意常数。"),
      solutionStep(3, "第3步：整理通解或特解", explanation),
      solutionStep(4, "第4步：代回检验", `得到 ${answer}。将结果代回原方程或初值条件，确认符号和常数正确。`)
    ];
    commonPitfall = "漏掉任意常数、初值代入过早、积分因子写错，是微分方程题最常见的过程错误。";
  } else if (/级数|幂级数|收敛/.test(stem + …27542 tokens truncated…，销量减少2件。求使总利润为2400元时的涨价额。",
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
    const { score, maxScore, grading } = scoreForAttempt(question, attempt);
    const reason = reasonForAttempt(question, attempt);
    return {
      typeLabel: typeLabelFor(grading.questionType),
      score,
      maxScore,
      finalAnswerCorrect: grading.isCorrect === true,
      title: question.stem || question.point || question.chapterName || "未命名题目",
      studentAnswer: attempt.recognizedAnswer || attempt.answer || attempt.selectedOption || "",
      standardAnswer: question.answer || "待校对",
      errorTypes: grading.diagnosisTriggered ? [reason] : [],
      gradingCanonicalStatus: grading.status,
      gradingResult: grading,
      knowledgePoints: [normalizeWeakPoint(question, attempt)],
      steps: buildStepAnalysis(question, attempt)
    };
  });
  const totalScore = questionAnalyses.reduce((sum, item) => sum + item.score, 0);
  const totalMax = Math.max(1, questionAnalyses.reduce((sum, item) => sum + item.maxScore, 0));
  const wrongItems = questionAnalyses.filter((item) => ["INCORRECT", "PARTIAL"].includes(item.gradingCanonicalStatus));
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
  const first = loop.diagnosis?.questionAnalyses?.find((item) => ["INCORRECT", "PARTIAL"].includes(item.gradingCanonicalStatus)) || loop.diagnosis?.questionAnalyses?.[0] || {};
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
