# Education Dashboard Demo

一个基于 Next.js App Router 的教育质量看板演示项目壳子，当前包含教师首页占位页，以及供后续任务扩展的最小 Prisma + SQLite 占位 schema / seed。

## Quick Start

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`，根路由会跳转到 `/teacher`。

如果需要初始化本地演示数据库，占位脚本已可执行：

```bash
pnpm setup:demo
```

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm db:push
pnpm db:seed
pnpm setup:demo
```

当前阶段只完成基础应用脚手架、教师首页占位页，以及最小可运行的 Prisma/SQLite 占位数据层；正式业务模型、真实 seed 数据和分析页面仍在后续任务中实现。
