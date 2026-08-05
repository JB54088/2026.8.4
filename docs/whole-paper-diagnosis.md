# 整卷诊断重构说明

本版本新增以 `submissionId` 为核心的整卷提交流程，不再只依赖单题 `attempt` 拼接诊断。

## 当前问题原因

旧流程中，前端 `submitRound()` 会遍历题目并循环调用 `POST /api/attempts`。后端每次只处理一道题，`GET /api/learning-loop` 再从最近的 attempts 中拼出诊断。因此系统天然只能做“局部题目诊断”，无法表达一整份试卷的统一状态、统一提交时间、统一批改进度和整卷能力画像。

## 新流程

1. 前端保存整卷作答：选择题、填空题、主观题答案、公式输入、文字步骤、草稿图片、上传图片、题目用时、题号顺序和标记状态。
2. 前端只调用一次 `POST /api/submissions`。
3. 后端执行完整性检查，锁定本次答卷快照。
4. 后端逐题识别和批改：客观题直接判分，主观题调用手写识别。
5. 识别失败的题目标记为 `recognition_error` 或 `pending_recognition`，不影响其他题继续批改。
6. 所有单题结果写入 `attempts`，并通过同一个 `submissionId` 关联。
7. 系统生成整卷报告：总分、得分率、题型得分、章节得分、知识点掌握度、错误类型统计、能力诊断、逐题解析和推荐学习任务。
8. 前端自动进入“整卷诊断报告”，学生可继续进入“逐题解析”“知识点复习”“相似题训练”和“原题重做”。

## 新增 API

- `POST /api/submissions`：提交整卷并生成整卷批改报告。
- `GET /api/submissions?studentId=xxx`：读取该学生历史整卷提交和最近一次报告。
- `GET /api/submissions/:submissionId`：读取指定整卷提交。

## 新增核心数据

- `submissions[]`
- `submission.id / submissionId`
- `examinationId`
- `questionIds`
- `attemptIds`
- `responsesLocked`
- `completenessIssues`
- `gradingStatusHistory`
- `report.summary`
- `report.byType`
- `report.byChapter`
- `report.byKnowledge`
- `report.errorStats`
- `report.abilityDiagnosis`
- `report.questionAnalyses`
- `report.recommendedTasks`

## 验收重点

- 整卷提交只调用一次 `POST /api/submissions`。
- 每道题仍生成独立批改结果。
- 主观题不冒充真实识别；无 OCR/AI 时保存草稿并标记待识别或识别失败。
- 任意题识别失败不阻塞整卷报告。
- 报告和逐题解析刷新后可通过 `GET /api/submissions` 恢复。
