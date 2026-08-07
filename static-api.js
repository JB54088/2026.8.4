(function () {
  const isStaticHost = location.hostname.endsWith("github.io") || location.protocol === "file:";
  if (!isStaticHost) return;
  const { gradeQuestion } = window.GradingEngine || {};

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
    q("subjective_integral_model_001", common, "integral", "一元函数积分学", "定积分应用建模", "建模错误", "subjective", "综合提升", 4, "某商品原售价60元，成本40元。若每涨价1元，销量减少2件。设原销量为100件，求使总利润为2400元时的涨价额，并写出完整建模过程。", [], "(20+x)(100-2x)=2400", "设涨价额为 x，则单件利润为 60+x-40=20+x，销量为 100-2x，总利润模型为 (20+x)(100-2x)=2400。"),
    q("subjective_multi_extreme_001", common, "multi", "多元函数微分学", "多元函数极值", "条件遗漏", "subjective", "综合提升", 4, "求函数 z=x^2+y^2-2x-4y+1 的极值，并说明取得极值的点。", [], "极小值-4，点(1,2)", "配方 z=(x-1)^2+(y-2)^2-4，所以在 (1,2) 处取得极小值 -4。"),
    q("multi_001", common, "multi", "多元函数微分学", "偏导数", "计算过程错误", "choice", "基础训练", 2, "z=x^2y+3y，求 z 对 x 的偏导数。", ["2xy", "x^2+3", "2x+3", "x^2y"], "2xy", "对 x 求偏导时把 y 看作常数。"),
    q("linear_001", common, "linear", "线性代数", "矩阵秩", "概念理解错误", "choice", "强化训练", 4, "3阶矩阵 A 的秩为 2，则齐次方程 Ax=0 的基础解系含有几个解向量？", ["0", "1", "2", "3"], "1", "基础解系个数为未知量个数减秩。"),
    q("linear_002", common, "linear", "线性代数", "行列式", "计算过程错误", "fill", "基础训练", 1, "矩阵 [[1,2],[3,4]] 的行列式是？", [], "-2", "二阶行列式 ad-bc=4-6=-2。"),
    q("prob_001", ["数学一", "数学三"], "prob", "概率论与数理统计", "独立事件", "公式记忆错误", "choice", "基础训练", 2, "A、B 独立，P(A)=0.4，P(B)=0.5，则 P(AB)=?", ["0.9", "0.2", "0.1", "0.45"], "0.2", "独立事件交集概率等于概率乘积。"),
    q("past_2012_math2_q01", ["数学二"], "past_exam_2012_math2", "2012 数学二真题", "选择题第1题", "真题切片练习", "choice", "历年真题", 4, "2012年考研数学二第1题", ["A", "B", "C", "D"], "A", "演示版保留真题切片样式，正式答案可由教研校对后启用。", { sourceType: "past_exam", source: "2012 数学二真题", qualityTier: "past_exam_image", stemImage: "past-exam-slices/2012-math2/q01.jpg" }),
    q("past_2012_math2_q02", ["数学二"], "past_exam_2012_math2", "2012 数学二真题", "选择题第2题", "真题切片练习", "choice", "历年真题", 4, "2012年考研数学二第2题", ["A", "B", "C", "D"], "B", "演示版保留真题切片样式，正式答案可由教研校对后启用。", { sourceType: "past_exam", source: "2012 数学二真题", qualityTier: "past_exam_image", stemImage: "past-exam-slices/2012-math2/q02.jpg" })
  ];

  // The public demo has no server-side database. Expand each chapter from reviewed
  // seed questions so the fixed 20-question flow is still usable and refreshable.
  chapters.filter((chapter) => chapter.id !== "past_exam_2012_math2").forEach((chapter) => {
    const existing = questions.filter((item) => item.chapterId === chapter.id);
    const seed = existing[0] || {
      id: `demo_seed_${chapter.id}`,
      subjects: chapter.subjects,
      chapterId: chapter.id,
      chapterName: chapter.name,
      point: chapter.name,
      reason: "章节综合应用"
    };
    const targetCount = 80;
    for (let index = existing.length; index < targetCount; index += 1) {
      const variant = window.TrainingFactory.createTrainingQuestion({
        sourceQuestion: { ...seed, id: `${seed.id}_source`, chapterId: chapter.id, point: seed.point || chapter.name },
        sourceTag: { questionId: seed.id, errorType: ["概念理解错误", "公式条件错误", "方法选择错误", "计算过程错误"][index % 4], subKnowledgePoint: seed.point || chapter.name, errorCategory: "章节专项训练" },
        index: index % 10,
        variant: index + 1,
        trainingType: "targeted",
        purpose: "章节20题训练"
      });
      questions.push({
        id: `demo_${chapter.id}_${String(index + 1).padStart(3, "0")}`,
        subjects: chapter.subjects,
        chapterId: chapter.id,
        chapterName: chapter.name,
        point: variant.knowledgePoint || seed.point || chapter.name,
        reason: variant.sourceErrorType || seed.reason || "章节综合应用",
        type: variant.questionType,
        level: variant.difficulty <= 2 ? "基础训练" : variant.difficulty >= 4 ? "综合训练" : "强化训练",
        difficulty: variant.difficulty,
        stem: variant.stem,
        formula: variant.formula,
        options: variant.options || [],
        answer: variant.answer,
        aliases: variant.aliases || [],
        explanation: variant.explanation,
        detailedSolution: variant.detailedSolution,
        sourceType: "teacher_original",
        source: "演示题库·规则变式",
        reviewStatus: "演示题已校验",
        qualityTier: "exam_standard",
        generatedFrom: "static-demo-seed"
      });
    }
  });

  chapters.forEach((chapter) => {
    chapter.countsByMathType = {};
    questions.filter((item) => item.chapterId === chapter.id).forEach((item) => {
      (item.subjects || []).forEach((mathType) => {
        chapter.countsByMathType[mathType] = (chapter.countsByMathType[mathType] || 0) + 1;
      });
    });
  });

  const key = `staticDemo:${sessionId}`;
  const readStore = () => JSON.parse(localStorage.getItem(key) || '{"students":[],"attempts":[],"submissions":[],"trainingBatches":[],"trainingRecords":[],"retestRecords":[]}');
  const writeStore = (store) => localStorage.setItem(key, JSON.stringify(store));
  const json = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  }));
  const extractFillAnswerFromWorkSpace = (text = "") => {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return "";
    const patterns = [/(?:答案|最终答案|结果|填空)\s*[:：=]\s*(.+)$/i, /(?:所以|故|因此)\s*(?:答案|结果)?\s*(?:为|是|=)\s*(.+)$/i, /(?:ans|answer)\s*[:=]\s*(.+)$/i];
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
  };
  const diagnose = (question, correct, attempt) => {
    if (correct === true) return { reason: "已掌握", advice: "本题表现稳定，可在做题集中安排间隔复刷。" };
    if (correct === null) return { reason: "待识别", advice: "静态演示版已保存草稿轨迹；接入 OpenAI/OCR 后可识别手写步骤并自动判分。" };
    return { reason: question.reason, advice: `优先复习「${question.point}」，再做 3 道同知识点变式题。` };
  };

  const typeLabelFor = (type) => ["choice", "single_choice"].includes(type) ? "选择题" : type === "multiple_choice" ? "多选题" : type === "true_false" ? "判断题" : ["fill", "fill_blank", "numeric"].includes(type) ? "填空题" : "主观题";
  const hasResponseContent = (payload = {}) => Boolean(payload.answer || payload.selectedOption || payload.formulaText || payload.stepsText || payload.scratchImage || payload.answerImage || payload.strokeCount);
  const scoreForAttempt = (question, attempt) => {
    const grading = gradeQuestion(question, attempt || {});
    return { score: grading.score, maxScore: grading.maxScore, grading };
  };
  const stepAnalysisFor = (question, attempt) => {
    const scored = scoreForAttempt(question, attempt);
    const grading = scored.grading;
    if (!attempt || ["EMPTY", "RECOGNITION_FAILED", "NEEDS_MANUAL_REVIEW"].includes(grading.status)) return [{ stepNumber: 1, status: "blank", judgment: grading.status === "EMPTY" ? "未作答" : "暂不能可靠识别或判定", score: 0, maxScore: scored.maxScore, studentContent: attempt?.stepsText || "未识别到可判分步骤", normalizedExpression: "pending", errorDescription: grading.reason, correction: "请补充作答或重新确认识别结果。", relatedKnowledgePoint: question.point }];
    if (grading.status === "CORRECT") return [{ stepNumber: 1, status: "correct", judgment: "最终答案正确", score: scored.maxScore, maxScore: scored.maxScore, studentContent: attempt.answer || attempt.selectedOption || attempt.stepsText || "直接作答", normalizedExpression: grading.normalizedStudentAnswer || "", errorDescription: "暂未发现明显错误。", correction: question.explanation, relatedKnowledgePoint: question.point }];
    return [{ stepNumber: 1, status: grading.status === "PARTIAL" ? "partial" : "wrong", judgment: grading.status === "PARTIAL" ? "答案正确但过程需要复核" : "答案与标准答案不一致", score: scored.score, maxScore: scored.maxScore, studentContent: attempt.stepsText || attempt.answer || attempt.selectedOption || "未作答", normalizedExpression: grading.normalizedStudentAnswer || "", errorDescription: grading.reason || question.reason, correction: question.explanation, relatedKnowledgePoint: question.point }];
  };
  const buildSubmissionReport = (submission, store) => {
    const qs = submission.questionIds.map((qid) => questions.find((q) => q.id === qid)).filter(Boolean);
    const atts = submission.attemptIds.map((aid) => store.attempts.find((a) => a.id === aid)).filter(Boolean);
    const byId = new Map(atts.map((attempt) => [attempt.questionId, attempt]));
    const questionAnalyses = qs.map((question, index) => {
      const attempt = byId.get(question.id);
      const scored = scoreForAttempt(question, attempt);
      const processIssue = grading.status === "PARTIAL";
      const needsDeepDiagnosis = Boolean(grading.diagnosisTriggered);
      return { questionId: question.id, orderIndex: index, type: grading.questionType, typeLabel: typeLabelFor(grading.questionType), chapterName: question.chapterName, knowledgePoints: [question.point], title: question.stem, studentAnswer: attempt?.answer || attempt?.selectedOption || "", studentSteps: attempt?.stepsText || "", standardAnswer: question.answer, standardSteps: question.explanation, score: scored.score, maxScore: scored.maxScore, finalAnswerCorrect: grading.isCorrect === true, processCorrect: grading.isCorrect === true && !processIssue, answerCorrectButProcessIssue: processIssue, needsDeepDiagnosis, analysisDepth: needsDeepDiagnosis ? "deep" : "light", processIssue: { hasIssue: Boolean(processIssue), reason: processIssue ? "结果正确但过程需要复核" : "", severity: processIssue ? "medium" : "none" }, gradingCanonicalStatus: grading.status, gradingStatus: grading.legacyGradingStatus, gradingResult: grading, errorTypes: needsDeepDiagnosis ? [attempt?.reason || question.reason || grading.reason] : [], deductionReason: needsDeepDiagnosis ? (attempt?.reason || question.reason || grading.reason) : "正确题仅记录结果", firstErrorStep: needsDeepDiagnosis ? 1 : null, lastCorrectStep: null, errorTag: { knowledgePoint: question.chapterName, subKnowledgePoint: question.point, errorType: needsDeepDiagnosis ? (attempt?.reason || question.reason || grading.reason) : "", errorPosition: needsDeepDiagnosis ? "第1步" : "" }, steps: stepAnalysisFor(question, attempt), advice: attempt?.advice || "" };
    });
    const totalScore = questionAnalyses.reduce((sum, item) => sum + item.score, 0);
    const totalMax = Math.max(1, questionAnalyses.reduce((sum, item) => sum + item.maxScore, 0));
    const correctCount = questionAnalyses.filter((item) => item.gradingCanonicalStatus === "CORRECT").length;
    const unansweredCount = questionAnalyses.filter((item) => item.gradingCanonicalStatus === "EMPTY").length;
    const recognitionFailedCount = questionAnalyses.filter((item) => ["RECOGNITION_FAILED", "NEEDS_MANUAL_REVIEW"].includes(item.gradingCanonicalStatus)).length;
    const byType = {}, byChapter = {}, byKnowledge = {}, errorStats = {};
    const addBucket = (map, name, item) => { map[name] = map[name] || { score: 0, maxScore: 0, total: 0, correct: 0 }; map[name].score += item.score; map[name].maxScore += item.maxScore; map[name].total += 1; if (item.finalAnswerCorrect) map[name].correct += 1; };
    questionAnalyses.forEach((item) => {
      addBucket(byType, item.typeLabel, item);
      addBucket(byChapter, item.chapterName, item);
      addBucket(byKnowledge, item.knowledgePoints[0], item);
      if (item.needsDeepDiagnosis) {
        const type = item.errorTypes[0] || "待识别";
        errorStats[type] = errorStats[type] || { count: 0, questionIndexes: [], questionIds: [], scoreLoss: 0, severity: "低", repeated: false };
        errorStats[type].count += 1; errorStats[type].questionIndexes.push(item.orderIndex + 1); errorStats[type].questionIds.push(item.questionId); errorStats[type].scoreLoss += item.maxScore - item.score;
      }
    });
    Object.values(byKnowledge).forEach((item) => { item.mastery = item.maxScore ? Math.round(item.score / item.maxScore * 100) : 0; item.status = item.mastery >= 85 ? "已掌握" : item.mastery >= 70 ? "基本掌握" : item.mastery >= 50 ? "掌握不稳定" : item.mastery > 0 ? "薄弱知识点" : "完全未掌握"; });
    Object.values(errorStats).forEach((item) => { item.severity = item.scoreLoss >= 20 || item.count >= 4 ? "高" : item.scoreLoss >= 10 || item.count >= 2 ? "中" : "低"; item.repeated = item.count >= 2; });
    const weak = Object.entries(byKnowledge).filter(([, item]) => item.mastery < 70).map(([name]) => name);
    return { summary: { examinationId: submission.examinationId, paperName: submission.paperName, submittedAt: submission.submittedAt, totalScore, totalMax, scoreRate: Math.round(totalScore / totalMax * 100), correctCount, wrongCount: questionAnalyses.filter((item) => ["INCORRECT", "PARTIAL"].includes(item.gradingCanonicalStatus)).length, recognitionFailedCount, unansweredCount, objectiveScore: questionAnalyses.filter((item) => item.type !== "subjective").reduce((sum, item) => sum + item.score, 0), subjectiveScore: questionAnalyses.filter((item) => item.type === "subjective").reduce((sum, item) => sum + item.score, 0), durationMs: submission.durationMs, timeout: false, level: "静态演示诊断", estimatedExamLevel: "演示环境不冒充真实考试预测", comment: weak.length ? `静态演示显示薄弱点集中在 ${weak.slice(0, 3).join("、")}。` : "本卷表现稳定。" }, byType, byChapter, byKnowledge, errorStats, abilityDiagnosis: ["基础计算能力", "公式应用能力", "审题能力", "建模能力", "推理能力", "综合分析能力"].map((name, index) => ({ name, score: Math.max(35, 82 - index * 7), level: "演示评估", evidence: "来自本卷客观题判分与主观题保存状态", questionIds: [], advice: "接入服务端后可基于真实步骤识别更新。" })), questionAnalyses, historyCompare: [], topProblems: Object.entries(errorStats).slice(0, 3).map(([type, item]) => ({ type, ...item })), priorityKnowledge: weak.slice(0, 5), recommendedTasks: weak.slice(0, 4).map((point, index) => ({ id: `task_${index}`, stage: ["复习", "基础巩固题", "同类变式题", "综合应用题"][index] || "复测", knowledgePoint: point, errorType: Object.keys(errorStats)[0] || "待识别", title: `${point}专项补强`, target: "完成复习、训练和复测", status: "pending" })), loop: { current: "诊断完成", stages: ["检测", "诊断", "复习", "训练", "复测", "提升"], nextAction: weak[0] ? `${weak[0]}专项补强` : "综合提升训练" } };
  };

  const createStaticTrainingBatch = (store, studentId, body = {}) => {
    const latest = (store.submissions || []).filter((item) => item.studentId === studentId).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))[0];
    if (!latest) throw new Error("没有整卷报告，无法生成训练");
    const analyses = latest.report?.questionAnalyses || [];
    const eligible = analyses.filter((item) => item.needsDeepDiagnosis || item.finalAnswerCorrect === false || item.answerCorrectButProcessIssue);
    const usedSourceIds = new Set((store.trainingBatches || [])
      .filter((item) => item.studentId === studentId && item.trainingType === "targeted")
      .map((item) => item.sourceWrongQuestionId)
      .filter(Boolean));
    const wrong = analyses.find((item) => item.questionId === body.sourceWrongQuestionId)
      || eligible.find((item) => !usedSourceIds.has(item.questionId))
      || eligible[0]
      || analyses[0]
      || {};
    const trainingType = body.trainingType === "comprehensive" ? "comprehensive" : "targeted";
    const total = trainingType === "comprehensive" ? 20 : 10;
    const purpose = trainingType === "targeted"
      ? ["基础概念题", "基础概念题", "关键步骤题", "关键步骤题", "同类题", "同类题", "变式题", "变式题", "易错题", "综合检验题"]
      : ["当前最严重错误专项", "当前最严重错误专项", "当前最严重错误专项", "当前最严重错误专项", "当前最严重错误专项", "当前最严重错误专项", "当前最严重错误专项", "当前最严重错误专项", "当前最严重错误专项", "当前最严重错误专项", "其他薄弱知识点", "其他薄弱知识点", "其他薄弱知识点", "其他薄弱知识点", "历史重复错误", "历史重复错误", "历史重复错误", "防遗忘巩固题", "防遗忘巩固题", "提升题"];
    const sourceBase = questions.find((item) => item.id === wrong.questionId) || {};
    const sourceQuestion = {
      id: wrong.questionId || "",
      stem: wrong.title || "",
      answer: wrong.standardAnswer || "",
      stepsText: wrong.studentSteps || "",
      chapterId: wrong.chapterId || sourceBase.chapterId || "integral",
      point: wrong.knowledgePoints?.[0] || sourceBase.point || "",
      type: wrong.type || sourceBase.type || ""
    };
    const sourceTag = {
      questionId: wrong.questionId || "",
      errorType: wrong.errorTypes?.[0] || "方法选择错误",
      sourceWrongStep: wrong.firstErrorStep || 1,
      errorCategory: wrong.errorTag?.errorCategory || "方法与计算错误",
      subKnowledgePoint: wrong.knowledgePoints?.[0] || ""
    };
    const questionsForTraining = Array.from({ length: total }, (_, index) => ({
      id: `trainq_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`,
      index: index + 1,
      ...window.TrainingFactory.createTrainingQuestion({ sourceQuestion, sourceTag, index: trainingType === "targeted" ? index % 10 : index, variant: index + 1, trainingType, purpose: purpose[index] })
    }));
    questionsForTraining.forEach((question) => { question.questionId = question.id; });
    questionsForTraining.forEach((question) => {
      const validation = window.TrainingFactory.validateTrainingQuestion(question);
      if (!validation.valid) throw new Error(`第${question.index}题校验失败：${validation.reasons.join("、")}`);
    });
    const batch = {
      id: `batch_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      trainingBatchId: "",
      studentId,
      submissionId: latest.id,
      trainingType,
      sourceWrongQuestionId: sourceTag.questionId,
      sourceQuestionTitle: sourceQuestion.stem,
      sourceKnowledgePoint: sourceTag.subKnowledgePoint || sourceQuestion.point,
      sourceErrorEvidence: wrong.firstErrorStep ? `第${wrong.firstErrorStep}步：${wrong.deductionReason || sourceTag.errorType}` : sourceTag.errorType,
      sourceErrorType: questionsForTraining[0].sourceErrorType || sourceTag.errorType,
      sourceWrongStep: sourceTag.sourceWrongStep,
      knowledgePoint: wrong.chapterName || "考研数学",
      subKnowledgePoint: sourceTag.subKnowledgePoint,
      errorCategory: sourceTag.errorCategory,
      trainingTheme: trainingType === "targeted" ? `${sourceTag.subKnowledgePoint} · ${questionsForTraining[0].sourceErrorType}` : "20题综合训练",
      composition: trainingType === "comprehensive" ? { mainErrorType: 10, otherWeakKnowledge: 4, repeatedHistory: 3, antiForgetting: 2, stretch: 1 } : { conceptDiscrimination: 2, basicSteps: 2, sameType: 2, variants: 2, trap: 1, synthesis: 1 },
      questionCount: total,
      total,
      estimatedMinutes: Math.ceil(questionsForTraining.reduce((sum, item) => sum + item.estimatedSeconds, 0) / 60),
      questions: questionsForTraining,
      progress: { answered: 0, correct: 0, accuracy: 0, hintsUsed: 0, repeatedOriginalError: false, masteryBefore: 35, masteryAfter: null },
      status: "waiting_answer",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    batch.trainingBatchId = batch.id;
    store.trainingBatches = store.trainingBatches || [];
    store.trainingBatches.push(batch);
    return batch;
  };

  function studentFrom(body) {
    const store = readStore();
    let student = store.students[0];
    if (!student) {
      student = {
        id: `demo_${sessionId}`,
        inviteCode: "demo",
        name: body.name || "王同学",
        mathType: body.mathType || "数学一",
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
    const graded = attempts.map((attempt) => ({ attempt, grading: scoreForAttempt(questions.find((q) => q.id === attempt.questionId) || {}, attempt).grading }));
    const gradable = graded.filter(({ grading }) => !["EMPTY", "RECOGNITION_FAILED", "NEEDS_MANUAL_REVIEW"].includes(grading.status));
    const correct = gradable.filter(({ grading }) => grading.status === "CORRECT").length;
    const weakMap = {};
    graded.filter(({ grading }) => grading.diagnosisTriggered).forEach(({ attempt: a, grading }) => {
      const reason = a.reason || grading.reason;
      weakMap[reason] = (weakMap[reason] || 0) + 1;
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
    const lastWrong = attempts.findLast((a) => scoreForAttempt(questions.find((q) => q.id === a.questionId) || {}, a).grading.diagnosisTriggered) || attempts[attempts.length - 1];
    const baseQuestion = questions.find((item) => item.id === lastWrong?.questionId) || questions[5];
    const lastGrading = scoreForAttempt(baseQuestion, lastWrong).grading;
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
          typeLabel: typeLabelFor(lastGrading.questionType),
          score: lastGrading.score,
          maxScore: 5,
          title: baseQuestion.stem,
          studentAnswer: lastWrong?.answer || lastWrong?.selectedOption || "草稿已保存",
          standardAnswer: baseQuestion.answer,
          finalAnswerCorrect: lastGrading.isCorrect === true,
          gradingCanonicalStatus: lastGrading.status,
          gradingResult: lastGrading,
          errorTypes: lastGrading.diagnosisTriggered ? [errorType] : [],
          knowledgePoints: [weakPoint],
          steps: [
            { stepNumber: 1, status: "partial", judgment: "思路部分正确", score: 1, maxScore: 2, studentContent: "能识别题型，但关键条件使用不完整", normalizedExpression: "题型识别完成", errorDescription: errorType, correction: `回到 ${weakPoint} 的适用条件`, relatedKnowledgePoint: weakPoint },
            { stepNumber: 2, status: lastGrading.status === "CORRECT" ? "correct" : "wrong", judgment: lastGrading.status === "CORRECT" ? "结果正确" : "关键步骤偏差", score: lastGrading.status === "CORRECT" ? 3 : 1, maxScore: 3, studentContent: lastWrong?.answer || "草稿步骤", normalizedExpression: baseQuestion.answer, errorDescription: lastGrading.status === "CORRECT" ? "无" : "计算或方法选择出现偏差", correction: "先完成知识点复习后再进入变式训练", relatedKnowledgePoint: weakPoint }
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
      writeStore({ students: store.students, attempts: [], submissions: [] });
      return json({ ok: true, student: store.students[0] || studentFrom({}) });
    }
    if (method === "GET" && path === "/api/questions") {
      const student = store.students[0] || studentFrom({});
      const chapterId = url.searchParams.get("chapterId") || "integral";
      const count = 20;
      const difficulty = url.searchParams.get("difficulty") || "all";
      const sourceType = url.searchParams.get("sourceType") || "all";
      const mode = url.searchParams.get("mode") || "reinforce";
      let pool = questions.filter((item) => item.subjects.includes(student.mathType) && (chapterId === "all" || item.chapterId === chapterId));
      if (sourceType !== "all") pool = pool.filter((item) => item.sourceType === sourceType);
      if (!["all", "mode"].includes(difficulty)) pool = pool.filter((item) => String(item.difficulty) === String(difficulty));
      if (!pool.length && chapterId === "all") pool = questions.filter((item) => item.subjects.includes(student.mathType));
      const modeDifficulty = { foundation: ["1", "2"], reinforce: ["3", "4"], mock: ["1", "2", "3", "4", "5"] }[mode] || ["3", "4"];
      const modePool = ["all", "mode"].includes(difficulty) ? pool.filter((item) => modeDifficulty.includes(String(item.difficulty))) : pool;
      const candidates = modePool.length >= count ? modePool : pool;
      const attemptedIds = new Set((store.attempts || []).filter((item) => item.studentId === student.id).map((item) => item.questionId));
      const unseen = candidates.filter((item) => !attemptedIds.has(item.id));
      const source = unseen.length >= count ? unseen : candidates;
      if (!source.length) return json({ questions: [], chapterId, count, difficulty, sourceType, mode, message: "当前章节暂无可用题目。" });
      const refresh = url.searchParams.get("refresh") === "1";
      const roundKey = `demoQuestionRound:${sessionId}:${chapterId}:${mode}:${difficulty}:${sourceType}`;
      const previousRound = new Set(JSON.parse(localStorage.getItem(roundKey) || "[]"));
      const refreshPool = refresh && source.filter((item) => !previousRound.has(item.id)).length >= count
        ? source.filter((item) => !previousRound.has(item.id))
        : source;
      const refreshSeed = refresh ? `${Date.now()}_${Math.random()}` : `${sessionId}_${chapterId}_${mode}_${difficulty}`;
      const hash = (value) => {
        let result = 2166136261;
        for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
        return result >>> 0;
      };
      const selected = refreshPool
        .map((item) => ({ item, rank: hash(`${refreshSeed}:${item.id}`) }))
        .sort((left, right) => left.rank - right.rank)
        .slice(0, Math.min(count, source.length))
        .map(({ item }) => item);
      localStorage.setItem(roundKey, JSON.stringify(selected.map((item) => item.id)));
      return json({ questions: selected, chapterId, count, difficulty, sourceType, mode, availableCount: source.length });
    }
    if (method === "POST" && path === "/api/attempts") {
      const question = questions.find((item) => item.id === body.questionId);
      if (!question) return json({ error: "题目不存在" }, 404);
      const finalAnswer = body.answer || body.selectedOption || body.formulaText || (question.type === "fill" ? extractFillAnswerFromWorkSpace(body.stepsText) : "");
      const grading = gradeQuestion(question, { ...body, answer: finalAnswer });
      const correct = grading.isCorrect;
      const diagnosis = diagnose(question, correct, body);
      const attempt = {
        id: `att_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        studentId: body.studentId,
        questionId: question.id,
        chapterId: question.chapterId,
        answer: finalAnswer,
        selectedOption: body.selectedOption || "",
        formulaText: body.formulaText || "",
        stepsText: body.stepsText || "",
        flagged: Boolean(body.flagged),
        favorite: Boolean(body.favorite),
        strokeCount: Number(body.strokeCount || 0),
        scratchImageStored: Boolean(body.scratchImage),
        answerImageStored: Boolean(body.answerImage),
        durationMs: Number(body.durationMs || 0),
        gradingStatus: grading.legacyGradingStatus,
        correct,
        score: grading.score,
        maxScore: grading.maxScore,
        gradingResult: grading,
        gradingTrace: { ...grading, diagnosisTriggered: Boolean(grading.diagnosisTriggered) },
        reason: diagnosis.reason,
        advice: diagnosis.advice,
        evidence: [question.explanation],
        createdAt: nowIso()
      };
      store.attempts.push(attempt);
      writeStore(store);
      return json({ attempt, question });
    }
    if (method === "POST" && path === "/api/submissions") {
      const student = store.students.find((s) => s.id === body.studentId) || studentFrom({});
      const questionIds = Array.isArray(body.questionIds) ? body.questionIds : [];
      const responses = Array.isArray(body.responses) ? body.responses : [];
      const submission = {
        id: `sub_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        submissionId: "",
        examinationId: body.examinationId || `static_${Date.now()}`,
        studentId: student.id,
        paperName: body.paperName || `${student.mathType} 静态演示整卷`,
        mode: body.mode || "",
        chapterId: body.chapterId || "",
        status: "diagnosis_complete",
        gradingStatusHistory: [
          { status: "submit_confirmed", at: nowIso() },
          { status: "uploading", at: nowIso() },
          { status: "recognizing", at: nowIso() },
          { status: "objective_grading_done", at: nowIso() },
          { status: "subjective_analysis_done", at: nowIso() },
          { status: "diagnosis_complete", at: nowIso() }
        ],
        questionIds,
        attemptIds: [],
        responsesLocked: responses.map((item, index) => ({ questionId: item.questionId, answer: item.answer || "", selectedOption: item.selectedOption || "", formulaText: item.formulaText || "", stepsText: item.stepsText || "", hasScratchImage: Boolean(item.scratchImage), hasAnswerImage: Boolean(item.answerImage), strokeCount: Number(item.strokeCount || 0), durationMs: Number(item.durationMs || 0), answerOrder: index, abandoned: !hasResponseContent(item) })),
        completenessIssues: [],
        durationMs: Number(body.durationMs || 0),
        answerOrder: Array.isArray(body.answerOrder) ? body.answerOrder : questionIds,
        revisionCount: Number(body.revisionCount || 0),
        submittedAt: nowIso(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        report: null
      };
      questionIds.forEach((qid, index) => {
        const question = questions.find((item) => item.id === qid);
        if (!question) return;
        const payload = responses.find((item) => item.questionId === qid) || { questionId: qid };
        const finalAnswer = payload.answer || payload.selectedOption || payload.formulaText || (question.type === "fill" ? extractFillAnswerFromWorkSpace(payload.stepsText) : "");
        const grading = gradeQuestion(question, { ...payload, answer: finalAnswer });
        const correct = grading.isCorrect;
        const diagnosis = diagnose(question, correct, payload);
        if (!hasResponseContent(payload)) submission.completenessIssues.push({ questionId: qid, type: "unanswered", severity: "warn", message: `第${index + 1}题未作答` });
        if (["RECOGNITION_FAILED", "NEEDS_MANUAL_REVIEW"].includes(grading.status)) submission.completenessIssues.push({ questionId: qid, type: "pending_ocr", severity: "warn", message: `第${index + 1}题识别不完整，请重新上传或手动确认` });
        const attempt = {
          id: `att_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`,
          studentId: student.id,
          submissionId: submission.id,
          questionId: question.id,
          orderIndex: index,
          chapterId: question.chapterId,
          answer: finalAnswer,
          selectedOption: payload.selectedOption || "",
          formulaText: payload.formulaText || "",
          stepsText: payload.stepsText || "",
          strokeCount: Number(payload.strokeCount || 0),
          scratchImageStored: Boolean(payload.scratchImage),
          answerImageStored: Boolean(payload.answerImage),
          durationMs: Number(payload.durationMs || 0),
          gradingStatus: grading.legacyGradingStatus,
          correct,
          score: grading.score,
          maxScore: grading.maxScore,
          gradingResult: grading,
          gradingTrace: { ...grading, diagnosisTriggered: Boolean(grading.diagnosisTriggered) },
          reason: diagnosis.reason,
          advice: diagnosis.advice,
          evidence: [question.explanation],
          abandoned: !hasResponseContent(payload),
          createdAt: nowIso()
        };
        store.attempts.push(attempt);
        submission.attemptIds.push(attempt.id);
      });
      submission.report = buildSubmissionReport(submission, store);
      store.submissions = store.submissions || [];
      store.submissions.push(submission);
      writeStore(store);
      return json({ submission, report: submission.report });
    }
    if (method === "GET" && path === "/api/submissions") {
      const studentId = url.searchParams.get("studentId");
      const list = (store.submissions || []).filter((item) => !studentId || item.studentId === studentId).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
      return json({ submissions: list, latest: list[0] || null });
    }
    if (method === "GET" && path.startsWith("/api/submissions/")) {
      const submissionId = path.split("/").pop();
      const submission = (store.submissions || []).find((item) => item.id === submissionId || item.submissionId === submissionId);
      return submission ? json({ submission, report: submission.report }) : json({ error: "整卷提交不存在" }, 404);
    }
    if (method === "POST" && path === "/api/training-batches") {
      try {
        const batch = createStaticTrainingBatch(store, body.studentId, body);
        writeStore(store);
        return json({ batch });
      } catch (error) {
        return json({ error: error.message || "训练批次生成失败" }, 400);
      }
    }
    if (method === "GET" && path === "/api/training-batches") {
      const studentId = url.searchParams.get("studentId");
      const type = url.searchParams.get("trainingType");
      const list = (store.trainingBatches || []).filter((item) => {
        const total = Number(item.total || item.questionCount || 0);
        return total > 0 && Array.isArray(item.questions) && item.questions.length === total
          && item.questions.every((question) => window.TrainingFactory.validateTrainingQuestion(question).valid)
          && (!studentId || item.studentId === studentId)
          && (!type || item.trainingType === type);
      }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return json({ batches: list, latest: list[0] || null });
    }
    if (method === "POST" && path === "/api/training-records") {
      const batch = (store.trainingBatches || []).find((item) => item.id === body.trainingBatchId);
      if (!batch) return json({ error: "训练批次不存在" }, 404);
      const question = batch.questions.find((item) => item.id === body.trainingQuestionId);
      if (!question) return json({ error: "训练题不存在" }, 404);
      const grading = gradeQuestion(question, { ...body, answer: body.answer || body.selectedOption || body.formulaText || "" });
      const correct = grading.isCorrect;
      const record = { id: `tr_${Date.now()}_${Math.random().toString(16).slice(2)}`, studentId: batch.studentId, trainingBatchId: batch.id, trainingQuestionId: question.id, answer: body.answer || "", selectedOption: body.selectedOption || "", stepsText: body.stepsText || "", strokeCount: Number(body.strokeCount || 0), hintLevelUsed: Number(body.hintLevelUsed || 0), correct, score: correct === true ? 100 : grading.score, gradingStatus: grading.legacyGradingStatus, gradingResult: grading, gradingTrace: { ...grading, diagnosisTriggered: Boolean(grading.diagnosisTriggered) }, repeatedOriginalError: correct === false && String(body.stepsText || body.answer || "").includes(batch.sourceErrorType), createdAt: nowIso() };
      store.trainingRecords = store.trainingRecords || [];
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
      writeStore(store);
      return json({ record, batch, warning: record.repeatedOriginalError ? `你在本题中再次出现了与原错题相同的错误：${batch.sourceErrorType}。建议暂停继续刷题，重新复习对应知识点。` : "" });
    }
    if (method === "POST" && path === "/api/retests") {
      const batch = (store.trainingBatches || []).find((item) => item.id === body.trainingBatchId);
      if (!batch) return json({ error: "训练批次不存在" }, 404);
      const retest = { id: `retest_${Date.now()}`, studentId: batch.studentId, trainingBatchId: batch.id, sourceWrongQuestionId: batch.sourceWrongQuestionId, sourceErrorType: batch.sourceErrorType, questions: Array.from({ length: 5 }, (_, index) => ({ id: `retestq_${index}`, sourceWrongQuestionId: batch.sourceWrongQuestionId, sourceErrorType: batch.sourceErrorType, knowledgePoint: batch.knowledgePoint, subKnowledgePoint: batch.subKnowledgePoint, questionType: index === 4 ? "original_retry" : "subjective", stem: `${index === 4 ? "原错题重新作答" : "复测题"}：围绕 ${batch.subKnowledgePoint} 独立完成。`, answer: "按步骤完整作答", detailedSolution: {} })), status: "waiting_answer", result: null, createdAt: nowIso() };
      store.retestRecords = store.retestRecords || [];
      store.retestRecords.push(retest);
      writeStore(store);
      return json({ retest });
    }
    if (method === "POST" && path === "/api/retests/submit") {
      const retest = (store.retestRecords || []).find((item) => item.id === body.retestId);
      if (!retest) return json({ error: "复测不存在" }, 404);
      const answers = Array.isArray(body.answers) ? body.answers : [];
      const correct = answers.filter((item) => item.answer || item.stepsText).length;
      const accuracy = Math.round(correct / Math.max(1, retest.questions.length) * 100);
      retest.result = { accuracy, hintsUsed: 0, repeatedOriginalError: false, mastery: accuracy >= 80 ? "已掌握" : accuracy >= 60 ? "基本掌握" : "尚未掌握", originalQuestionRetryResult: answers.at(-1) || null };
      retest.status = "completed";
      writeStore(store);
      return json({ retest });
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
