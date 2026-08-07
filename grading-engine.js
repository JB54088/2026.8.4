(function attachGradingEngine(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./choice-grading.js"));
  } else {
    root.GradingEngine = factory(root.ChoiceGrading);
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function createGradingEngine(choiceGrading) {
  const choice = choiceGrading || {};
  const resolveChoiceAnswer = choice.resolveChoiceAnswer || (() => null);
  const gradeChoiceAnswer = choice.gradeChoiceAnswer || (() => false);
  const normalizeChoiceValue = choice.normalizeChoiceValue || ((value) => String(value ?? "").trim().toLowerCase());

  function normalizeAnswer(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/\r\n/g, "\n")
      .replace(/\s+/g, "")
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
    const left = normalizeAnswer(expected);
    const right = normalizeAnswer(actual);
    if (!left || !right) return false;
    if (left === right) return true;
    const leftNum = numericValue(left);
    const rightNum = numericValue(right);
    return leftNum !== null && rightNum !== null && Math.abs(leftNum - rightNum) < 1e-8;
  }

  function canonicalQuestionType(question = {}) {
    const raw = String(question.questionType || question.type || "").toLowerCase();
    const optionCount = Array.isArray(question.options) ? question.options.length : question.options && typeof question.options === "object" ? Object.keys(question.options).length : 0;
    if (raw.includes("multiple") || raw.includes("multi_choice") || raw.includes("多选")) return "multiple_choice";
    if (raw.includes("true") || raw.includes("判断")) return "true_false";
    if (raw.includes("choice") || raw.includes("选择") || optionCount > 0) return "single_choice";
    if (raw.includes("numeric") || raw.includes("数值")) return "numeric";
    if (raw.includes("fill") || raw.includes("blank") || raw.includes("填空")) return "fill_blank";
    if (raw.includes("subjective") || raw.includes("essay") || raw.includes("solution") || raw.includes("process") || raw.includes("original_retry") || raw.includes("retest") || raw.includes("简答") || raw.includes("主观") || raw.includes("计算") || raw.includes("方法") || raw.includes("知识") || raw.includes("能力") || raw.includes("易错")) return "subjective";
    return "fill_blank";
  }

  function hasStudentInput(submission = {}) {
    return [submission.answer, submission.selectedOption, submission.selectedOptions, submission.formulaText, submission.recognizedAnswer, submission.stepsText]
      .some((value) => Array.isArray(value) ? value.length > 0 : String(value ?? "").trim())
      || Boolean(submission.scratchImage || submission.answerImage)
      || Number(submission.strokeCount || 0) > 0
      || (Array.isArray(submission.strokes) && submission.strokes.length > 0);
  }

  function recognitionInfo(type, submission = {}, recognition = {}) {
    if (type === "single_choice" || type === "multiple_choice" || type === "true_false") {
      return { status: hasStudentInput(submission) ? "NOT_REQUIRED" : "EMPTY", confidence: 100, rawOutput: null };
    }
    const source = recognition || {};
    const recognized = source.recognizedAnswer || submission.recognizedAnswer || "";
    const failed = Boolean(source.recognitionError || source.status === "FAILED" || source.recognitionStatus === "RECOGNITION_FAILED");
    if (!hasStudentInput(submission)) return { status: "EMPTY", confidence: 0, rawOutput: source.rawOutput || null };
    if (failed) return { status: "FAILED", confidence: Number(source.confidence || 0), rawOutput: source.rawOutput || source.stepsSummary || null };
    if (recognized || source.modelJudgment || submission.answer || submission.formulaText) {
      return { status: "RECOGNIZED", confidence: Number(source.confidence || 100), rawOutput: source.rawOutput || source.stepsSummary || null };
    }
    return { status: "FAILED", confidence: Number(source.confidence || 0), rawOutput: source.rawOutput || source.stepsSummary || null };
  }

  function scalarStudentAnswer(submission, recognition) {
    return recognition?.recognizedAnswer || submission.recognizedAnswer || submission.answer || submission.formulaText || submission.selectedOption || "";
  }

  function booleanValue(value) {
    const normalized = normalizeAnswer(value);
    if (["true", "t", "1", "正确", "对", "是"].includes(normalized)) return true;
    if (["false", "f", "0", "错误", "错", "否"].includes(normalized)) return false;
    return null;
  }

  function multipleValues(value, options) {
    const values = Array.isArray(value) ? value : String(value ?? "").split(/[,，、\s]+/).filter(Boolean);
    return values.map((item) => resolveChoiceAnswer(item, options)).filter(Boolean).map((item) => item.index).sort((a, b) => a - b);
  }

  function legacyStatus(result) {
    return {
      CORRECT: "graded",
      INCORRECT: "graded",
      PARTIAL: "graded",
      EMPTY: "pending_recognition",
      RECOGNITION_FAILED: "pending_recognition",
      NEEDS_MANUAL_REVIEW: "pending_answer_review"
    }[result.status] || "pending_answer_review";
  }

  function gradeQuestion(question = {}, submission = {}, context = {}) {
    const questionType = canonicalQuestionType(question);
    const maxScore = Number(context.maxScore || question.maxScore || (questionType === "subjective" ? 10 : 5));
    const rawStudentAnswer = [submission.answer, submission.selectedOption, submission.formulaText, submission.recognizedAnswer].find((value) => value !== undefined && value !== null && (Array.isArray(value) ? value.length : String(value).trim() !== "")) ?? "";
    const rawCorrectAnswer = question.answer ?? "";
    const legacyRecord = typeof context.legacyCorrect === "boolean" && !hasStudentInput(submission);
    const recognition = legacyRecord
      ? { status: "LEGACY", confidence: 100, rawOutput: "历史记录兼容迁移" }
      : recognitionInfo(questionType, submission, context.recognition || submission.recognition || {});
    const base = {
      questionId: question.id || context.questionId || "",
      questionType,
      rawStudentAnswer,
      rawCorrectAnswer,
      resolvedStudentAnswer: null,
      resolvedCorrectAnswer: null,
      normalizedStudentAnswer: null,
      normalizedCorrectAnswer: null,
      recognition,
      gradingMethod: "canonical-grading-engine",
      score: 0,
      maxScore,
      isCorrect: null,
      status: "EMPTY",
      reason: ""
    };
    if (legacyRecord) {
      const isCorrect = context.legacyCorrect;
      return { ...base, status: isCorrect ? "CORRECT" : "INCORRECT", isCorrect, score: isCorrect ? maxScore : 0, reason: "沿用历史记录中的判题结果", diagnosisTriggered: !isCorrect, legacyGradingStatus: legacyStatus({ status: isCorrect ? "CORRECT" : "INCORRECT" }) };
    }
    if (recognition.status === "EMPTY") return { ...base, status: "EMPTY", reason: "学生未提交答案或有效书写内容", diagnosisTriggered: false, legacyGradingStatus: legacyStatus({ status: "EMPTY" }) };
    if (recognition.status === "FAILED") return { ...base, status: "RECOGNITION_FAILED", reason: "检测到作答痕迹，但未能可靠识别答案", diagnosisTriggered: false, legacyGradingStatus: legacyStatus({ status: "RECOGNITION_FAILED" }) };

    let isCorrect = null;
    if (questionType === "single_choice") {
      // selectedOption is the authoritative choice when both the UI label and a legacy answer field are sent.
      // The legacy answer is only a fallback; an unrelated stale value must not make a wrong choice pass.
      const selectedOption = String(submission.selectedOption ?? "").trim();
      const candidates = selectedOption ? [selectedOption] : [submission.answer, rawStudentAnswer].filter(Boolean);
      const resolvedStudentAnswer = candidates.map((item) => resolveChoiceAnswer(item, question.options)).find(Boolean) || null;
      const resolvedCorrectAnswer = resolveChoiceAnswer(rawCorrectAnswer, question.options);
      isCorrect = gradeChoiceAnswer(candidates[0] || "", rawCorrectAnswer, question.options, candidates.slice(1));
      base.resolvedStudentAnswer = resolvedStudentAnswer;
      base.resolvedCorrectAnswer = resolvedCorrectAnswer;
      base.normalizedStudentAnswer = resolvedStudentAnswer?.normalizedContent || normalizeChoiceValue(candidates[0] || "");
      base.normalizedCorrectAnswer = resolvedCorrectAnswer?.normalizedContent || normalizeChoiceValue(rawCorrectAnswer);
    } else if (questionType === "multiple_choice") {
      const student = multipleValues(submission.selectedOptions || submission.selectedOption || submission.answer, question.options);
      const correct = multipleValues(rawCorrectAnswer, question.options);
      isCorrect = student.length > 0 && student.length === correct.length && student.every((item, index) => item === correct[index]);
      base.resolvedStudentAnswer = student;
      base.resolvedCorrectAnswer = correct;
      base.normalizedStudentAnswer = student;
      base.normalizedCorrectAnswer = correct;
    } else if (questionType === "true_false") {
      const student = booleanValue(scalarStudentAnswer(submission, context.recognition));
      const correct = booleanValue(rawCorrectAnswer);
      isCorrect = student !== null && correct !== null ? student === correct : null;
      base.resolvedStudentAnswer = student;
      base.resolvedCorrectAnswer = correct;
      base.normalizedStudentAnswer = student;
      base.normalizedCorrectAnswer = correct;
    } else if (questionType === "subjective" && context.recognition?.modelJudgment && typeof context.recognition.isCorrect === "boolean") {
      isCorrect = context.recognition.isCorrect;
      base.resolvedStudentAnswer = context.recognition.recognizedAnswer || scalarStudentAnswer(submission, context.recognition);
      base.resolvedCorrectAnswer = rawCorrectAnswer;
      base.normalizedStudentAnswer = normalizeAnswer(base.resolvedStudentAnswer);
      base.normalizedCorrectAnswer = normalizeAnswer(rawCorrectAnswer);
    } else {
      const student = scalarStudentAnswer(submission, context.recognition);
      isCorrect = equivalentAnswer(rawCorrectAnswer, student);
      base.resolvedStudentAnswer = student;
      base.resolvedCorrectAnswer = rawCorrectAnswer;
      base.normalizedStudentAnswer = normalizeAnswer(student);
      base.normalizedCorrectAnswer = normalizeAnswer(rawCorrectAnswer);
    }

    const processIssue = Boolean(context.recognition?.processHasIssue);
    const status = isCorrect === true && processIssue ? "PARTIAL" : isCorrect === true ? "CORRECT" : isCorrect === false ? "INCORRECT" : "NEEDS_MANUAL_REVIEW";
    const score = status === "CORRECT" ? maxScore : status === "PARTIAL" ? Math.max(1, Math.floor(maxScore * 0.7)) : status === "INCORRECT" && (submission.stepsText || submission.strokeCount || submission.scratchImage) ? Math.max(1, Math.floor(maxScore * 0.35)) : 0;
    return {
      ...base,
      status,
      isCorrect,
      score,
      reason: status === "CORRECT" ? "答案与标准答案一致" : status === "PARTIAL" ? "最终答案正确，但过程存在需要复核的部分" : status === "INCORRECT" ? "答案与标准答案不一致" : "答案无法可靠判定",
      diagnosisTriggered: status === "INCORRECT" || status === "PARTIAL",
      legacyGradingStatus: legacyStatus({ status })
    };
  }

  return { normalizeAnswer, equivalentAnswer, canonicalQuestionType, hasStudentInput, gradeQuestion, legacyStatus };
});
