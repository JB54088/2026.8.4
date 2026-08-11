# 统一题目结构

题库、刷题 API、静态演示和导入脚本都使用同一套题目规范。当前版本号为 `19`，由 `public/question-model.js` 统一归一化。

## 核心结构

```js
{
  schemaVersion: 19,
  id: "question_id",
  subjects: ["数学一", "数学二"],

  sectionId: "integral",
  sectionName: "一元函数积分学",
  section: {
    id: "integral",
    name: "一元函数积分学",
    groupId: "",
    groupName: "",
    order: 0
  },

  type: "choice", // choice | fill | solution | subjective
  point: "换元积分",
  level: "强化训练",
  difficulty: 4,

  content: {
    stem: { value: "计算 $\\int 2x\\,dx$。", format: "latex" },
    formula: { value: "x^2+C", format: "latex" },
    explanation: { value: "使用幂函数积分公式。", format: "text" }
  },
  stem: "计算 $\\int 2x\\,dx$。", // 兼容旧前端
  formula: "x^2+C",

  choiceOptions: [
    { key: "A", text: "x^2", raw: "A. x^2" },
    { key: "B", text: "2x^2", raw: "B. 2x^2" }
  ],
  answerSpec: {
    value: "A",
    aliases: [],
    optionKey: "A",
    format: "text"
  },

  practiceMeta: {
    status: "published", // needs_review | published | blocked
    knowledgePointId: "integral:换元积分",
    knowledgePointName: "换元积分",
    errorTypes: ["method"], // concept | condition | method | calculation |
                             // expression | modeling | transfer
    trainingLevel: "foundation", // foundation | same_type | variation | comprehensive
    similarGroupId: "",
    reviewer: "教研老师",
    reviewedAt: "2026-08-11T00:00:00.000Z"
  },

  sourceSpec: {
    type: "teacher_original",
    name: "签约教师原创题",
    book: "",
    section: "",
    year: null,
    mathType: "",
    questionNo: "",
    page: null,
    pageImage: "",
    stemImage: ""
  }
}
```

旧字段 `chapterId/chapterName`、`options/answer`、`questionType`、`knowledgePoint` 等继续保留为兼容别名。新代码应优先读取 `sectionId`、`type`、`choiceOptions`、`answerSpec`、`content` 和 `sourceSpec`。

## 题库分区调用

`GET /api/questions` 的 `chapterIds` 参数现在对应规范字段 `sectionId`，例如：

```text
/api/questions?studentId=stu_1&chapterIds=integral,linear_determinant
```

服务端和静态演示都会从统一的 `questions` 题库中按 `subjects + sectionIds + sourceType + difficulty` 筛选，再生成刷题组，不再维护独立的刷题题目结构。相似题训练额外只接受 `practiceMeta.status = "published"` 且通过答案、解析、知识点和错误类型校验的题目；题库不足时返回短缺数量，不使用未审核题或规则生成题补足。

相似题按 `similarGroupId`、知识点、题型、错误类型、章节和数学科目分层匹配，并用固定种子稳定排序。针对训练的层级顺序为：基础题 2 道、同类题 3 道、变式题 3 道、综合题 2 道。综合训练同样从已发布题库选择。

训练批次内部保存完整题目快照，但接口返回会移除 `answer`、`aliases`、`answerSpec`、`explanation` 和 `solution`。学生提交单题后记录变为 `locked`，此时接口通过 `record.reveal` 一次性返回标准答案与解析；重复提交返回 409。

## 数学公式

公式可放在 `stem`、`formula`、`explanation`、选项和答案中，支持普通文本、Unicode 数学符号和常用轻量 LaTeX（如 `$...$`、`\\frac{a}{b}`、`\\sqrt{x}`、上下标）。前端通过 `QuestionModel.renderFormulaText()` 安全渲染；真题仍可同时保留 `stemImage/pageImage` 作为复杂排版的最终显示层。

## 导入与校验

CSV 模板为仓库根目录的 `question-import-template.csv`。导入时填写 `practiceStatus`、`errorTypes`、`trainingLevel` 等平铺字段，脚本会归一化为 `practiceMeta`。只有明确标记为 `published` 的记录才会进行“可刷题”完整校验；未完成审核的记录保留为 `needs_review`，不会进入相似题训练。

```bash
node tools/import-questions.js path/to/questions.csv
node tools/validate-question-bank.js
```
