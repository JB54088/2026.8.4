const assert = require("assert");
const fs = require("fs");
const path = require("path");

const catalogFile = path.join(__dirname, "..", "data", "question-catalog.json");
if (fs.existsSync(catalogFile)) {
  const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
  assert.ok(Array.isArray(catalog.questions), "题目目录必须包含 questions 数组");
  assert.strictEqual(catalog.questionCount, catalog.questions.length, "题目数量字段必须与数组一致");
  const ids = new Set();
  for (const question of catalog.questions) {
    assert.ok(question.id, "每道题必须有 id");
    assert.ok(!ids.has(question.id), `题目 ID 重复：${question.id}`);
    ids.add(question.id);
    assert.ok(question.stem, `题目 ${question.id} 缺少题干`);
    assert.ok(question.detailedSolution, `题目 ${question.id} 缺少已保存解析`);
    assert.ok(Array.isArray(question.detailedSolution.steps), `题目 ${question.id} 缺少分步解析`);
  }
}
console.log("solution catalog tests passed");
