(function () {
  const isStaticHost = location.hostname.endsWith("github.io") || location.protocol === "file:";
  if (!isStaticHost) return;

  window.__APP_CONFIG__ = { apiBaseUrl: "", environment: "static-demo" };
  window.__APP_BASE_PATH__ = location.hostname.endsWith("github.io")
    ? `/${location.pathname.split("/").filter(Boolean)[0] || ""}`
    : "";

  const nowIso = () => new Date().toISOString();
  const sessionId = localStorage.getItem("demoSessionId") || crypto.randomUUID();
  localStorage.setItem("demoSessionId", sessionId);

  const chapters = [
    { id: "limit", name: "函数、极限与连续", subjects: ["数学一", "数学二", "数学三"], count: 24 },
    { id: "diff", name: "一元函数微分学", subjects: ["数学一", "数学二", "数学三"], count: 28 },
    { id: "integral", name: "一元函数积分学", subjects: ["数学一", "数学二", "数学三"], count: 30 },
    { id: "multi", name: "多元函数微分学", subjects: ["数学一", "数学二", "数学三"], count: 22 },
    { id: "linear", name: "线性代数", subjects: ["数学一", "数学二", "数学三"], count: 26 },
    { id: "prob", name: "概率论与数理统计", subjects: ["数学一", "数学三"], count: 20 },
    { id: "past_exam_2012_math2", name: "2012 数学二真题", subjects: ["数学二"], count: 23 }
  ];

  const q = (id, subjects, chapterId, chapterName, point, reason, type, level, difficulty, stem, options, answer, explanation, extra = {}) => ({
    id, subjects, chapterId, chapterName, point, reason, type, level, difficulty, stem,
    options: options || [], answer, aliases: [], explanation,
    sourceType: extra.sourceType || "teacher_original",
    source: extra.source || "签约教师审核题",
    reviewStatus: extra.reviewStatus || "教师已审核",
    qualityTier: extra.qualityTier || "exam_standard",
    ...extra
  });

  const common = ["数学一", "数学二", "数学三"];
  const questions = [
    q("limit_001", common, "limit", "函数、极限与连续", "等价无穷小", "方法选择错误", "choice", "基础训练", 2, "当 x→0 时，ln(1+x)-x 与下列哪一项等价？", ["-x^2/2", "x^2/2", "x", "-x"], "-x^2/2", "ln(1+x)=x-x^2/2+o(x^2)。"),
    q("limit_002", common, "limit", "函数、极限与连续", "重要极限", "概念理解错误", "choice", "强化训练", 3, "若 lim(x→0) sin(ax)/x = 3，则 a = ?", ["1/3", "1", "3", "不存在"], "3", "sin(ax)~ax，所以极限为 a。"),
    q("diff_001", common, "diff", "一元函数微分学", "隐函数求导", "计算过程错误", "choice", "强化训练", 4, "由 x^2+xy+y^2=3 确定 y=y(x)，则 y' = ?", ["-(2x+y)/(x+2y)", "-(x+2y)/(2x+y)", "(2x+y)/(x+2y)", "x+y"], "-(2x+y)/(x+2y)", "两边对 x 求导并整理。"),
    q("diff_002", common, "diff", "一元函数微分学", "单调性与极值", "题型识别错误", "choice", "强化训练", 3, "若 f'(x)=x(x-1)^2(x+1)，则 x=1 是 f(x) 的什么点？", ["极大值点", "极小值点", "非极值驻点", "不可导点"], "非极值驻点", "x=1 两侧导数符号不变。"),
    q("integral_001", common, "integral", "一元函数积分学", "换元积分", "方法选择错误", "choice", "基础训练", 2, "令 t=1+x^2，则 ∫2x√(1+x^2)dx 可化为？", ["∫√t dt", "∫2√t dt", "∫x√t dt", "∫t dt"], "∫√t dt", "dt=2x dx，整体替换即可。"),
    q("integral_002", common, "integral", "一元函数积分学", "变上限积分", "方法选择错误", "choice", "强化训练", 4, "设 F(x)=∫(0 到 x^2) e^(-t^2)dt，则 F'(x) = ?", ["2xe^(-x^4)", "e^(-x^4)", "2x·e^(-x^2)", "∫(0 到 2x)e^(-t^2)dt"], "2xe^(-x^4)", "变上限积分先代上限，再乘以上限函数导数。"),
    q("integral_003", common, "integral", "一元函数积分学", "不定积分常数", "表达不完整", "fill", "基础训练", 1, "计算 ∫2x dx。", [], "x^2+C", "不定积分结果需要加任意常数 C。"),
    q("integral_004", common, "integral", "一元函数积分学", "分部积分", "综合应用不足", "fill", "强化训练", 4, "计算 ∫(0 到 1) x ln(1+x) dx。", [], "1/4", "分部积分后化为有理函数积分。"),
    q("multi_001", common, "multi", "多元函数微分学", "偏导数", "计算过程错误", "choice", "基础训练", 2, "z=x^2y+3y，求 z 对 x 的偏导数。", ["2xy", "x^2+3", "2x+3", "x^2y"], "2xy", "对 x 求偏导时把 y 看作常数。"),
    q("linear_001", common, "linear", "线性代数", "矩阵秩", "概念理解错误", "choice", "强化训练", 4, "3阶矩阵 A 的秩为 2，则齐次方程 Ax=0 的基础解系含有几个解向量？", ["0", "1", "2", "3"], "1", "基础解系个数为未知量个数减秩。"),
    q("linear_002", common, "linear", "线性代数", "行列式", "计算过程错误", "fill", "基础训练", 1, "矩阵 [[1,2],[3,4]] 的行列式是？", [], "-2", "二阶行列式 ad-bc=4-6=-2。"),
    q("prob_001", ["数学一", "数学三"], "prob", "概率论与数理统计", "独立事件", "公式记忆错误", "choice", "基础训练", 2, "A、B 独立，P(A)=0.4，P(B)=0.5，则 P(AB)=?", ["0.9", "0.2", "0.1", "0.45"], "0.2", "独立事件交集概率等于概率乘积。"),
    q("past_2012_math2_q01", ["数学二"], "past_exam_2012_math2", "2012 数学二真题", "选择题第1题", "真题切片练习", "choice", "历年真题", 4, "2012年考研数学二第1题", ["A", "B", "C", "D"], "A", "演示版保留真题切片样式，正式答案可由教研校对后启用。", { sourceType: "past_exam", source: "2012 数学二真题", qualityTier: "past_exam_image", stemImage: "past-exam-slices/2012-math2/q01.jpg" }),
    q("past_2012_math2_q02", ["数学二"], "past_exam_2012_math2", "2012 数学二真题", "选择题第2题", "真题切片练习", "choice", "历年真题", 4, "2012年考研数学二第2题", ["A", "B", "C", "D"], "B", "演示版保留真题切片样式，正式答案可由教研校对后启用。", { sourceType: "past_exam", source: "2012 数学二真题", qualityTier: "past_exam_image", stemImage: "past-exam-slices/2012-math2/q02.jpg" })
  ];

  const key = `staticDemo:${sessionId}`;
  const readStore = () => JSON.parse(localStorage.getItem(key) || '{"students":[],"attempts":[]}');
  const writeStore = (store) => localStorage.setItem(key, JSON.stringify(store));
  const json = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  }));
  const scoreAnswer = (question, attempt) => {
    const value = String(attempt.answer || attempt.selectedOption || "").replace(/\s+/g, "").toLowerCase();
    const answer = String(question.answer || "").replace(/\s+/g, "").toLowerCase();
    if (!value && question.type !== "choice" && attempt.strokeCount > 0) return null;
    return Boolean(value && answer && value === answer);
  };
  const diagnose = (question, correct, attempt) => {
    if (correct === true) return { reason: "已掌握", advice: "本题表现稳定，可在做题集中安排间隔复刷。" };
    if (correct === null) return { reason: "待识别", advice: "静态演示版已保存草稿轨迹；接入 OpenAI/OCR 后可识别手写步骤并自动判分。" };
    return { reason: question.reason, advice: `优先复习「${question.point}」，再做 3 道同知识点变式题。` };
  };

  function studentFrom(body) {
    const store = readStore();
    let student = store.students[0];
    if (!student) {
      student = {
        id: `demo_${sessionId}`,
        inviteCode: "demo",
        name: body.name || "演示同学",
        mathType: body.mathType || "数学二",
        targetScore: Number(body.targetScore || 120),
        stage: body.stage || "强化阶段",
        dailyMinutes: Number(body.dailyMinutes || 60),
        isDemo: true,
        createdAt: nowIso(),
        lastLoginAt: nowIso()
      };
      store.students = [student];
      writeStore(store);
    }
    return student;
  }

  function buildReport(studentId) {
    const store = readStore();
    const attempts = store.attempts.filter((a) => a.studentId === studentId);
    const gradable = attempts.filter((a) => typeof a.correct === "boolean");
    const correct = gradable.filter((a) => a.correct).length;
    const weakMap = {};
    attempts.filter((a) => a.correct === false).forEach((a) => {
      weakMap[a.reason] = (weakMap[a.reason] || 0) + 1;
    });
    return {
      total: attempts.length,
      gradableTotal: gradable.length,
      accuracy: gradable.length ? Math.round(correct / gradable.length * 100) : 0,
      pending: attempts.length - gradable.length,
      weakReasons: Object.entries(weakMap).map(([reason, count]) => ({
        reason, count, advice: `围绕「${reason}」补 3-5 道同类变式题，再回到原题重做。`
      }))
    };
  }

  function buildLoop(studentId) {
    const store = readStore();
    const attempts = store.attempts.filter((a) => a.studentId === studentId);
    const lastWrong = attempts.findLast((a) => a.correct === false) || attempts[attempts.length - 1];
    const baseQuestion = questions.find((item) => item.id === lastWrong?.questionId) || questions[5];
    const weakPoint = baseQuestion.point;
    const errorType = lastWrong?.reason || baseQuestion.reason;
    const report = buildReport(studentId);
    return {
      homeCounters: { reviewPending: 1, trainingPending: 3, retryPending: 1, conquered: 0, needsReinforcement: 1 },
      diagnosis: {
        score: `${Math.round(report.accuracy || 62)}%`,
        accuracy: report.accuracy || 62,
        weakKnowledgePoints: [weakPoint, errorType],
        summary: `系统定位到主要问题是「${weakPoint}」相关的${errorType}，建议先复习知识点，再做相似题，最后回到原题重做验证。`,
        questionAnalyses: [{
          typeLabel: baseQuestion.type === "choice" ? "选择题" : "计算题",
          score: lastWrong?.correct ? 5 : 2,
          maxScore: 5,
          title: baseQuestion.stem,
          studentAnswer: lastWrong?.answer || lastWrong?.selectedOption || "草稿已保存",
          standardAnswer: baseQuestion.answer,
          finalAnswerCorrect: Boolean(lastWrong?.correct),
          errorTypes: [errorType],
          knowledgePoints: [weakPoint],
          steps: [
            { stepNumber: 1, status: "partial", judgment: "思路部分正确", score: 1, maxScore: 2, studentContent: "能识别题型，但关键条件使用不完整", normalizedExpression: "题型识别完成", errorDescription: errorType, correction: `回到 ${weakPoint} 的适用条件`, relatedKnowledgePoint: weakPoint },
            { stepNumber: 2, status: lastWrong?.correct ? "correct" : "wrong", judgment: lastWrong?.correct ? "结果正确" : "关键步骤偏差", score: lastWrong?.correct ? 3 : 1, maxScore: 3, studentContent: lastWrong?.answer || "草稿步骤", normalizedExpression: baseQuestion.answer, errorDescription: lastWrong?.correct ? "无" : "计算或方法选择出现偏差", correction: "先完成知识点复习后再进入变式训练", relatedKnowledgePoint: weakPoint }
          ]
        }]
      },
      recoveryPath: { currentStage: "DIAGNOSED", nextAction: "先完成知识点复习，通过理解检查后再进入相似题训练。" },
      reviewModule: {
        title: `${weakPoint} 知识点复习`,
        relationToMistake: `本题错误直接关联到「${weakPoint}」的使用条件和步骤完整性。`,
        formulas: ["先判断题型与条件", "再选择方法", "最后检查常数、符号和定义域"],
        coreConcept: "不是只看最后答案，而是定位第一次发生偏差的位置。",
        conditions: "当题目出现同类结构时，先写出可用条件，再进行计算。",
        commonMistakes: ["跳过条件判断", "公式套用方向错误", "计算后未回代检查"],
        correctExample: `先标出 ${weakPoint}，再列出对应公式或方法。`,
        wrongExample: "直接凭印象套公式，导致中间步骤偏差。",
        strategy: "复习 3 分钟，完成理解检查，再进入 3 层相似题。"
      },
      understandingCheck: {
        purpose: "确认学生理解错因后，再进入训练，避免随机刷题。",
        question: `这类题首先应该检查什么？`,
        options: [
          { key: "A", text: "直接看答案" },
          { key: "B", text: `判断 ${weakPoint} 的适用条件` },
          { key: "C", text: "随便换一个公式" }
        ],
        answer: "B",
        passFeedback: "通过。可以进入相似题训练。",
        failFeedback: "还没有抓住关键，应回到知识点复习。"
      },
      trainingPlan: { goal: `围绕 ${weakPoint} 做分层训练`, totalQuestions: 3, estimatedMinutes: 15, completionStandard: "至少完成 2 道且不重复原错误", items: [] },
      similarTraining: {
        goal: `围绕 ${weakPoint} 的相似题训练`,
        levels: [
          { level: "基础", title: "同知识点低负荷题", stem: "先写出适用条件，再计算。", target: weakPoint, hint: "不要直接跳步骤", feedback: "如果错，先回看概念卡片。" },
          { level: "强化", title: "变式条件题", stem: "条件稍作变化，判断方法是否仍适用。", target: weakPoint, hint: "比较原题差异", feedback: "错因多来自方法迁移不稳。" },
          { level: "综合", title: "跨步骤综合题", stem: "加入计算和表达检查。", target: weakPoint, hint: "最后回代验证", feedback: "用于确认能否独立完成。" }
        ]
      },
      originalRetry: {
        stem: baseQuestion.stem,
        firstMistakeSummary: `${errorType}，第一次偏差通常出现在「${weakPoint}」的条件判断或关键计算。`,
        acceptedSignals: [baseQuestion.answer, weakPoint],
        durationSecond: 180
      },
      masteryVerification: {
        status: "WAITING",
        firstError: errorType,
        masteredFeedback: "重做时已经避开原错误，说明该知识点进入基本掌握状态。",
        reinforceFeedback: "仍重复原错误，需要降低训练难度并重新复习。"
      },
      retest: { score: 80, independent: true, hintsUsed: 0, passed: true, questions: [{ typeLabel: "变式题", difficulty: "强化", stem: "同知识点变式复测题", target: weakPoint, result: "用于判断迁移能力" }] },
      improvement: { beforeMastery: 45, afterMastery: 78, improvementValue: 33, status: "明显提升", originalError: errorType, trainingResult: "完成知识点复习、理解检查和相似题训练。", nextRisk: "间隔 2 天后需要复刷，防止遗忘。" },
      comparisonReport: { firstScore: "2/5", retryScore: "4/5", firstDuration: "4 分钟", retryDuration: "3 分钟", firstErrorStep: errorType, firstSteps: "第一次跳过关键判断", retryStepPerformance: "第二次补全关键条件", sameErrorRepeated: false },
      profile: { abilities: [
        { name: "概念理解", previous: 52, current: 72, trend: "上升", evidence: "理解检查通过", suggestion: "继续用口述方式复述概念" },
        { name: "方法选择", previous: 45, current: 68, trend: "上升", evidence: "相似题训练通过", suggestion: "多做条件变化题" },
        { name: "计算稳定性", previous: 60, current: 70, trend: "稳定", evidence: "草稿步骤较完整", suggestion: "加强符号与常数检查" }
      ] }
    };
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const raw = typeof input === "string" ? input : input.url;
    const url = new URL(raw, location.origin);
    const apiIndex = url.pathname.indexOf("/api/");
    if (apiIndex < 0) return originalFetch(input, init);
    const path = url.pathname.slice(apiIndex);
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    const store = readStore();

    if (method === "GET" && path === "/api/health") return json({ status: "ok", environment: "static-demo", timestamp: nowIso() });
    if (method === "GET" && path === "/api/bootstrap") return json({ chapters, inviteCodes: ["demo"], pastExamSources: { trustedSources: [], candidateSourcesNeedReview: [] }, aiStatus: { handwritingRecognition: false, model: "static-demo" } });
    if (method === "GET" && path === "/api/past-exam-sources") return json({ trustedSources: [{ site: "演示真题来源", items: [{ year: "2012", mathType: "数学二", title: "2012 全国硕士研究生入学考试数学二试题", format: "image_slices", importStatus: "demo_ready", url: "https://yz.chsi.com.cn/" }] }], candidateSourcesNeedReview: [] });
    if (method === "POST" && path === "/api/login") {
      if ((body.password || "demo123") !== "demo123") return json({ error: "演示账号密码错误" }, 401);
      const student = studentFrom(body);
      student.name = body.name || student.name;
      student.mathType = body.mathType || student.mathType;
      student.lastLoginAt = nowIso();
      writeStore({ ...store, students: [student] });
      return json({ student, demo: true, sessionId });
    }
    if (method === "POST" && path === "/api/demo/reset") {
      writeStore({ students: store.students, attempts: [] });
      return json({ ok: true, student: store.students[0] || studentFrom({}) });
    }
    if (method === "GET" && path === "/api/questions") {
      const student = store.students[0] || studentFrom({});
      const chapterId = url.searchParams.get("chapterId") || "integral";
      const count = Math.min(50, Number(url.searchParams.get("count") || 20));
      const difficulty = url.searchParams.get("difficulty") || "all";
      const sourceType = url.searchParams.get("sourceType") || "all";
      const mode = url.searchParams.get("mode") || "reinforce";
      let pool = questions.filter((item) => item.subjects.includes(student.mathType) && (chapterId === "all" || item.chapterId === chapterId));
      if (sourceType !== "all") pool = pool.filter((item) => item.sourceType === sourceType);
      if (!["all", "mode"].includes(difficulty)) pool = pool.filter((item) => String(item.difficulty) === String(difficulty));
      if (!pool.length) pool = questions.filter((item) => item.subjects.includes(student.mathType));
      const selected = Array.from({ length: Math.min(count, pool.length) }, (_, index) => pool[(index + Date.now()) % pool.length]);
      return json({ questions: selected, chapterId, count, difficulty, sourceType, mode });
    }
    if (method === "POST" && path === "/api/attempts") {
      const question = questions.find((item) => item.id === body.questionId);
      if (!question) return json({ error: "题目不存在" }, 404);
      const correct = scoreAnswer(question, body);
      const diagnosis = diagnose(question, correct, body);
      const attempt = {
        id: `att_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        studentId: body.studentId,
        questionId: question.id,
        chapterId: question.chapterId,
        answer: body.answer || body.selectedOption || "",
        selectedOption: body.selectedOption || "",
        strokeCount: Number(body.strokeCount || 0),
        durationMs: Number(body.durationMs || 0),
        gradingStatus: correct === null ? "pending_recognition" : "graded",
        correct,
        reason: diagnosis.reason,
        advice: diagnosis.advice,
        evidence: [question.explanation],
        createdAt: nowIso()
      };
      store.attempts.push(attempt);
      writeStore(store);
      return json({ attempt, question });
    }
    if (method === "GET" && path === "/api/report") return json({ attempts: store.attempts, report: buildReport(url.searchParams.get("studentId")) });
    if (method === "GET" && path === "/api/learning-loop") return json({ loop: buildLoop(url.searchParams.get("studentId")) });
    if (method === "GET" && path === "/api/collection") {
      const latest = new Map();
      store.attempts.forEach((attempt) => latest.set(attempt.questionId, attempt));
      return json({ items: Array.from(latest.values()).map((attempt) => ({ attempt, question: questions.find((item) => item.id === attempt.questionId), times: store.attempts.filter((a) => a.questionId === attempt.questionId).length })) });
    }
    return json({ error: "静态演示 API 不存在" }, 404);
  };
})();
