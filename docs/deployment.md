# Deployment

This repository deploys to Cloudflare from GitHub Actions.

## Domains

- `https://mm0708.top`: main tools portal from `apps/pages`.
- `https://edu.mm0708.top`: education dashboard from `apps/education-dashboard`.
- `https://mm0708.top/tools/edu`: portal path that redirects to `https://edu.mm0708.top`.

For simple static tools, add files under `apps/pages/tools/<tool-name>` and link them
from `apps/pages/index.html`.

For full applications with their own build/runtime, add a dedicated app under `apps/`
and deploy it to a subdomain such as `<app>.mm0708.top`.

## Required GitHub Secrets

Add these secrets to the GitHub repository:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token must be able to deploy Cloudflare Pages and Workers, and read the zone for
`mm0708.top`. The education dashboard also uses the existing D1 database configured in
`apps/education-dashboard/wrangler.jsonc`.

## Workflows

- `.github/workflows/deploy-pages.yml`
  - Deploys `apps/pages` to the Cloudflare Pages project named `pages`.
  - Runs on pushes to `main` that change `apps/pages/**`.

- `.github/workflows/deploy-education-dashboard.yml`
  - Builds the Next.js app with OpenNext for Cloudflare.
  - Deploys the Worker configured by `apps/education-dashboard/wrangler.jsonc`.
  - Runs on pushes to `main` that change `apps/education-dashboard/**`.

Both workflows can also be run manually with `workflow_dispatch`.
