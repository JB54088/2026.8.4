# AI考研数学诊断与提分平台

一套围绕“检测 -> 诊断 -> 复习 -> 训练 -> 原题重做 -> 复测 -> 提分报告”的考研数学学习闭环产品。

## 在线演示

公开演示地址：

```text
https://jb54088.github.io/2026.8.4/
```

演示入口：

```text
账号：demo
密码：demo123
```

也可以直接点击首页的“进入演示系统”。每个浏览器会生成独立 `demoSessionId`，答题记录、草稿纸、错题状态和演示进度互不覆盖。

## 技术栈

- 前端：原生 HTML / CSS / JavaScript 单页应用
- 后端：Node.js 原生 HTTP 服务
- 题库：SQLite 文件数据库 `data/questions.sqlite`，源数据为 `data/question-bank-source.json`
- 学习状态：本地 JSON 数据文件 `data/app-state.json`
- 草稿纸：Canvas，支持笔、荧光笔、橡皮、撤销、清空、粗细和颜色
- 在线静态演示：GitHub Pages + `public/static-api.js` 浏览器内模拟 API
- 生产后端部署：Render Web Service，配置见 `render.yaml`

## 本地运行

```bash
npm run build
npm start
```

默认地址：

```text
http://localhost:5188
```

健康检查：

```text
GET /api/health
```

真题原页试运行预览：

```text
http://localhost:5188/past-exam-preview.html
```

Node 服务端已发布“真题分类概率”100 页原页图片，并将其中 30 道候选题以试运行状态接入数学一/数学三的概率真题专项。答案和解析仍待人工校对，试运行题提交后不会自动判分。GitHub Pages 版本会发布原页预览和静态来源入口，但不会读取服务端 `data/past-exam-questions.json`；要测试这 30 道结构化试运行题，请使用本地 Node 服务或 Render 后端。完整流程见 [真题导入与预览说明](docs/past-exam-import.md)。

## 环境变量

复制 `.env.example` 为 `.env`，不要提交真实 `.env`。

```text
PORT=5188
NODE_ENV=development
PUBLIC_API_BASE_URL=
ALLOWED_ORIGINS=
ADMIN_KEY=
OPENAI_API_KEY=
OPENAI_VISION_MODEL=gpt-5
RATE_LIMIT_PER_MINUTE=180
MAX_BODY_BYTES=3145728
QUESTION_DB_PATH=data/questions.sqlite
QUESTION_SOURCE_PATH=data/question-bank-source.json
APP_STATE_PATH=data/app-state.json
```

AI 降级方案：

- 未配置 `OPENAI_API_KEY` 时，系统仍可保存草稿、最终答案、公式文本和步骤文本。
- 选择题、填空题优先走规则判分。
- 主观题在无 AI 时使用步骤完整度和标准答案信号进行演示级诊断，不会把标准答案伪装成手写识别结果。
- 配置 `OPENAI_API_KEY` 后，后端会调用视觉模型分析草稿图片，输出识别答案、步骤摘要、首个错误位置、薄弱点和训练建议。

## 核心 API

- `GET /api/health`：服务健康检查
- `GET /api/bootstrap`：章节、邀请码、真题来源、AI 状态
- `POST /api/login`：学生登录或演示登录
- `POST /api/demo/reset`：重置当前演示会话
- `GET /api/questions`：按学生、章节、模式、难度、题源组卷
- `POST /api/attempts`：提交单题答案、草稿、步骤和判分
- `GET /api/learning-loop`：生成诊断、复习、训练、重做、复测闭环
- `GET /api/collection`：做题集/错题本
- `GET /api/report`：学习报告
- `GET /api/admin`：管理视图数据，需要 `ADMIN_KEY`

## 已实现功能

- 数学一、数学二、数学三入口选择
- 基础训练、强化训练、模拟考试模式
- 选择题、填空题、主观题
- 题目上方、答题/草稿区下方的刷题结构
- 选择题可直接点选
- 填空题支持最终答案、公式表达式和草稿
- 主观题支持最终答案、关键步骤、公式输入、图片上传和草稿纸
- 答题进度、标记、收藏、草稿信息本地持久化
- 交卷后统一批改，不提前暴露完整答案
- 分步诊断、错误类型、知识点复习、理解检查
- 同类题训练、变式训练、原错题重做、掌握验证
- 错题本/做题集
- 能力画像和提分报告
- GitHub Pages 静态公开演示
- Render 后端生产部署配置

## 当前数据结构

当前应用状态仍使用 JSON 存储，主要对象包括：

- `students`
- `attempts`
- `notes`
- `reports`
- `learningLoop`

题库已经单独迁移到 SQLite。首次启动或运行 `npm run db:init` 时，会从可追踪的 `data/question-bank-source.json` 自动生成 `data/questions.sqlite`；`data/db.json` 仅作为旧版迁移备份，不再参与每次请求的题库读取和整体写入。题库导入和校验命令如下：

