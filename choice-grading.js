(function attachChoiceGrading(root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ChoiceGrading = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function createChoiceGrading() {
  function normalizeChoiceValue(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function optionEntries(options) {
    if (Array.isArray(options)) {
      return options.map((option, index) => {
        if (option && typeof option === "object") {
          const pairs = Object.entries(option);
          const label = option.label ?? option.key ?? (pairs.length === 1 ? pairs[0][0] : "");
          const content = option.content ?? option.text ?? option.value ?? option.option ?? option.answer
            ?? (pairs.length === 1 ? pairs[0][1] : "");
          return { index, label: label || String.fromCharCode(65 + index), content };
        }
        return { index, label: String.fromCharCode(65 + index), content: option };
      });
    }
    if (options && typeof options === "object") {
      return Object.entries(options).map(([label, content], index) => ({ index, label, content }));
    }
    return [];
  }

  function resolveChoiceAnswer(answer, options) {
    const value = normalizeChoiceValue(answer);
    if (!value) return null;
    const entries = optionEntries(options);
    const byLabel = entries.find((entry) => normalizeChoiceValue(entry.label) === value);
    if (byLabel) return { ...byLabel, normalizedContent: normalizeChoiceValue(byLabel.content), matchedBy: "label" };
    const byContent = entries.find((entry) => normalizeChoiceValue(entry.content) === value);
    if (byContent) return { ...byContent, normalizedContent: normalizeChoiceValue(byContent.content), matchedBy: "content" };
    const numericIndex = Number(value);
    if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= entries.length) {
      const byIndex = entries[numericIndex - 1];
      return { ...byIndex, normalizedContent: normalizeChoiceValue(byIndex.content), matchedBy: "index" };
    }
    return null;
  }

  function gradeChoiceAnswer(studentAnswer, correctAnswer, options, additionalStudentAnswers = []) {
    const expected = resolveChoiceAnswer(correctAnswer, options);
    const students = [studentAnswer, ...additionalStudentAnswers]
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== "");
    const actual = students
      .map((value) => resolveChoiceAnswer(value, options))
      .find(Boolean);
    if (expected && actual) return expected.index === actual.index;
    return students.some((value) => normalizeChoiceValue(value) === normalizeChoiceValue(correctAnswer));
  }

  return { normalizeChoiceValue, optionEntries, resolveChoiceAnswer, gradeChoiceAnswer };
});
