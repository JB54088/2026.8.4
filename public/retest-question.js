(function attachRetestQuestion(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.RetestQuestion = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function createRetestQuestion() {
  function canonicalRetryType(question = {}) {
    const raw = String(question.questionType || question.type || "").toLowerCase();
    const optionCount = Array.isArray(question.options)
      ? question.options.length
      : question.options && typeof question.options === "object"
        ? Object.keys(question.options).length
        : 0;
    if (raw.includes("multiple") || raw.includes("multi_choice") || raw.includes("choice") || raw.includes("选择") || optionCount > 0) return "choice";
    if (raw.includes("fill") || raw.includes("blank") || raw.includes("numeric") || raw.includes("填空") || raw.includes("数值")) return "handwriting";
    return "handwriting";
  }

  function answerModeForQuestion(question = {}) {
    return canonicalRetryType(question) === "choice" ? "choice" : "handwriting";
  }

  function createOriginalRetryQuestion(question = {}) {
    const source = { ...question };
    const originalQuestionId = source.originalQuestionId || source.questionId || source.id || "";
    const answerMode = source.answerMode || answerModeForQuestion(source);
    return {
      ...source,
      id: source.id || originalQuestionId,
      originalQuestionId,
      isOriginalRetry: true,
      answerMode,
      questionType: source.questionType || source.type || (answerMode === "choice" ? "choice" : "subjective"),
      type: source.type || source.questionType || (answerMode === "choice" ? "choice" : "subjective"),
      stem: source.stem || source.title || "",
      options: Array.isArray(source.options) || (source.options && typeof source.options === "object") ? source.options : [],
      answer: source.answer ?? source.correctAnswer ?? "",
      aliases: Array.isArray(source.aliases) ? source.aliases : [],
      detailedSolution: source.detailedSolution || {},
      hintPolicy: "retest_no_hint"
    };
  }

  return { canonicalRetryType, answerModeForQuestion, createOriginalRetryQuestion };
});
