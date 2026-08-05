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
- 数据：本地 JSON 数据文件 `data/db.json`
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

当前演示版使用 JSON 存储，主要对象包括：

- `students`
- `questions`
- `attempts`
- `notes`
- `reports`
- `learningLoop`

正式商业化建议迁移到 PostgreSQL，拆分为：

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
- 当前题库仍是演示级题库，已经支持题量生成和真题切片样式，但大规模正版题库需要授权资料后通过导入工具进入。
- 主观题真实手写识别依赖 `OPENAI_API_KEY` 和模型调用额度。
- 管理后台已有基础数据查看能力，题库 CRUD、Word/Excel/OCR 批量导入仍需继续产品化。
