const assert = require("node:assert/strict");
const { gradeQuestion, canonicalQuestionType } = require("../public/grading-engine.js");

const choiceQuestion = {
  id: "choice-1",
  type: "方法问题",
  options: ["1", "2", "4", "8"],
  answer: "4",
  maxScore: 5
};

assert.equal(canonicalQuestionType(choiceQuestion), "single_choice");
assert.equal(gradeQuestion(choiceQuestion, { selectedOption: "C" }).status, "CORRECT");
assert.equal(gradeQuestion(choiceQuestion, { selectedOption: "C" }).isCorrect, true);
assert.equal(gradeQuestion(choiceQuestion, { answer: "", selectedOption: "C" }).isCorrect, true);
assert.equal(gradeQuestion(choiceQuestion, { answer: "C" }).isCorrect, true);
assert.equal(gradeQuestion(choiceQuestion, { answer: "4" }).isCorrect, true);
assert.equal(gradeQuestion(choiceQuestion, { selectedOption: "c" }).isCorrect, true);
assert.equal(gradeQuestion(choiceQuestion, { selectedOption: "B" }).isCorrect, false);
assert.equal(gradeQuestion(choiceQuestion, { selectedOption: "B", answer: "4" }).isCorrect, false);

const objectChoiceQuestion = {
  id: "choice-object",
  type: "choice",
  options: [
    { label: "A", content: "0" },
    { label: "B", content: "1" },
    { label: "C", content: "4" },
    { label: "D", content: "∞" }
  ],
  answer: "4"
};
assert.equal(gradeQuestion(objectChoiceQuestion, { selectedOption: "C" }).isCorrect, true);

const fillQuestion = { id: "fill-1", type: "fill", answer: "4", maxScore: 5 };
assert.equal(gradeQuestion(fillQuestion, { answer: 4 }).status, "CORRECT");
assert.equal(gradeQuestion(fillQuestion, {}).status, "EMPTY");
assert.equal(gradeQuestion(fillQuestion, { scratchImage: "data:image/png;base64,x", strokeCount: 12 }).status, "RECOGNITION_FAILED");
assert.equal(gradeQuestion(fillQuestion, { recognizedAnswer: "4", scratchImage: "data:image/png;base64,x", strokeCount: 12 }, { recognition: { recognizedAnswer: "4", confidence: 92 } }).isCorrect, true);

const subjectiveQuestion = { id: "subjective-1", type: "subjective", answer: "x^2+C", maxScore: 10 };
assert.equal(gradeQuestion(subjectiveQuestion, { answer: "x^2+C" }).status, "CORRECT");
assert.equal(gradeQuestion(subjectiveQuestion, { answer: "x+C", stepsText: "过程" }).status, "INCORRECT");
assert.equal(gradeQuestion(subjectiveQuestion, { scratchImage: "data:image/png;base64,x", strokeCount: 8 }, { recognition: { modelJudgment: true, isCorrect: false, recognizedAnswer: "x+C", confidence: 88 } }).status, "INCORRECT");
assert.equal(gradeQuestion(subjectiveQuestion, { scratchImage: "data:image/png;base64,x", strokeCount: 8 }, { recognition: { modelJudgment: true, isCorrect: true, recognizedAnswer: "x^2+C", processHasIssue: true, confidence: 88 } }).status, "PARTIAL");

console.log("grading-engine tests passed");
