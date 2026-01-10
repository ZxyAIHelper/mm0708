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
