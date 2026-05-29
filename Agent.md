# Agent Guide

This repository is a pnpm workspace/Turborepo monorepo for a small AI tools platform.
It contains a static frontend tools portal, a Cloudflare Worker backend, shared database
schema code, shared TypeScript types, and a WeChat mini-program.

## Repository Shape

```text
.
+-- apps/
|   +-- pages/              # Static tools portal, intended for Cloudflare Pages
|   +-- my-cloud-hub/       # Cloudflare Worker backend built with Hono
|   +-- education-dashboard/ # Next.js education analytics app on Cloudflare Workers
|   +-- mini-apps/          # WeChat mini-programs
+-- packages/
|   +-- database/           # Drizzle ORM schema and D1 migrations
|   +-- shared-types/       # Shared TypeScript type definitions
+-- package.json            # Root Turborepo scripts
+-- pnpm-workspace.yaml     # Workspace package list
+-- turbo.json              # Task pipeline
```

## Main Stack

- Package manager: `pnpm@9.0.0`
- Monorepo runner: Turborepo
- Backend runtime: Cloudflare Workers
- Backend framework: Hono
- Database: Cloudflare D1, modeled with Drizzle ORM
- Cloudflare storage/services: D1, KV, Vectorize, Workers AI bindings
- Frontend: mostly static HTML/CSS/JavaScript tools under `apps/pages/tools`
- Tests: Vitest in `apps/my-cloud-hub`

## Important Apps

### `apps/pages`

This is the frontend tools portal. The entry page is `apps/pages/index.html`.
Tools are organized as self-contained folders under `apps/pages/tools`.

Current tool folders include:

- `ai-meme-generator`
- `aura-tree`
- `couplet-admin`
- `email-monitor`
- `json-formatter`
- `poster-maker`
- `qrcode-generator`
- `text-processor`
- `todo-assistant`
- `url-encoder`

There is also a `functions/api` directory for Cloudflare Pages Functions. The deploy
script uses Wrangler Pages:

```bash
cd apps/pages
npx wrangler pages deploy . --project-name=pages --branch=main --commit-dirty=true
```

`apps/pages/dev-server.js` is a local helper server for static files and selected API
mocking. Treat secrets in this file as sensitive; do not copy them into docs, logs, or
new source files.

### `apps/my-cloud-hub`

This is the backend Cloudflare Worker. The main entry is `apps/my-cloud-hub/src/index.ts`.
It exports both:

- `fetch`: Hono HTTP API handler
- `email`: Cloudflare Email Worker handler

Mounted routes:

- `/api/meme`
- `/api/todo/tasks`
- `/api/todo/rag`
- `/api/todo/chat`
- `/api/email-monitor`
- `/api/couplet`

Cloudflare configuration lives in `apps/my-cloud-hub/wrangler.toml`.
Configured bindings:

- `DB`: D1 database `my-db`
- `WECHAT_KV`: KV namespace
- `VECTORIZE`: Vectorize index `todo-tasks`

The Worker code also expects environment bindings/secrets such as:

- `DOUBAO_API_KEY`
- `DOUBAO_IMAGE_ENDPOINT_ID`
- `DOUBAO_CHAT_ENDPOINT`
- `WECHAT_APPID`
- `WECHAT_SECRET`

Run backend development:

```bash
cd apps/my-cloud-hub
pnpm dev
```

Deploy backend:

```bash
cd apps/my-cloud-hub
pnpm deploy
```

### `apps/education-dashboard`

This is a Next.js App Router education analytics dashboard. It is deployed to
Cloudflare Workers through OpenNext for Cloudflare, not Cloudflare Pages.

Key files:

- `wrangler.jsonc`: Worker, assets, custom domain, service binding, and D1 binding
- `open-next.config.ts`: OpenNext Cloudflare adapter config
- `prisma/schema.prisma`: Prisma schema for the education dashboard database
- `src/app`: Next.js routes and API handlers

Production domain:

- `https://edu.mm0708.top`
- Portal redirect: `https://mm0708.top/tools/edu`

Useful commands:

```bash
cd apps/education-dashboard
pnpm install
pnpm dev
pnpm build
pnpm deploy
```

The Worker is configured with a custom domain route for `edu.mm0708.top`. If the
configured D1 database does not belong to the active Cloudflare account, create a new
D1 database and update the `database_id` in `wrangler.jsonc`.

### `apps/mini-apps/couplet`

This is a WeChat mini-program for the couplet feature. It uses the standard mini-program
file layout with `app.js`, `app.json`, `app.wxss`, pages, and custom components.

## Shared Packages

### `packages/database`

Contains Drizzle schema and migration commands for Cloudflare D1.

Key files:

- `src/schema.ts`: database tables
- `migrations/`: generated D1 migrations
- `drizzle.config.ts`: Drizzle Kit config

Current schema includes:

- `logs`
- `users`
- `check_ins`
- `todo_tasks`
- `email_rules`
- `wecom_config`

Useful commands:

```bash
cd packages/database
pnpm db:generate
pnpm db:migrate
pnpm db:migrate:remote
pnpm db:studio
```

### `packages/shared-types`

Small shared TypeScript types package. Use this for cross-app types when a type is
actually shared between frontend/backend/package boundaries.

## Root Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm deploy
pnpm clean
```

Note: some workspace packages do not define every Turborepo task. Check each
`package.json` before assuming a root command covers a specific app.

## Testing

Backend tests live under `apps/my-cloud-hub/src/**/__tests__`.

Run:

```bash
cd apps/my-cloud-hub
pnpm test
```

Use focused tests for backend route changes. For frontend-only static tool changes,
manual browser checks or small script-based checks are usually more practical unless a
test harness already exists for that tool.

## Cloudflare Notes

This project is strongly tied to Cloudflare:

- `apps/my-cloud-hub` is a Worker service deployed by Wrangler.
- `apps/pages` is deployed to Cloudflare Pages.
- `apps/education-dashboard` is deployed to Cloudflare Workers with OpenNext.
- D1 migrations are managed through Wrangler.
- KV and Vectorize bindings are declared in `wrangler.toml`.
- Email Worker support is present through the Worker `email` export.

Before changing Cloudflare config, verify current Wrangler schema/docs because binding
syntax and supported options can change over time.

## CI/CD

GitHub Actions deploy from `main`:

- `.github/workflows/deploy-pages.yml`: deploys `apps/pages` to the Cloudflare Pages
  project named `pages`.
- `.github/workflows/deploy-education-dashboard.yml`: builds and deploys
  `apps/education-dashboard` to `edu.mm0708.top`.

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Domain convention:

- Static/simple tools live under `mm0708.top/tools/<tool-name>`.
- Full applications should live under `<app>.mm0708.top`.
- If a full application also needs a portal path, add a lightweight redirect page under
  `apps/pages/tools/<tool-name>`.

## Agent Working Notes

- Prefer existing folder patterns. Most frontend tools are plain `index.html`,
  `style.css`, and `script.js`.
- Keep frontend tools self-contained unless there is a clear shared dependency.
- Backend route additions should be mounted in `apps/my-cloud-hub/src/index.ts`.
- Database changes should update `packages/database/src/schema.ts` and generate a
  migration.
- Do not commit generated dependencies such as `node_modules`.
- Do not expose secrets in responses, docs, screenshots, tests, or new source files.
- Several existing Markdown files appear to have mojibake/encoding issues. Use source
  code and package/config files as the reliable source of truth.
- The repository may contain local/generated state under `.wrangler`; treat it as local
  tooling state unless explicitly needed.
