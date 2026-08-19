(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.QuestionScope = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const EXAM_MATH_TYPES = ["数学一", "数学二", "数学三"];
  const SHARED_CHAPTERS = {
    limit: EXAM_MATH_TYPES,
    diff: EXAM_MATH_TYPES,
    integral: EXAM_MATH_TYPES,
    ode: EXAM_MATH_TYPES,
    series: EXAM_MATH_TYPES,
    multi: EXAM_MATH_TYPES,
    space: ["数学一", "数学二"]
  };

  function sharedMathTypesForChapter(chapterId = "") {
    const id = String(chapterId || "");
    if (SHARED_CHAPTERS[id]) return SHARED_CHAPTERS[id];
    if (id.startsWith("linear_")) return EXAM_MATH_TYPES;
    if (id.startsWith("prob_")) return ["数学一", "数学三"];
    return [];
  }

  function questionAppliesToMathType(question = {}, mathType = "") {
    const subjects = Array.isArray(question.subjects) ? question.subjects.map(String) : [];
    if (subjects.includes(String(mathType))) return true;
    const sharedTypes = sharedMathTypesForChapter(question.chapterId);
    return sharedTypes.includes(String(mathType)) && subjects.some((subject) => sharedTypes.includes(subject));
  }

  function chapterSubjects(questions = [], chapterId = "") {
    const chapterQuestions = questions.filter((question) => question.chapterId === chapterId);
    const subjects = new Set(chapterQuestions.flatMap((question) => Array.isArray(question.subjects) ? question.subjects : []));
    const sharedTypes = sharedMathTypesForChapter(chapterId);
    if (chapterQuestions.some((question) => (question.subjects || []).some((subject) => sharedTypes.includes(subject)))) {
      sharedTypes.forEach((subject) => subjects.add(subject));
    }
    return Array.from(subjects);
  }

  function countsByMathType(questions = [], chapterId = "") {
    const counts = {};
    questions.filter((question) => question.chapterId === chapterId).forEach((question) => {
      EXAM_MATH_TYPES.forEach((mathType) => {
        if (questionAppliesToMathType(question, mathType)) counts[mathType] = (counts[mathType] || 0) + 1;
      });
    });
    return counts;
  }

  return { EXAM_MATH_TYPES, sharedMathTypesForChapter, questionAppliesToMathType, chapterSubjects, countsByMathType };
});
