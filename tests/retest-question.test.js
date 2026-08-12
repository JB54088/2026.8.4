const assert = require("assert");
const { answerModeForQuestion, createOriginalRetryQuestion } = require("../public/retest-question.js");

const choice = createOriginalRetryQuestion({
  id: "choice_1",
  type: "choice",
  stem: "当 x→0 时，求 sin(4x)/x。",
  options: ["0", "1", "4", "∞"],
  answer: "4"
});
assert.strictEqual(answerModeForQuestion(choice), "choice");
assert.strictEqual(choice.answerMode, "choice");
assert.strictEqual(choice.stem, "当 x→0 时，求 sin(4x)/x。");
assert.deepStrictEqual(choice.options, ["0", "1", "4", "∞"]);
assert.strictEqual(choice.answer, "4");
assert.strictEqual(choice.originalQuestionId, "choice_1");

const fill = createOriginalRetryQuestion({
  id: "fill_1",
  type: "fill",
  stem: "计算 ∫x dx。",
  answer: "x^2/2+C",
  detailedSolution: { methodSummary: "幂函数积分" }
});
assert.strictEqual(answerModeForQuestion(fill), "handwriting");
assert.strictEqual(fill.answerMode, "handwriting");
assert.strictEqual(fill.stem, "计算 ∫x dx。");
assert.deepStrictEqual(fill.options, []);
assert.deepStrictEqual(fill.detailedSolution, { methodSummary: "幂函数积分" });

const subjective = createOriginalRetryQuestion({
  id: "subjective_1",
  questionType: "subjective",
  stem: "说明极值判定过程。"
});
assert.strictEqual(subjective.answerMode, "handwriting");
assert.strictEqual(subjective.questionType, "subjective");

console.log("retest question tests passed");
