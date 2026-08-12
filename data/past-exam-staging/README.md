# 真题待校对区

这里存放从原页 manifest 生成的候选题。默认不会被 `server.js` 直接加载，也不会进入学生刷题池。

本次为验证刷题链路，允许使用显式的 `--trial` 通道导入试运行题目。试运行题目会显示在真题专项刷题中，但保留“答案待校对”状态，提交后不自动判分。

当前试点：`probability-pilot.json`

工作流：

1. 原页转换程序生成 `public/past-exam-assets/trial-probability/manifest.json`。
2. `node tools/build_past_exam_staging.js` 从页面中的“例题”标记选取均匀分布的候选题。
3. 人工补齐 `stem`、`options`、`answer`、`explanation`、章节、知识点、年份、卷种和题号。
4. 将候选标记为 `reviewStatus: "teacher_reviewed"`、`answerStatus: "reviewed"`、`publishStatus: "published"`。
5. 先运行 `node tools/publish_past_exam_questions.js` 做校验预览，再显式添加 `--apply` 写入正式真题文件。

试运行导入命令：

```bash
node tools/publish_past_exam_questions.js --trial --apply
```

试运行题目会带有 `practiceStatus: "trial"`，完成答案校对后，应走普通审核发布流程替换这些记录。

原页图片是数学公式的显示真值。题干文本可以用于搜索，但不能用未经校对的 PDF 文本直接替代原页图。
