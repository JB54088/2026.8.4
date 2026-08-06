# 真题导入与预览说明

## 当前结论

真题不直接把未经校对的 PDF 文本当作正式题干。系统保留两层数据：

1. 原页图片：负责公式、分式、矩阵、上下标和分段函数的最终显示。
2. 结构化题目：负责章节筛选、刷题、错题记录和后续人工校对。

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

当前已有 30 道概率候选题进入正式题库的试运行池：

- `sourceType: "past_exam"`
- `practiceStatus: "trial"`
- `publishStatus: "published"`
- `answerStatus: "pending_review"`

这意味着学生可以看到并作答，但提交后不会伪造自动判分结果；结果会标记为“答案待校对”。系统还保留原先已校对的 1 道历史真题，因此接口当前显示 31 道可用真题。

这里的“进入题库”指 Node 服务端或 Render 后端的结构化题库。GitHub Pages 是静态演示环境，`public/static-api.js` 使用浏览器内置演示题目，不会自动读取仓库中的 `data/past-exam-questions.json`。推送后，GitHub Pages 可以访问 100 页原页预览，但要测试这 30 道结构化试运行题，应使用本地 Node 服务或 Render 后端。

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

试运行导入（可刷，但不自动判分）：

```bash
node tools/publish_past_exam_questions.js --trial --apply
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
