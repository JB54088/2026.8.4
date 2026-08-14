# 真题导入与预览说明

## 当前结论

真题不直接把未经校对的 PDF 文本当作正式题干。系统保留两层数据：

1. 原页图片：负责公式、分式、矩阵、上下标和分段函数的最终显示。
2. 结构化题目：负责章节筛选、刷题、错题记录和后续人工校对。

## 1987—2025 批量抽取

本次批量扫描的源资料实际位于 `data/（87-25）数学真题分类/`，不是仓库的
`docs/` 说明目录。脚本只把四份主来源 PDF 作为题目来源，自动排除“解析”和
“做题本”副本，避免同一题重复导入：

- 高数上册、下册原 PDF；
- 真题分类线代；
- 真题分类概率。

提取器和导入器：

```bash
python3 tools/extract_past_exam_questions.py \
  --family all \
  --output data/past-exam-staging/extracted-1987-2025.json \
  --assets-dir public/past-exam-assets/classified-1987-2025 \
  --render-pages question

node tools/import-past-exam-staging.js \
  data/past-exam-staging/extracted-1987-2025.json

node tools/import-past-exam-staging.js \
  data/past-exam-staging/extracted-1987-2025.json --apply
```

当前批量结果为 2346 道候选题，全部保留原页 PNG 作为
`sourceSpec.pageImage`/`stemImage`。文字层可用于检索，公式字段先保持
`format: "text"` 并标记 `formula_requires_visual_review`，确认后的公式再改为
KaTeX 可渲染的 `$...$`/`$$...$$` 或 `format: "latex"`。现有标签形如
`年份-卷种代码-分值`，脚本另外保留 `sourceExampleNo` 和 `sourceExamTag`；
如果源 PDF 没有原试卷题号，不会把卷种代码误当题号。

当前试点使用：

- 来源：`data/（87-25）数学真题分类/线代概率篇/原PDF及解析/真题分类概率.pdf`
- 页数：100 页
- 原页资源：`public/past-exam-assets/trial-probability/`
- 页面预览：`public/past-exam-preview.html`
- 候选队列：`data/past-exam-staging/probability-pilot.json`

## 学生端如何查看

本地启动：

```bash
npm run build
npm start
```

访问：

```text
http://localhost:5188/
http://localhost:5188/past-exam-preview.html
```

在学生端选择数学一或数学三，进入“刷题”，选择概率章节，并将“题源”设为“历年考研数学真题”。当前试运行题属于概率专题，因此数学二不会抽到这一批题。

原页预览页支持页码跳转、上一页/下一页、文本复制和原图打开。原图使用相对路径，可用于本地 Node 服务和 GitHub Pages 子路径部署。

## 当前导入状态

当前批量抽取已将 2346 道候选题进入正式 SQLite 题库，并开启未审核试刷。随后四份
答案解析 PDF 已通过脚本导入：

```bash
python3 tools/extract_past_exam_answers.py
node tools/import_past_exam_answers.js
node tools/import_past_exam_answers.js --apply
npm run build
```

匹配规则是 `sourceBook + sourceExampleNo` 的精确键，不使用题干相似度猜题。当前
答案导入结果：2346 条新题精确匹配，另有 30 条历史概率候选记录按明确例题号回连，
共 2376 条数据库记录写入答案来源；2278 条是明确答案，98 条是“见解析/待复核”。
每条匹配记录保留答案 PDF、页码、例题号、答案原文和解析正文（若文字层抽取到）。

其中 22 条旧版 2012 数学二图片卡只有原卷图片题号，没有对应的
`sourceBook + sourceExampleNo` 键；脚本不会把分类资料中的其他例题答案硬挂到这些记录上，
它们继续保持待补答案状态。

当前批量题目的状态为：

- `sourceType: "past_exam"`
- `practiceMeta.status: "needs_review"`
- `qualityTier: "past_exam_extracted"`
- `answerStatus: "matched_from_answer_pdf"` 或 `"pending_review"`
- `allowUnreviewedPractice: true`

这意味着新导入题目会进入学生刷题池；明确答案的题目可以自动判分，98 条“见解析/待复核”
和旧图片卡不会被当成可判定标准答案。完成题干、题号、公式、答案、解析和审核状态后，
才应移除 `allowUnreviewedPractice` 并改为 `published`。系统原有已校对真题仍保留在题库中。

这里的“进入题库”指 Node 服务端或 Render 后端的结构化题库。GitHub Pages 构建时会将同一份规范题库发布为 `public/question-bank.json`，静态页面会从该文件读取题目；章节卡片和刷题池数量都按实际可刷题目同步计算。推送后，GitHub Pages 可以访问原页预览，完整的导入与审核流程仍建议使用本地 Node 服务或 Render 后端。

## 导入工具

转换单个 PDF 并生成原页资源：

```bash
python3 tools/pdf_to_markdown.py \
  'data/（87-25）数学真题分类' \
  --only '线代概率篇/原PDF及解析/真题分类概率.pdf' \
  --output-dir 'data/（87-25）数学真题分类/markdown' \
  --page-images always \
  --public-assets-dir 'public/past-exam-assets/trial-probability' \
  --public-url-prefix './'
```

从页面清单建立候选题队列：

```bash
node tools/build_past_exam_staging.js
```

`build_past_exam_staging.js` 仍用于旧的概率试点队列；1987—2025 全量候选题
使用上面的 `extract_past_exam_questions.py`。

试运行导入（可刷，但不自动判分）：

```bash
node tools/import-past-exam-staging.js \
  data/past-exam-staging/extracted-1987-2025.json \
  --open-practice --apply
```

正式发布必须先补齐题干、选项、答案、解析、年份、卷种和题号，再通过普通校验：

```bash
node tools/publish_past_exam_questions.js --apply
```

不带 `--apply` 时只做预览和校验，不写入正式题库。

## 常见空白原因

“尚未导入真实历年考研数学真题”不一定表示文件不存在，通常是当前数学类型、章节或题源筛选没有匹配题目：

- 这批概率真题只适用于数学一和数学三；
- 选择未导入真题的高数、线代章节时，真题题源会为空；
- 从“章节学习”进入时，如果上一次把题源保存为“历年考研数学真题”，切换到普通章节后需要改回“全部题源”；
- 数学二的概率章节不在考试范围内。

遇到空白时先切换“全部题源”验证普通题库，再确认数学类型和章节筛选。

## 校对原则

原页图片是数学公式的显示真值。OCR 文本中出现分式缺项、条件概率竖线丢失、集合运算符错位、矩阵或分段括号破坏时，应以原页图片为准，并在正式发布前修正结构化字段。未经校对的试运行题不能作为自动判分标准答案。