```bash
node tools/import-questions.js path/to/questions.csv
node tools/annotate-question-categories.js
node tools/validate-question-bank.js
node tools/init-question-db.js --rebuild
```

题目对象统一使用 `schemaVersion: 19`。题库导入、服务端刷题接口和静态演示都会归一化为 `sectionId/section`、`type`、`content`、`choiceOptions`、`answerSpec`、`sourceSpec`、`practiceMeta` 等规范字段，同时保留 `chapterId/options/answer` 等旧字段作为兼容别名。刷题接口按 `sectionId` 直接从 `questions` 题库分区筛选，不再维护另一套刷题题目结构；带 `allowUnreviewedPractice: true` 的历年真题可以直接进入真题刷题池，但相似题训练只使用已标注且审核发布的题目，题库不足时明确显示短缺，不使用未审核或规则生成题补足。公式字段保留 LaTeX 原文，同时支持普通文本、Unicode 数学符号和本地 KaTeX 渲染。字段说明见 [统一题目结构](docs/question-schema.md)。

SQLite 题库包含两张表：`question_db_meta(key, value)` 保存数据库版本、题目 schema 版本、导入时间、来源和数量；`questions` 保存 `id`、`subjects_json`、`section_id`、`section_name`、`type`、`difficulty`、`source_type`、`practice_status`、`knowledge_point_id`、`training_level`、`similar_group_id`、完整 `question_json` 和 `updated_at`。章节、题型、难度、题源、状态、知识点和训练层级均有索引，完整题目对象以 `question_json` 为规范快照。

静态演示构建时会把同一份 `data/question-bank-source.json` 发布为 `public/question-bank.json`，浏览器内的刷题、错题、训练和复测都从这份题库读取；不会再用硬编码种子题或规则变式题补数。

题库导入使用根目录的 `question-import-template.csv`；可运行 `node tools/validate-question-bank.js` 校验题目结构和可刷状态。训练题在提交前不会返回答案，单题提交后记录锁定，并通过 `record.reveal` 返回标准答案和解析。

正式商业化如果需要多实例部署，再迁移到 PostgreSQL；当前 SQLite 题库表已经为后续迁移保留筛选字段和完整题目 JSON。学生学习状态仍暂时使用 JSON。商业化阶段可继续拆分为：

- `users`
- `student_profiles`
- `subjects`
- `chapters`
- `knowledge_points`
- `questions`
- `question_options`
- `question_solutions`
- `scoring_points`
- `papers`
- `paper_questions`
- `exam_sessions`
- `student_answers`
- `answer_steps`
- `grading_results`
- `error_records`
- `learning_cards`
- `training_tasks`
- `training_records`
- `retest_records`
- `mastery_records`
- `study_reports`

## 真题导入状态

真题采用“原页图片 + 结构化题目”的双层方式：原页图片负责公式、分式、矩阵和分段函数的最终显示；OCR 文本只用于搜索、复制和人工校对。

当前导入内容：

- 1987-2025 结构化题库源：`data/question-bank-source.json`
- 原页资源和页面清单：`public/past-exam-assets/classified-1987-2025/`
- 答案匹配结果：`data/past-exam-staging/answers-matched-1987-2025.json`
- 导入工具：`tools/extract_past_exam_questions.py`、`tools/extract_past_exam_answers.py`、`tools/import_past_exam_answers.js`

未审核真题使用 `practiceMeta.status: "needs_review"` 并通过 `allowUnreviewedPractice: true` 进入直接刷题池；它们不会进入相似题训练，也不会被当作最终审核标准。完成题干、选项、答案和解析校对后，再使用普通审核发布流程标记 `practiceMeta.status: "published"`。

## 部署

### GitHub Pages 演示版

推送 `main` 后，`.github/workflows/pages.yml` 会把 `public/` 发布到 GitHub Pages。

### Render 后端版

推荐用于完整后端和 API 演示：

1. 将仓库连接到 Render。
2. 选择 Blueprint 或 Web Service。
3. Render 会读取 `render.yaml`。
4. 配置环境变量。
5. 部署完成后 Render 会提供 HTTPS 地址。

## 已知问题

- 公开 GitHub Pages 版是静态演示，数据保存在访问者浏览器中，不是正式云数据库。
- 当前题库包含已结构化的 1987-2025 真题；部分题目仍待答案或原页人工校对，未完成校对的题目只支持直接刷题，不进入相似题训练。
- 真题题源仍受数学类型和章节范围限制；例如数学二不包含概率论，筛选时应先确认数学类型、章节和题源。
- 主观题真实手写识别依赖 `OPENAI_API_KEY` 和模型调用额度。
- 管理后台已有基础数据查看能力，题库 CRUD、Word/Excel/OCR 批量导入仍需继续产品化。
