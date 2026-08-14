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

  const classifyQuestionChapter = window.ChapterClassifier?.classifyQuestionChapter || ((question) => question);
  const questionModel = window.QuestionModel;
  const questionSchemaVersion = questionModel?.QUESTION_SCHEMA_VERSION || 19;
  const originalFetch = window.fetch.bind(window);
  let questions = [];
  let chapters = [];
  let questionBankError = null;

  const buildStaticChapters = (list) => {
    const map = new Map();
    list.filter((question) => staticPracticeReady(question)).forEach((question) => {
      const id = question.sectionId || question.chapterId;
      if (!id) return;
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: question.sectionName || question.chapterName || id,
          subjects: [],
          count: 0,
          countsByMathType: {},
          groupId: question.section?.groupId || question.chapterGroupId || "",
          groupName: question.section?.groupName || question.chapterGroupName || "",
          syllabusOrder: question.section?.order || question.syllabusOrder || 0
        });
      }
      const chapter = map.get(id);
      chapter.count += 1;
      chapter.subjects = Array.from(new Set([...chapter.subjects, ...(question.subjects || [])]));
      (question.subjects || []).forEach((mathType) => {
        chapter.countsByMathType[mathType] = (chapter.countsByMathType[mathType] || 0) + 1;
      });
    });
    const groupOrder = { "": 0, linear: 1, prob: 2 };
    return Array.from(map.values()).sort((left, right) => (
      (groupOrder[left.groupId] ?? 0) - (groupOrder[right.groupId] ?? 0)
      || left.syllabusOrder - right.syllabusOrder
      || left.name.localeCompare(right.name, "zh-CN")
    ));
  };

  const staticPracticeReady = (question) => question.sourceType !== "past_exam"
    || questionModel.isPracticeQuestionReady(question);
  const questionBankPath = location.protocol === "file:"
    ? "question-bank.json"
    : `${window.__APP_BASE_PATH__ || ""}/question-bank.json`.replace(/\/\/+/g, "/");
  const questionBankPromise = originalFetch(questionBankPath)
    .then((response) => {
      if (!response.ok) throw new Error(`静态题库加载失败（${response.status}）`);
      return response.json();
    })
    .then((payload) => {
      const sourceQuestions = Array.isArray(payload) ? payload : payload.questions;
      if (!Array.isArray(sourceQuestions)) throw new Error("静态题库格式无效");
      questions = questionModel.normalizeQuestionList(sourceQuestions.map(classifyQuestionChapter));
      chapters = buildStaticChapters(questions);
      return questions;
    })
    .catch((error) => {
      questionBankError = error;
      return [];
    });

  const key = `staticDemo:${sessionId}`;
  const readStore = () => JSON.parse(localStorage.getItem(key) || '{"students":[],"attempts":[],"submissions":[],"trainingBatches":[],"trainingRecords":[],"retestRecords":[]}');
  const writeStore = (store) => localStorage.setItem(key, JSON.stringify(store));
  const json = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  }));
  const normalizeAnswer = (value) => String(value || "")
    .replace(/\s+/g, "")
    .replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",")
    .replace(/＋/g, "+").replace(/－/g, "-").replace(/×/g, "*").replace(/÷/g, "/")
    .toLowerCase();
  const numericValue = (value) => {
    const raw = normalizeAnswer(value).replace(/^答案[:：]?/, "").replace(/[。；;]$/g, "");
    if (!raw) return null;
    if (/^[+-]?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    const fraction = raw.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
    if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
    return null;
  };
  const equivalentAnswer = (expected, actual) => {
    const left = normalizeAnswer(expected);
    const right = normalizeAnswer(actual);
    if (!left || !right) return false;
    if (left === right) return true;
    const leftNum = numericValue(left);
    const rightNum = numericValue(right);
    if (leftNum !== null && rightNum !== null) return Math.abs(leftNum - rightNum) < 1e-8;
    const compact = (value) => value.replace(/\*/g, "").replace(/\^1(?!\d)/g, "").replace(/\+c$/i, "+c").replace(/c$/i, "c");
    return compact(left) === compact(right);
  };
  const choiceAnswerKey = (question, value) => questionModel?.choiceAnswerKey(question, value) || "";
  const choiceSelection = (question, value) => questionModel?.choiceSelection(question, value) || { key: "", text: "", raw: String(value || "") };
  const canonicalQuestionAnswer = (question, value) => questionModel?.canonicalAnswer(question, value) || String(value || "").trim();
  const choiceAnswerMatches = (question, actual) => {
    const actualKey = choiceAnswerKey(question, actual);
    const expectedKeys = [question.answer, ...(question.aliases || [])]
      .map((item) => choiceAnswerKey(question, item))
      .filter(Boolean);
    return Boolean(actualKey && expectedKeys.includes(actualKey));
  };
  const uniqueByStem = (pool) => {
    const seen = new Set();
    return pool.filter((question) => {
      const key = normalizeAnswer(`${question.chapterId}:${question.stem}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const latestAttemptMap = (attempts) => {
    const latest = new Map();
    (attempts || []).forEach((attempt) => {
      if (attempt?.questionId) latest.set(attempt.questionId, attempt);
    });
    return latest;
  };
  const hashValue = (value) => {
    let result = 2166136261;
    for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
    return result >>> 0;
  };
  const sampleStaticQuestions = (pool, size, seed) => pool
    .map((item) => ({ item, rank: hashValue(`${seed}:${item.id}`) }))
    .sort((left, right) => left.rank - right.rank)
    .slice(0, Math.min(size, pool.length))
    .map(({ item }) => item);
  const buildStaticPracticeSelection = (pool, attempts, practiceType, count, seed, excludeIds = new Set()) => {
    const latest = latestAttemptMap(attempts);
    const newPool = uniqueByStem(pool.filter((question) => !latest.has(question.id)));
    const wrongPool = uniqueByStem(pool.filter((question) => latest.get(question.id)?.correct === false));
    const selected = [];
    const selectedIds = new Set();
    const pick = (sourcePool, size, label) => {
      if (size <= 0) return;
      let candidates = sourcePool.filter((question) => !selectedIds.has(question.id) && !excludeIds.has(question.id));
      if (candidates.length < size) candidates = sourcePool.filter((question) => !selectedIds.has(question.id));
      sampleStaticQuestions(candidates, size, `${seed}:${label}`).forEach((question) => {
        selected.push(question);
        selectedIds.add(question.id);
      });
    };
    if (practiceType === "wrong") {
      pick(wrongPool, count, "wrong");
    } else if (practiceType === "mixed") {
      pick(newPool, Math.ceil(count / 2), "new");
      pick(wrongPool, Math.floor(count / 2), "wrong");
      if (selected.length < count) pick(newPool, count - selected.length, "new-fallback");
      if (selected.length < count) pick(wrongPool, count - selected.length, "wrong-fallback");
    } else {
      pick(newPool, count, "new");
    }
    return {
      questions: selected,
      availableCount: practiceType === "wrong" ? wrongPool.length : practiceType === "mixed" ? new Set([...newPool, ...wrongPool].map((question) => question.id)).size : newPool.length,
      poolCounts: { new: newPool.length, wrong: wrongPool.length }
    };
  };
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
  const scoreAnswer = (question, attempt) => {
    const value = attempt.choice?.key || attempt.answer || attempt.selectedOption || attempt.formulaText || (question.type === "fill" ? extractFillAnswerFromWorkSpace(attempt.stepsText) : "");
    if (!value && question.type !== "choice" && attempt.strokeCount > 0) return null;
    if (question.type === "choice") return Boolean(value && choiceAnswerMatches(question, value));
    return Boolean(value && equivalentAnswer(question.answer, value));
  };
  const responseAnswerFor = (question, payload = {}) => {
    const raw = payload.choice?.key || payload.answer || payload.selectedOption || payload.formulaText || (question.type === "fill" ? extractFillAnswerFromWorkSpace(payload.stepsText) : "");
    return question.type === "choice" ? canonicalQuestionAnswer(question, raw) : raw;
  };
  const diagnose = (question, correct, attempt) => {
    if (correct === true) return { reason: "已掌握", advice: "本题表现稳定，可在做题集中安排间隔复刷。" };
    if (correct === null) return { reason: "待识别", advice: "静态演示版已保存草稿轨迹；接入 OpenAI/OCR 后可识别手写步骤并自动判分。" };
    return { reason: question.reason, advice: `优先复习「${question.point}」，再做 3 道同知识点变式题。` };
  };

  const typeLabelFor = (type) => type === "choice" ? "选择题" : type === "fill" ? "填空题" : "大题";
  const hasResponseContent = (payload = {}) => Boolean(payload.choice?.key || payload.answer || payload.selectedOption || payload.formulaText || payload.stepsText || payload.scratchImage || payload.answerImage || payload.strokeCount);
  const scoreForAttempt = (question, attempt) => {
    const maxScore = question.type === "choice" ? 5 : question.type === "fill" ? 5 : 10;
    if (!attempt || attempt.correct === null) return { score: 0, maxScore };
    if (attempt.correct) return { score: maxScore, maxScore };
    return { score: attempt.stepsText || attempt.scratchImageStored || attempt.strokeCount > 2 ? Math.max(1, Math.floor(maxScore * 0.35)) : 0, maxScore };
  };
  const stepAnalysisFor = (question, attempt) => {
    const scored = scoreForAttempt(question, attempt);
    if (!attempt || attempt.correct === null) return [{ stepNumber: 1, status: "blank", judgment: "静态演示版已保存草稿，等待真实 OCR/AI 识别", score: 0, maxScore: scored.maxScore, studentContent: attempt?.stepsText || "未识别到可判分步骤", normalizedExpression: "pending_ocr", errorDescription: "该题识别不完整，请重新上传或手动确认；其他题目继续批改。", correction: "接入服务端 OpenAI/OCR 后可逐步识别公式、推导过程和第一处错误。", relatedKnowledgePoint: question.point }];
    if (attempt.correct) return [{ stepNumber: 1, status: "correct", judgment: "最终答案正确", score: scored.maxScore, maxScore: scored.maxScore, studentContent: attempt.answer || attempt.selectedOption || attempt.stepsText || "直接作答", normalizedExpression: attempt.answer || attempt.selectedOption || "", errorDescription: "暂未发现明显错误。", correction: question.explanation, relatedKnowledgePoint: question.point }];
    return [{ stepNumber: 1, status: scored.score ? "partial" : "wrong", judgment: scored.score ? "有部分过程，但结果或关键步骤不正确" : "答案错误或缺少有效过程", score: scored.score, maxScore: scored.maxScore, studentContent: attempt.stepsText || attempt.answer || attempt.selectedOption || "未作答", normalizedExpression: attempt.answer || attempt.selectedOption || "", errorDescription: attempt.reason || question.reason, correction: question.explanation, relatedKnowledgePoint: question.point }];
  };
  const buildSubmissionReport = (submission, store) => {
    const qs = submission.questionIds.map((qid) => questions.find((q) => q.id === qid)).filter(Boolean);
    const atts = submission.attemptIds.map((aid) => store.attempts.find((a) => a.id === aid)).filter(Boolean);
    const byId = new Map(atts.map((attempt) => [attempt.questionId, attempt]));
    const questionAnalyses = qs.map((question, index) => {
      const attempt = byId.get(question.id);
      const scored = scoreForAttempt(question, attempt);
      const studentChoice = attempt?.choice?.key
        ? `${attempt.choice.key}${attempt.choice.text ? `. ${attempt.choice.text}` : ""}`
        : "";
      const standardChoice = question.type === "choice" ? choiceSelection(question, question.answer) : null;
      const standardAnswer = question.type === "choice"
        ? (standardChoice?.key ? `${standardChoice.key}${standardChoice.text ? `. ${standardChoice.text}` : ""}` : "待校对")
        : question.answer;
      const processIssue = attempt?.correct === true && question.type === "subjective" && !String(attempt?.stepsText || "").trim();
      return { questionId: question.id, orderIndex: index, type: question.type, typeLabel: typeLabelFor(question.type), chapterName: question.chapterName, knowledgePoints: [question.point], title: question.stem, studentAnswer: attempt?.recognizedAnswer || studentChoice || attempt?.answer || attempt?.selectedOption || "", studentSteps: attempt?.stepsText || "", standardAnswer, standardSteps: question.explanation, score: scored.score, maxScore: scored.maxScore, finalAnswerCorrect: attempt?.correct === true, processCorrect: attempt?.correct === true && !processIssue, answerCorrectButProcessIssue: processIssue, needsDeepDiagnosis: attempt?.correct !== true || processIssue, analysisDepth: attempt?.correct !== true || processIssue ? "deep" : "light", processIssue: { hasIssue: Boolean(processIssue), reason: processIssue ? "结果正确但主观题缺少可复核过程" : "", severity: processIssue ? "medium" : "none" }, gradingStatus: attempt?.gradingStatus || "missing", errorTypes: attempt?.correct && !processIssue ? [] : [processIssue ? "结果正确但过程有问题" : attempt?.reason || question.reason || "待识别"], deductionReason: attempt?.correct && !processIssue ? "正确题仅记录结果" : (processIssue ? "结果正确但过程有问题" : attempt?.reason || question.reason || "待识别"), firstErrorStep: attempt?.correct && !processIssue ? null : 1, lastCorrectStep: null, errorTag: { knowledgePoint: question.chapterName, subKnowledgePoint: question.point, errorType: processIssue ? "结果正确但过程有问题" : attempt?.reason || question.reason || "待识别", errorPosition: "第1步" }, steps: stepAnalysisFor(question, attempt), advice: attempt?.advice || "" };
    });
    const totalScore = questionAnalyses.reduce((sum, item) => sum + item.score, 0);
    const totalMax = Math.max(1, questionAnalyses.reduce((sum, item) => sum + item.maxScore, 0));
    const correctCount = questionAnalyses.filter((item) => item.finalAnswerCorrect).length;
    const unansweredCount = atts.filter((attempt) => attempt.abandoned).length;
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
    return { summary: { examinationId: submission.examinationId, paperName: submission.paperName, submittedAt: submission.submittedAt, totalScore, totalMax, scoreRate: Math.round(totalScore / totalMax * 100), correctCount, wrongCount: questionAnalyses.length - correctCount - unansweredCount, unansweredCount, objectiveScore: questionAnalyses.filter((item) => item.type !== "subjective").reduce((sum, item) => sum + item.score, 0), subjectiveScore: questionAnalyses.filter((item) => item.type === "subjective").reduce((sum, item) => sum + item.score, 0), durationMs: submission.durationMs, timeout: false, level: "静态演示诊断", estimatedExamLevel: "演示环境不冒充真实考试预测", comment: weak.length ? `静态演示显示薄弱点集中在 ${weak.slice(0, 3).join("、")}。` : "本卷表现稳定。" }, byType, byChapter, byKnowledge, errorStats, abilityDiagnosis: ["基础计算能力", "公式应用能力", "审题能力", "建模能力", "推理能力", "综合分析能力"].map((name, index) => ({ name, score: Math.max(35, 82 - index * 7), level: "演示评估", evidence: "来自本卷客观题判分与主观题保存状态", questionIds: [], advice: "接入服务端后可基于真实步骤识别更新。" })), questionAnalyses, historyCompare: [], topProblems: Object.entries(errorStats).slice(0, 3).map(([type, item]) => ({ type, ...item })), priorityKnowledge: weak.slice(0, 5), recommendedTasks: weak.slice(0, 4).map((point, index) => ({ id: `task_${index}`, stage: ["复习", "基础巩固题", "同类变式题", "综合应用题"][index] || "复测", knowledgePoint: point, errorType: Object.keys(errorStats)[0] || "待识别", title: `${point}专项补强`, target: "完成复习、训练和复测", status: "pending" })), loop: { current: "诊断完成", stages: ["检测", "诊断", "复习", "训练", "复测", "提升"], nextAction: weak[0] ? `${weak[0]}专项补强` : "综合提升训练" } };
  };

  const staticTrainingPurpose = (level, trainingType) => (trainingType === "targeted"
    ? { foundation: "基础概念与解题入口", same_type: "同类方法训练", variation: "同知识点变式训练", comprehensive: "综合迁移检验" }
    : { foundation: "薄弱知识点基础补漏", same_type: "同类方法稳定训练", variation: "同知识点变式迁移", comprehensive: "综合应用检验" })[level] || "相似题训练";

  const staticTrainingSeconds = (question) => question.type === "choice" ? 90 : question.type === "fill" ? 120 : 240;

  const createStaticTrainingBatch = (store, studentId, body = {}) => {
    const latest = (store.submissions || []).filter((item) => item.studentId === studentId).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))[0];
    if (!latest) throw new Error("没有整卷报告，无法生成训练");
    const analyses = latest.report?.questionAnalyses || [];
    const eligible = analyses.filter((item) => item.needsDeepDiagnosis || item.finalAnswerCorrect === false || item.answerCorrectButProcessIssue);
    const wrong = analyses.find((item) => item.questionId === body.sourceWrongQuestionId)
      || eligible[0]
      || {};
    if (!wrong.questionId) throw new Error("报告中没有明确的错题或过程问题，无法生成相似题训练");
    const sourceQuestion = questions.find((item) => item.id === wrong.questionId);
    if (!sourceQuestion) throw new Error("错题不在当前题库中，无法生成相似题训练");
    const sourceTag = {
      questionId: wrong.questionId || sourceQuestion.id,
      errorType: wrong.errorTypes?.[0] || sourceQuestion.reason || "方法选择错误",
      sourceWrongStep: wrong.firstErrorStep || 1,
      errorCategory: wrong.errorTag?.errorCategory || "方法与计算错误",
      subKnowledgePoint: wrong.knowledgePoints?.[0] || sourceQuestion.point || ""
    };
    const trainingType = body.trainingType === "comprehensive" ? "comprehensive" : "targeted";
    const requestedCount = trainingType === "comprehensive" ? 20 : 10;
    const targetLevels = trainingType === "comprehensive"
      ? Array.from({ length: requestedCount }, (_, index) => questionModel.trainingLevelSlots(10)[index % 10])
      : questionModel.trainingLevelSlots(requestedCount);
    const student = store.students.find((item) => item.id === studentId) || {};
    const usedIds = new Set((store.attempts || []).filter((item) => item.studentId === studentId).map((item) => item.questionId).filter(Boolean));
    usedIds.add(sourceQuestion.id);
    const selectedEntries = [];
    const matchTiers = {};
    const addSelection = (selection) => {
      selection.selected.forEach((entry) => {
        if (usedIds.has(entry.question.id)) return;
        usedIds.add(entry.question.id);
        selectedEntries.push(entry);
        matchTiers[entry.matchTier] = (matchTiers[entry.matchTier] || 0) + 1;
      });
    };
    if (trainingType === "targeted") {
      addSelection(questionModel.selectSimilarQuestions(questions, sourceQuestion, {
        count: requestedCount,
        targetLevels,
        seed: `${latest.id}:${sourceQuestion.id}:${trainingType}`,
        subject: student.mathType,
        excludeIds: Array.from(usedIds)
      }));
    } else {
      const focuses = [sourceQuestion, ...eligible.map((item) => questions.find((question) => question.id === item.questionId)).filter(Boolean)];
      targetLevels.forEach((targetLevel, index) => {
        const start = index % Math.max(1, focuses.length);
        const ordered = [focuses[start], ...focuses.filter((_, focusIndex) => focusIndex !== start)];
        for (const focus of ordered) {
          const selection = questionModel.selectSimilarQuestions(questions, focus, {
            count: 1,
            targetLevels: [targetLevel],
            seed: `${latest.id}:${sourceQuestion.id}:${trainingType}:${index}:${focus.id}`,
            subject: student.mathType,
            excludeIds: Array.from(usedIds)
          });
          if (selection.selected.length) {
            addSelection(selection);
            break;
          }
        }
      });
    }
    const questionsForTraining = selectedEntries.map((entry, index) => ({
      ...entry.question,
      id: `trainq_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`,
      questionId: "",
      bankQuestionId: entry.question.id,
      index: index + 1,
      trainingPurpose: staticTrainingPurpose(entry.targetLevel, trainingType),
      trainingLevel: entry.targetLevel,
      difficultyLevel: entry.question.difficulty,
      knowledgePoint: entry.question.practiceMeta?.knowledgePointName || entry.question.point,
      subKnowledgePoint: entry.question.practiceMeta?.knowledgePointName || entry.question.point,
      sourceErrorType: sourceTag.errorType,
      sourceWrongStep: sourceTag.sourceWrongStep,
      matchRank: entry.matchRank,
      matchTier: entry.matchTier,
      estimatedSeconds: staticTrainingSeconds(entry.question)
    }));
    questionsForTraining.forEach((question) => { question.questionId = question.id; });
    if (!questionsForTraining.length) throw new Error("当前知识点没有足够的已标注相似题，请先补齐题库标注。");
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
      sourceErrorType: sourceTag.errorType,
      sourceWrongStep: sourceTag.sourceWrongStep,
      knowledgePoint: wrong.chapterName || "考研数学",
      subKnowledgePoint: sourceTag.subKnowledgePoint,
      errorCategory: sourceTag.errorCategory,
      trainingTheme: trainingType === "targeted" ? `${sourceTag.subKnowledgePoint} · ${sourceTag.errorType}` : "20题综合训练",
      composition: trainingType === "comprehensive" ? { requested: requestedCount, selected: questionsForTraining.length, mainErrorType: 10, otherWeakKnowledge: 4, repeatedHistory: 3, antiForgetting: 2, stretch: 1 } : { requested: requestedCount, selected: questionsForTraining.length, conceptDiscrimination: 2, basicSteps: 2, sameType: 2, variants: 2, trap: 1, synthesis: 1 },
      requestedCount,
      questionCount: questionsForTraining.length,
      total: questionsForTraining.length,
      estimatedMinutes: Math.ceil(questionsForTraining.reduce((sum, item) => sum + item.estimatedSeconds, 0) / 60),
      questions: questionsForTraining,
      selection: { source: "annotated_question_bank", requestedCount, availableCount: questionsForTraining.length, shortage: Math.max(0, requestedCount - questionsForTraining.length), matchTiers },
      shortage: Math.max(0, requestedCount - questionsForTraining.length),
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

  const buildStaticRetestFromBatch = (batch) => {
    const sourceQuestion = questions.find((item) => item.id === batch.sourceWrongQuestionId)
      || questions.find((item) => item.id === batch.questions?.find((question) => question.bankQuestionId)?.bankQuestionId);
    if (!sourceQuestion) throw new Error("原错题不在当前题库中，无法生成复测");
    const student = readStore().students.find((item) => item.id === batch.studentId) || {};
    const excluded = [sourceQuestion.id, ...(batch.questions || []).map((question) => question.bankQuestionId).filter(Boolean)];
    const selection = questionModel.selectSimilarQuestions(questions, sourceQuestion, {
      count: 4,
      targetLevels: [3, 3, 4, 4],
      subject: student.mathType,
      seed: `${batch.id}:retest`,
      excludeIds: excluded
    });
    const bankQuestions = [...selection.selected.map((entry) => entry.question), sourceQuestion];
    return bankQuestions.map((question, index) => {
      const retestQuestionId = `retestq_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`;
      const originalRetry = index === bankQuestions.length - 1;
      return {
        ...question,
        id: retestQuestionId,
        questionId: retestQuestionId,
        bankQuestionId: question.id,
        sourceWrongQuestionId: batch.sourceWrongQuestionId,
        sourceErrorType: batch.sourceErrorType,
        knowledgePoint: batch.knowledgePoint,
        subKnowledgePoint: batch.subKnowledgePoint,
        questionType: originalRetry ? "original_retry" : question.type,
        difficultyLevel: question.difficulty,
        retestPurpose: originalRetry ? "原错题重新作答" : "题库相似题复测",
        hintPolicy: "retest_no_hint"
      };
    });
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
    const baseQuestion = questions.find((item) => item.id === lastWrong?.questionId)
      || questions.find((item) => item.sourceType !== "past_exam")
      || questions[0];
    if (!baseQuestion) throw new Error("题库为空，无法生成学习闭环");
    const weakPoint = baseQuestion.point;
    const loopRetestQuestions = questions
      .filter((item) => item.id !== baseQuestion.id && staticPracticeReady(item)
        && item.subjects?.some((subject) => (baseQuestion.subjects || []).includes(subject)))
      .slice(0, 2)
      .map((item) => ({
        ...item,
        typeLabel: item.questionCategoryLabel || item.type,
        target: weakPoint,
        result: "待完成题库复测"
      }));
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
      retest: { score: null, independent: null, hintsUsed: 0, passed: null, questions: loopRetestQuestions },
      improvement: { beforeMastery: 45, afterMastery: 78, improvementValue: 33, status: "明显提升", originalError: errorType, trainingResult: "完成知识点复习、理解检查和相似题训练。", nextRisk: "间隔 2 天后需要复刷，防止遗忘。" },
      comparisonReport: { firstScore: "2/5", retryScore: "4/5", firstDuration: "4 分钟", retryDuration: "3 分钟", firstErrorStep: errorType, firstSteps: "第一次跳过关键判断", retryStepPerformance: "第二次补全关键条件", sameErrorRepeated: false },
      profile: { abilities: [
        { name: "概念理解", previous: 52, current: 72, trend: "上升", evidence: "理解检查通过", suggestion: "继续用口述方式复述概念" },
        { name: "方法选择", previous: 45, current: 68, trend: "上升", evidence: "相似题训练通过", suggestion: "多做条件变化题" },
        { name: "计算稳定性", previous: 60, current: 70, trend: "稳定", evidence: "草稿步骤较完整", suggestion: "加强符号与常数检查" }
      ] }
    };
  }

  window.fetch = async (input, init = {}) => {
    const raw = typeof input === "string" ? input : input.url;
    const url = new URL(raw, location.origin);
    const apiIndex = url.pathname.indexOf("/api/");
    if (apiIndex < 0) return originalFetch(input, init);
    await questionBankPromise;
    if (questionBankError) return json({ error: `静态题库不可用：${questionBankError.message}` }, 500);
    const path = url.pathname.slice(apiIndex);
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    const store = readStore();

    if (method === "GET" && path === "/api/health") return json({ status: "ok", environment: "static-demo", timestamp: nowIso() });
    const staticPastExamSources = {
      trustedSources: [{ site: "演示真题来源", items: [{ year: "2012", mathType: "数学二", title: "2012 全国硕士研究生入学考试数学二试题", format: "image_slices", importStatus: "demo_ready", url: "https://yz.chsi.com.cn/" }] }],
      candidateSourcesNeedReview: [],
      questionBankCount: questions.length,
      structuredPastExamCount: questions.filter((question) => question.sourceType === "past_exam").length,
      importedQuestionCount: questions.filter((question) => question.sourceType === "past_exam" && questionModel.isPracticeQuestionReady(question)).length,
      answerMatchedQuestionCount: questions.filter((question) => question.sourceType === "past_exam" && question.answerMatchKey).length,
      answerExplicitCount: questions.filter((question) => question.sourceType === "past_exam" && question.answerStatus === "matched_from_answer_pdf").length,
      answerPendingCount: questions.filter((question) => question.sourceType === "past_exam" && question.answerMatchKey && question.answerStatus !== "matched_from_answer_pdf").length,
      answerUnmatchedCount: questions.filter((question) => question.sourceType === "past_exam" && !question.answerMatchKey && !String(question.answer || "").trim()).length,
      localSources: [{ sourceId: "classified-1987-2025", site: "本地真题资料库", year: "1987-2025", mathType: "数学一/二/三/四/五（按原始标签）", title: "1987-2025 考研数学真题分类资料", url: "past-exam-preview.html", format: "classified_pages_and_answer_matching", importStatus: "answer_pdf_matching_applied", description: "已结构化导入的历史真题可直接试刷；四份答案解析 PDF 已按来源与例题号匹配，明确答案可自动判分，部分题目保留待复核状态。" }]
    };
    if (method === "GET" && path === "/api/bootstrap") return json({ questionSchemaVersion, chapters, inviteCodes: ["demo"], pastExamSources: staticPastExamSources, aiStatus: { handwritingRecognition: false, model: "static-demo" } });
    if (method === "GET" && path === "/api/past-exam-sources") return json(staticPastExamSources);
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
      writeStore({ students: store.students, attempts: [], submissions: [], trainingBatches: [], trainingRecords: [], retestRecords: [] });
      return json({ ok: true, student: store.students[0] || studentFrom({}) });
    }
    if (method === "GET" && path === "/api/questions") {
      const student = store.students[0] || studentFrom({});
      const count = 20;
      const rawChapterIds = url.searchParams.has("chapterIds")
        ? url.searchParams.get("chapterIds")
        : (url.searchParams.get("chapterId") || "integral");
      const chapterIds = rawChapterIds === "all" ? null : String(rawChapterIds || "").split(",").map((item) => item.trim()).filter(Boolean);
      const chapterSet = chapterIds === null ? null : new Set(chapterIds);
      const difficulty = url.searchParams.get("difficulty") || "all";
      const sourceType = url.searchParams.get("sourceType") || "all";
      const mode = url.searchParams.get("mode") || "reinforce";
      const requestedPracticeType = url.searchParams.get("practiceType") || "new";
      const practiceType = ["new", "wrong", "mixed"].includes(requestedPracticeType) ? requestedPracticeType : "new";
      let pool = questionModel?.queryQuestions
        ? questionModel.queryQuestions(questions, { sectionIds: chapterIds, subjects: [student.mathType] })
        : questions.filter((item) => item.subjects.includes(student.mathType) && (chapterSet === null || chapterSet.has(item.chapterId)));
      pool = pool.filter(staticPracticeReady);
      if (sourceType !== "all") pool = pool.filter((item) => (item.sourceSpec?.type || item.sourceType) === sourceType);
      if (!["all", "mode"].includes(difficulty)) pool = pool.filter((item) => String(item.difficulty) === String(difficulty));
      if (!pool.length && chapterIds === null) pool = questions.filter((item) => item.subjects.includes(student.mathType) && staticPracticeReady(item));
      const modeDifficulty = { foundation: ["1", "2"], reinforce: ["3", "4"], mock: ["1", "2", "3", "4", "5"] }[mode] || ["3", "4"];
      const modePool = ["all", "mode"].includes(difficulty) ? pool.filter((item) => modeDifficulty.includes(String(item.difficulty))) : pool;
      const candidates = modePool.length >= count ? modePool : pool;
      const attempts = (store.attempts || []).filter((item) => item.studentId === student.id);
      const refresh = url.searchParams.get("refresh") === "1";
      const chapterKey = chapterIds === null ? "all" : chapterIds.join(",") || "none";
      const roundKey = `demoQuestionRound:${sessionId}:${chapterKey}:${mode}:${difficulty}:${sourceType}:${practiceType}`;
      const previousRound = new Set(JSON.parse(localStorage.getItem(roundKey) || "[]"));
      const requestedExcludeIds = new Set(String(url.searchParams.get("excludeIds") || "").split(",").filter(Boolean));
      const excludeIds = refresh ? new Set([...previousRound, ...requestedExcludeIds]) : new Set();
      const selection = buildStaticPracticeSelection(
        candidates,
        attempts,
        practiceType,
        count,
        refresh ? `${Date.now()}_${Math.random()}` : `${sessionId}_${chapterKey}_${mode}_${difficulty}_${practiceType}`,
        excludeIds
      );
      localStorage.setItem(roundKey, JSON.stringify(selection.questions.map((item) => item.id)));
      const response = {
        questions: selection.questions,
        questionSchemaVersion,
        bank: { name: "question-bank", sectionIds: chapterIds || [], sourceType },
        chapterId: chapterIds === null ? "all" : chapterIds.length === 1 ? chapterIds[0] : "mixed",
        chapterIds: chapterIds || [],
        count,
        difficulty,
        sourceType,
        mode,
        practiceType,
        availableCount: selection.availableCount,
        poolCounts: selection.poolCounts
      };
      if (!selection.questions.length) {
        response.message = practiceType === "wrong"
          ? "当前筛选下没有明确判错的错题。"
          : practiceType === "mixed"
            ? "当前筛选下没有可用的新题或错题。"
            : "当前筛选下没有未作答的新题。";
      }
      return json(response);
    }
    if (method === "POST" && path === "/api/attempts") {
      const question = questions.find((item) => item.id === body.questionId);
      if (!question) return json({ error: "题目不存在" }, 404);
      const correct = scoreAnswer(question, body);
      const diagnosis = diagnose(question, correct, body);
      const finalAnswer = responseAnswerFor(question, body);
      const choice = question.type === "choice" ? choiceSelection(question, body.choice || body.selectedOption || body.answer || finalAnswer) : null;
      const attempt = {
        id: `att_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        studentId: body.studentId,
        questionId: question.id,
        chapterId: question.chapterId,
        answer: finalAnswer,
        selectedOption: choice?.key || body.selectedOption || "",
        selectedOptionText: choice?.text || "",
        choice,
        formulaText: body.formulaText || "",
        stepsText: body.stepsText || "",
        flagged: Boolean(body.flagged),
        favorite: Boolean(body.favorite),
        strokeCount: Number(body.strokeCount || 0),
        scratchImageStored: Boolean(body.scratchImage),
        answerImageStored: Boolean(body.answerImage),
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
        chapterIds: Array.isArray(body.chapterIds) ? body.chapterIds : (body.chapterId ? [body.chapterId] : []),
        practiceType: ["new", "wrong", "mixed"].includes(body.practiceType) ? body.practiceType : "",
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
        responsesLocked: responses.map((item, index) => {
          const question = questions.find((candidate) => candidate.id === item.questionId);
          const answer = question ? responseAnswerFor(question, item) : (item.answer || item.selectedOption || "");
          const choice = question?.type === "choice" ? choiceSelection(question, item.choice || item.selectedOption || item.answer || answer) : null;
          return { questionId: item.questionId, answer, selectedOption: choice?.key || item.selectedOption || "", selectedOptionText: choice?.text || "", choice, formulaText: item.formulaText || "", stepsText: item.stepsText || "", hasScratchImage: Boolean(item.scratchImage), hasAnswerImage: Boolean(item.answerImage), strokeCount: Number(item.strokeCount || 0), durationMs: Number(item.durationMs || 0), answerOrder: index, abandoned: !hasResponseContent(item) };
        }),
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
        const correct = scoreAnswer(question, payload);
        const diagnosis = diagnose(question, correct, payload);
        const finalAnswer = responseAnswerFor(question, payload);
        const choice = question.type === "choice" ? choiceSelection(question, payload.choice || payload.selectedOption || payload.answer || finalAnswer) : null;
        if (!hasResponseContent(payload)) submission.completenessIssues.push({ questionId: qid, type: "unanswered", severity: "warn", message: `第${index + 1}题未作答` });
        if (question.type !== "choice" && correct === null) submission.completenessIssues.push({ questionId: qid, type: "pending_ocr", severity: "warn", message: `第${index + 1}题主观过程等待真实 OCR/AI 识别` });
        const attempt = {
          id: `att_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`,
          studentId: student.id,
          submissionId: submission.id,
          questionId: question.id,
          orderIndex: index,
          chapterId: question.chapterId,
          answer: finalAnswer,
          selectedOption: choice?.key || payload.selectedOption || "",
          selectedOptionText: choice?.text || "",
          choice,
          formulaText: payload.formulaText || "",
          stepsText: payload.stepsText || "",
          strokeCount: Number(payload.strokeCount || 0),
          scratchImageStored: Boolean(payload.scratchImage),
          answerImageStored: Boolean(payload.answerImage),
          durationMs: Number(payload.durationMs || 0),
          gradingStatus: correct === null ? "pending_recognition" : "graded",
          correct,
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
        return json({ batch: questionModel.publicTrainingBatch(batch) });
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
          && item.questions.every((question) => question.bankQuestionId && questionModel.isPracticeQuestionReady(question))
          && (!studentId || item.studentId === studentId)
          && (!type || item.trainingType === type);
      }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return json({ batches: list.map((item) => questionModel.publicTrainingBatch(item)), latest: list[0] ? questionModel.publicTrainingBatch(list[0]) : null });
    }
    if (method === "GET" && path === "/api/training-records") {
      const studentId = url.searchParams.get("studentId");
      const trainingBatchId = url.searchParams.get("trainingBatchId");
      const records = (store.trainingRecords || [])
        .filter((record) => (!studentId || record.studentId === studentId) && (!trainingBatchId || record.trainingBatchId === trainingBatchId))
        .map((record) => ({ ...record, locked: true }));
      return json({ records });
    }
    if (method === "POST" && path === "/api/training-records") {
      const batch = (store.trainingBatches || []).find((item) => item.id === body.trainingBatchId);
      if (!batch) return json({ error: "训练批次不存在" }, 404);
      const question = batch.questions.find((item) => item.id === body.trainingQuestionId);
      if (!question) return json({ error: "训练题不存在" }, 404);
      if (!questionModel.isPracticeQuestionReady(question)) return json({ error: "训练题未通过题库校验" }, 400);
      const existingRecord = (store.trainingRecords || []).find((item) => item.trainingBatchId === batch.id && item.trainingQuestionId === question.id);
      if (existingRecord) return json({ error: "本题已经提交，不能重复作答", record: { ...existingRecord, locked: true }, batch: questionModel.publicTrainingBatch(batch) }, 409);
      const trainingAnswer = canonicalQuestionAnswer(question, body.answer || body.selectedOption || "");
      const correct = question.questionType === "subjective"
        ? null
          : question.questionType === "choice"
            ? choiceAnswerMatches(question, trainingAnswer)
            : equivalentAnswer(question.answer, trainingAnswer);
      const trainingChoice = question.questionType === "choice" ? choiceSelection(question, body.selectedOption || body.answer || trainingAnswer) : null;
      const record = { id: `tr_${Date.now()}_${Math.random().toString(16).slice(2)}`, studentId: batch.studentId, trainingBatchId: batch.id, trainingQuestionId: question.id, answer: trainingAnswer, selectedOption: trainingChoice?.key || body.selectedOption || "", selectedOptionText: trainingChoice?.text || "", choice: trainingChoice, stepsText: body.stepsText || "", strokeCount: Number(body.strokeCount || 0), hintLevelUsed: Number(body.hintLevelUsed || 0), correct, score: correct === true ? 100 : 0, gradingStatus: correct === null ? "pending_recognition" : "graded", repeatedOriginalError: correct === false && String(body.stepsText || body.answer || "").includes(batch.sourceErrorType), submitted: true, locked: true, reveal: questionModel.trainingReveal(question), createdAt: nowIso() };
      store.trainingRecords = store.trainingRecords || [];
      store.trainingRecords.push(record);
      batch.progress = batch.progress || { answered: 0, correct: 0, accuracy: 0, hintsUsed: 0, repeatedOriginalError: false, masteryBefore: 35, masteryAfter: null };
      const records = store.trainingRecords.filter((item) => item.trainingBatchId === batch.id);
      batch.progress.answered = records.length;
      batch.progress.correct = records.filter((item) => item.correct).length;
      batch.progress.accuracy = records.length ? Math.round(batch.progress.correct / records.length * 100) : 0;
      batch.progress.hintsUsed = records.reduce((sum, item) => sum + Number(item.hintLevelUsed || 0), 0);
      batch.progress.repeatedOriginalError = records.some((item) => item.repeatedOriginalError);
      batch.progress.masteryAfter = Math.min(95, Math.max(batch.progress.masteryBefore, batch.progress.accuracy - batch.progress.hintsUsed * 2));
      batch.status = batch.progress.answered >= batch.questionCount ? "completed" : "in_progress";
      writeStore(store);
      return json({ record, batch: questionModel.publicTrainingBatch(batch), warning: record.repeatedOriginalError ? `你在本题中再次出现了与原错题相同的错误：${batch.sourceErrorType}。建议暂停继续刷题，重新复习对应知识点。` : "" });
    }
    if (method === "POST" && path === "/api/retests") {
      const batch = (store.trainingBatches || []).find((item) => item.id === body.trainingBatchId);
      if (!batch) return json({ error: "训练批次不存在" }, 404);
      let questionsForRetest;
      try {
        questionsForRetest = buildStaticRetestFromBatch(batch);
      } catch (error) {
        return json({ error: error.message || "复测题生成失败" }, 400);
      }
      const retest = { id: `retest_${Date.now()}`, studentId: batch.studentId, trainingBatchId: batch.id, sourceWrongQuestionId: batch.sourceWrongQuestionId, sourceErrorType: batch.sourceErrorType, questions: questionsForRetest, status: "waiting_answer", result: null, createdAt: nowIso() };
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
