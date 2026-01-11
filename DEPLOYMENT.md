# 🚀 快速部署指南

按照以下步骤将项目部署到 Cloudflare。

## 📋 前置要求

- ✅ 已安装 Node.js >= 18
- ✅ 已安装 pnpm
- ✅ 拥有 Cloudflare 账户

## 🔧 部署步骤

### 1️⃣ 安装依赖

```bash
pnpm install
```

### 2️⃣ 登录 Cloudflare

```bash
npx wrangler login
```

### 3️⃣ 创建 D1 数据库

```bash
npx wrangler d1 create my-db
```

复制输出的 `database_id`，更新到 `apps/my-cloud-hub/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "粘贴你的 database_id"
```

### 4️⃣ 创建 KV 命名空间

```bash
npx wrangler kv:namespace create WECHAT_KV
```

复制输出的 `id`，更新到 `apps/my-cloud-hub/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "WECHAT_KV"
id = "粘贴你的 KV id"
```

### 5️⃣ 生成并应用数据库迁移

```bash
cd packages/database
pnpm db:generate
pnpm db:migrate:remote
cd ../..
```

### 6️⃣ 设置环境变量

```bash
cd apps/my-cloud-hub

# 设置豆包 API 密钥
npx wrangler secret put DOUBAO_API_KEY
# 输入你的豆包 API Key

# 设置豆包 Endpoint ID
npx wrangler secret put DOUBAO_ENDPOINT_ID
# 输入你的 Endpoint ID

# 设置微信配置（可选）
npx wrangler secret put WECHAT_APPID
npx wrangler secret put WECHAT_SECRET

cd ../..
```

### 7️⃣ 部署后端 Worker

```bash
cd apps/my-cloud-hub
pnpm deploy
```

记录部署后的 Worker URL，例如：
```
https://my-cloud-hub.your-subdomain.workers.dev
```

### 8️⃣ 部署前端 Pages

```bash
cd ../pages
npx wrangler pages deploy . --project-name=pages --branch=main --commit-dirty=true
```

### 9️⃣ 配置前端 API 地址

修改 `apps/pages/tools/ai-meme-generator/script.js` 第 89 行：

```javascript
const API_BASE_URL = window.API_BASE_URL || 'https://your-worker-url.workers.dev';
```

或者在 Cloudflare Pages 设置中添加环境变量 `API_BASE_URL`。

## ✅ 验证部署

### 测试后端 API

```bash
curl https://your-worker-url.workers.dev
```

应该返回：
```json
{
  "name": "My Cloud Hub",
  "version": "1.0.0",
  "status": "running"
}
```

### 测试前端

访问 `https://pages-85x.pages.dev` 查看工具门户。

## 🎉 完成！

恭喜！你的 Monorepo 已成功部署到 Cloudflare。

## 🔄 后续更新

更新代码后重新部署：

```bash
# 部署后端
cd apps/my-cloud-hub
pnpm deploy

# 部署前端
cd ../pages
npx wrangler pages deploy . --project-name=pages --branch=main --commit-dirty=true
```

## 💡 提示

- 使用 `pnpm turbo deploy` 可以同时部署所有应用
- 修改数据库 schema 后记得运行 `pnpm db:generate` 和 `pnpm db:migrate:remote`
- 查看 Worker 日志：`npx wrangler tail`
