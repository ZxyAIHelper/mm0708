# Monorepo Project

A Turborepo + pnpm + Hono + D1 Monorepo architecture for web tools and backend services.

## Project Structure

```
.
├── apps/
│   ├── web-tools/          # Frontend tools (Cloudflare Pages)
│   └── my-cloud-hub/       # Backend API (Hono + D1)
├── packages/
│   ├── database/           # Shared database schema (Drizzle ORM)
│   └── shared-types/       # Shared TypeScript types
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 9

### Installation

```bash
pnpm install
```

### Development

Run all apps in development mode:

```bash
pnpm dev
```

Run specific app:

```bash
cd apps/my-cloud-hub
pnpm dev
```

### Database Management

Generate migrations:

```bash
cd packages/database
pnpm db:generate
```

Apply migrations locally:

```bash
pnpm db:migrate
```

Apply migrations to remote:

```bash
pnpm db:migrate:remote
```

### Deployment

Deploy all apps:

```bash
pnpm deploy
```

Or use the deployment script:

```bash
bash deploy.sh
```

## Environment Variables

### Backend (`apps/my-cloud-hub`)

Required in Cloudflare Worker environment:

- `DOUBAO_API_KEY`: Doubao AI API key
- `DOUBAO_ENDPOINT_ID`: Doubao endpoint ID
- `WECHAT_APPID`: WeChat test account App ID
- `WECHAT_SECRET`: WeChat test account secret

### Frontend (`apps/web-tools`)

Configure the backend URL:

```javascript
window.API_BASE_URL = 'https://your-backend-url.com'
```

## License

MIT

## 📂 项目结构说明

```
.
├── apps/                          # 应用目录
│   ├── my-cloud-hub/             # 后端 Worker (Hono + D1 + KV + Vectorize)
│   │   ├── src/
│   │   │   ├── index.ts          # 主入口文件
│   │   │   ├── projects/         # 项目路由
│   │   │   │   ├── meme-generator.ts    # 表情包生成 API
│   │   │   │   └── todo/                # TODO 助手
│   │   │   │       ├── chat.ts          # AI 对话接口
│   │   │   │       ├── tasks.ts         # 任务 CRUD
│   │   │   │       └── rag.ts           # RAG 向量搜索
│   │   │   └── utils/            # 工具函数
│   │   │       └── wechat.ts     # 微信通知
│   │   ├── wrangler.toml         # Cloudflare Worker 配置
│   │   └── package.json
│   └── web-tools/                # 前端工具集 (Cloudflare Pages)
│       ├── index.html            # 工具门户首页
│       ├── tools/                # 各种工具
│       │   ├── todo-assistant/   # TODO 助手 (NEW!)
│       │   ├── ai-meme-generator/
│       │   ├── markdown-editor/
│       │   └── ...
│       └── functions/            # Pages Functions
│
├── packages/                      # 共享包
│   ├── database/                 # Drizzle ORM + D1
│   │   ├── src/
│   │   │   ├── schema.ts         # 数据库 Schema (包含 TODO 任务表)
│   │   │   └── index.ts
│   │   ├── drizzle.config.ts
│   │   └── migrations/           # 数据库迁移文件
│   └── shared-types/             # 共享 TypeScript 类型
│       └── src/index.ts
│
├── pnpm-workspace.yaml           # pnpm 工作区配置
├── turbo.json                    # Turborepo 配置
└── package.json                  # 根配置
```

### 新增功能说明

#### 🤖 TODO 助手
- **位置**: `apps/web-tools/tools/todo-assistant/`
- **后端**: `apps/my-cloud-hub/src/projects/todo/`
- **功能**: 
  - AI 自然语言对话管理任务
  - RAG 向量搜索历史任务
  - 任务创建、更新、完成
  - 智能讨论并总结成任务
- **技术**: 豆包 AI + Cloudflare Vectorize + Workers AI

#### 📦 共享包
- **database**: 使用 Drizzle ORM 管理 D1 数据库，包含任务表、日志表等
- **shared-types**: 前后端共享的 TypeScript 类型定义
