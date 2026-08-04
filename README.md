# AI考研数学教练

这是一个可在线演示的 Node.js Web App。单个服务同时提供：

- 前端页面：`public/`
- 后端接口：`server.js`
- 演示数据：`data/db.json`

## 技术栈

- 前端：原生 HTML/CSS/JavaScript 单页应用
- 后端：Node.js 原生 `http` 服务
- 数据：本地 JSON 文件 `data/db.json`
- 草稿纸：浏览器 Canvas，本地会话保存作答状态
- AI识别：可选 OpenAI API，未配置时使用演示/规则诊断流程

## 本地生产运行

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

## 在线演示入口

登录页提供“进入演示系统”按钮。

也可以使用：

```text
账号：demo
密码：demo123
```

每个浏览器会生成独立 `demoSessionId`，服务端会创建独立演示学生，避免多人互相覆盖答题记录和草稿流程。

## Render 部署

推荐使用 Render Web Service，原因是当前项目包含 Node 后端和本地 JSON 数据，不适合作为纯静态站点部署到 Vercel/Netlify/Cloudflare Pages。

### 部署步骤

1. 将本目录推送到 GitHub。
2. 在 Render 新建 Blueprint，选择本仓库。
3. Render 会读取 `render.yaml`。
4. 设置环境变量：
   - `NODE_ENV=production`
   - `PUBLIC_API_BASE_URL=` 留空，表示前端使用同源 API
   - `ALLOWED_ORIGINS=https://你的-render域名.onrender.com`
   - `ADMIN_KEY=自定义强密码`
   - `OPENAI_API_KEY=` 可留空
   - `OPENAI_VISION_MODEL=gpt-5`
5. 部署完成后 Render 会提供 HTTPS 临时域名。

### 更新网站

推送代码到 GitHub 后，Render 会自动重新部署。

### 查看日志

进入 Render 控制台，打开对应 Web Service，查看 Logs。

### 回滚

Render 控制台可以回滚到上一个成功部署版本，也可以在 GitHub 回退提交后重新部署。

## 自定义域名

Render 服务页面中添加 Custom Domain。

DNS 通常配置：

- 根域名：按 Render 提示配置 A 记录或 ALIAS/ANAME
- 子域名：配置 CNAME 指向 Render 提供的目标地址

HTTPS 证书由 Render 自动申请和续期。部署更新后网址保持不变。

## Docker 部署

```bash
docker compose up -d
```

默认映射：

```text
http://服务器IP:5188
```

如需公网 HTTPS，建议在服务器前面配置 Nginx/Caddy 反向代理并绑定域名。

## 环境变量

复制 `.env.example` 为 `.env`，不要提交真实 `.env`。

关键变量：

- `PORT`：服务监听端口
- `PUBLIC_API_BASE_URL`：前端 API 地址，单服务部署时留空
- `ALLOWED_ORIGINS`：允许跨域来源，逗号分隔
- `ADMIN_KEY`：管理员接口口令
- `OPENAI_API_KEY`：可选，手写识别调用
- `RATE_LIMIT_PER_MINUTE`：简单限流
- `MAX_BODY_BYTES`：请求体大小限制

## 路由刷新

服务端已支持 SPA fallback，以下路径直接刷新不会 404：

- `/login`
- `/dashboard`
- `/practice`
- `/diagnosis`
- `/review`
- `/similar-training`
- `/original-retry`
- `/report`
- `/ability-profile`

## 注意事项

- 当前演示数据适合产品演示，不是正式生产数据库。
- Render 磁盘已配置持久化，用于保存 `data/`。
- 多人演示通过浏览器会话隔离，但正式商用仍建议接入真实账号系统和云数据库。
- 不要把 OpenAI API Key 或管理员口令写进前端代码或 Git 仓库。
