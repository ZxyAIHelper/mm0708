---
description: 部署前端到 Cloudflare Pages
---

# 部署前端到 Cloudflare Pages

## ⚠️ 重要提醒

**项目名称必须是：`pages`**

不要使用 `web-tools` 或其他名称！

## 部署步骤

### 方式1：使用部署脚本（推荐）

```bash
cd apps/pages
bash deploy.sh
```

脚本会自动使用正确的项目名称 `pages`。

### 方式2：手动部署

```bash
cd apps/pages
npx wrangler pages deploy . --project-name=pages --branch=main --commit-dirty=true
```

## 项目信息

- **项目名称**: `pages`
- **部署 URL**: https://pages-85x.pages.dev
- **自定义域名**: https://www.mm0708.top (如果已配置)

## 验证部署

访问以下 URL 验证部署是否成功：
- https://pages-85x.pages.dev
- https://www.mm0708.top (自定义域名)

## API 配置

前端代码中的 API 地址默认配置为：
- `todo-assistant/script.js`: `const API_BASE = window.API_BASE_URL || 'https://api.mm0708.top';`
- `ai-meme-generator/script.js`: `const API_BASE_URL = window.API_BASE_URL || 'https://api.mm0708.top';`

## 注意事项

1. 每次部署前确认项目名称是 `pages`
2. 确保已登录 Cloudflare: `npx wrangler login`
3. 使用 `--commit-dirty=true` 允许未提交的更改
4. 部署时会自动上传所有静态文件和 Functions
