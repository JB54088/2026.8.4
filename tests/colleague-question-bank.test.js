const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "data", "question-bank-source.json"), "utf8"));
const imported = JSON.parse(fs.readFileSync(path.join(root, "data", "past-exam-questions.json"), "utf8"));
const publicCatalog = JSON.parse(fs.readFileSync(path.join(root, "public", "imported-question-catalog.json"), "utf8"));

assert.ok(source.length > 2000, "同事题库源文件未完整导入");
assert.ok(imported.length > 2000, "刷题题库没有接入同事导入的完整题目");
assert.strictEqual(publicCatalog.questionCount, publicCatalog.questions.length, "公网题库数量字段不一致");
assert.strictEqual(imported.length, publicCatalog.questions.length, "服务端与公网题库数量不一致");

const ids = new Set();
for (const question of imported) {
  assert.strictEqual(question.sourceType, "past_exam", `非真题来源进入了刷题池：${question.id}`);
  assert.ok(question.id, "导入题目缺少 id");
  assert.ok(question.stem, `导入题目缺少题干：${question.id}`);
  assert.ok(!ids.has(question.id), `导入题目 id 重复：${question.id}`);
  assert.ok(question.detailedSolution?.steps?.length >= 4, `导入题目缺少完整解析：${question.id}`);
  ids.add(question.id);
}

assert.ok(imported.some((question) => question.chapterId === "limit"), "高数题目未进入刷题池");
assert.ok(imported.some((question) => question.chapterId === "linear_matrix"), "线代题目未进入刷题池");
assert.ok(imported.some((question) => question.chapterId === "prob_events"), "概率题目未进入刷题池");
console.log(`colleague question bank tests passed: ${imported.length} questions`);
