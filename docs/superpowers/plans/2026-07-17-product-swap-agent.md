# Product Swap Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe conversational product-image refinement, real Volcengine providers, a reusable image skill, and Cloudflare deployment.

**Architecture:** Keep the browser and Worker stateless. Use Doubao chat to compose an edit prompt and the image endpoint to generate each revision. Keep Codex CLI local-only behind a recursion guard.

**Tech Stack:** Hono, Cloudflare Workers, Volcengine Ark HTTP APIs, vanilla HTML/CSS/JavaScript, Node test runner, Vitest, Wrangler.

---

### Task 1: Product swap prompt and Ark provider

**Files:**
- Create: `apps/my-cloud-hub/src/projects/product-swap/prompt-builder.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/provider.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/volcano-provider.ts`
- Test: `apps/my-cloud-hub/src/projects/product-swap/__tests__/volcano-provider.test.ts`

- [ ] Write failing tests for initial and refinement prompts, chat completion mapping, multi-image generation, and Ark errors.
- [ ] Run the focused Vitest files and confirm the new tests fail.
- [ ] Implement bounded inputs, chat prompt composition, and image response mapping.
- [ ] Run the focused Vitest files and confirm they pass.
- [ ] Commit the provider implementation.

### Task 2: Stable conversational API

**Files:**
- Modify: `apps/my-cloud-hub/src/projects/product-swap/router.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`
- Modify: `apps/my-cloud-hub/src/index.ts`

- [ ] Write failing tests for refinement fields, conversation IDs, bounded history, and stable provider failures.
- [ ] Run the router tests and confirm failure.
- [ ] Extend the request and response contract without breaking initial generation.
- [ ] Run focused and full backend tests.
- [ ] Commit the API changes without staging unrelated worktree edits.

### Task 3: Local image skill and loop guard

**Files:**
- Create: `apps/product-swap/skills/product-swap-image/SKILL.md`
- Create: `apps/product-swap/skills/product-swap-image/agents/openai.yaml`
- Modify: `apps/product-swap/server/codex-cli-provider.js`
- Modify: `apps/product-swap/server/dev-server.js`
- Modify: `apps/product-swap/tests/codex-cli-provider.test.js`
- Modify: `apps/product-swap/tests/dev-server.test.js`

- [ ] Write failing tests for the active-generation rejection, child depth environment, refinement image, and no-recursion prompt.
- [ ] Run the local tests and confirm failure.
- [ ] Initialize and complete the skill, then implement the guard and refinement path.
- [ ] Validate the skill with `quick_validate.py` and run local tests.
- [ ] Commit the local safety and skill changes.

### Task 4: Conversational refinement UI

**Files:**
- Modify: `apps/product-swap/index.html`
- Modify: `apps/product-swap/style.css`
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`
- Modify: `apps/product-swap/tests/browser-smoke.js`

- [ ] Write failing contract tests for the chat composer and refinement payload.
- [ ] Run frontend tests and confirm failure.
- [ ] Add a bounded chat timeline, correction input, refine action, and loading/error states.
- [ ] Run unit and browser smoke tests and inspect the screenshot.
- [ ] Commit the UI changes.

### Task 5: Cloudflare packaging and deployment

**Files:**
- Create: `apps/product-swap/build.mjs`
- Create: `apps/product-swap/worker/index.ts`
- Create: `apps/product-swap/wrangler.jsonc`
- Modify: `apps/product-swap/package.json`
- Modify: `apps/my-cloud-hub/wrangler.toml`

- [ ] Add a build test that confirms only public assets reach `dist` and production API configuration is injected.
- [ ] Build the static app and run Wrangler type/config validation.
- [ ] Configure the two supplied endpoint IDs as non-secret variables and keep `DOUBAO_API_KEY` as a secret.
- [ ] Deploy the hub API and the frontend Worker, then smoke-test both public URLs.
- [ ] Commit deployment configuration and record any missing external credential as a deployment blocker, not as an implementation failure.

### Task 6: Final verification

**Files:**
- Modify only files needed to resolve new regressions.

- [ ] Run product-swap unit tests, backend focused tests, browser smoke, build, and type checks.
- [ ] Compare failures against the recorded pre-existing baseline.
- [ ] Confirm no API key or generated secret is staged.
- [ ] Review the final diff and git status, preserving unrelated user changes.
