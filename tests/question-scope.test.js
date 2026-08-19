const assert = require("assert");
const {
  questionAppliesToMathType,
  chapterSubjects,
  countsByMathType
} = require("../public/question-scope.js");

const q = (chapterId, subjects) => ({ chapterId, subjects });

assert.strictEqual(questionAppliesToMathType(q("limit", ["数学一"]), "数学二"), true);
assert.strictEqual(questionAppliesToMathType(q("linear_matrix", ["数学三"]), "数学二"), true);
assert.strictEqual(questionAppliesToMathType(q("prob_events", ["数学一"]), "数学三"), true);
assert.strictEqual(questionAppliesToMathType(q("prob_events", ["数学一"]), "数学二"), false);
assert.strictEqual(questionAppliesToMathType(q("space", ["数学一"]), "数学三"), false);

const sharedLimitQuestions = [q("limit", ["数学一"]), q("limit", ["数学二"])];
assert.deepStrictEqual(new Set(chapterSubjects(sharedLimitQuestions, "limit")), new Set(["数学一", "数学二", "数学三"]));
assert.deepStrictEqual(countsByMathType(sharedLimitQuestions, "limit"), { "数学一": 2, "数学二": 2, "数学三": 2 });
console.log("question scope tests passed");
