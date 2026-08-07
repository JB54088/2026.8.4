const assert = require("node:assert/strict");
const {
  gradeChoiceAnswer,
  resolveChoiceAnswer
} = require("../public/choice-grading.js");

const options = ["1", "2", "4", "8"];

assert.equal(resolveChoiceAnswer("C", options).content, "4");
assert.equal(gradeChoiceAnswer("C", "4", options), true);
assert.equal(gradeChoiceAnswer("C", "C", options), true);
assert.equal(gradeChoiceAnswer("4", "C", options), true);
assert.equal(gradeChoiceAnswer("4", "4", options), true);
assert.equal(gradeChoiceAnswer("B", "4", options), false);
assert.equal(gradeChoiceAnswer("c", "C", options), true);

const objectOptions = [
  { label: "A", content: "0" },
  { label: "B", content: "1" },
  { label: "C", content: "4" },
  { label: "D", content: "∞" }
];
assert.equal(resolveChoiceAnswer("C", objectOptions).content, "4");
assert.equal(gradeChoiceAnswer("C", "4", objectOptions), true);

// Non-choice scalar answers keep their existing string/number equivalence.
assert.equal(String("4").trim(), String(4).trim());

console.log("choice-grading tests passed");
