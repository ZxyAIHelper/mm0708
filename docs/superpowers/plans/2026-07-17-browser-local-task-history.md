# Browser-Local Task History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the D1/R2 task archive with an IndexedDB-only history that works in the same browser and deploys without enabling R2.

**Architecture:** `local-history.js` owns the local user ID, IndexedDB schema, task lifecycle, assets, pagination, and expiry. The generation page records tasks around the existing remote generation request; the history page reads only the local repository. The Worker returns to a stateless generation API and no longer mounts or binds remote task-history resources.

**Tech Stack:** Browser IndexedDB, localStorage, vanilla JavaScript, Hono Worker, Node test runner, Vitest, Puppeteer browser smoke tests, Wrangler.

---

### Task 1: Browser-local repository

**Files:**
- Create: `apps/product-swap/local-history.js`
- Create: `apps/product-swap/tests/local-history.test.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build.test.js`

- [ ] **Step 1: Write failing repository contract tests**

Assert exported constants and helpers for `product_swap`, 30-day expiry, browser user creation, Data URL conversion, stable task/asset IDs, and build inclusion:

```js
assert.equal(history.ASSET_TTL_MS, 30 * 24 * 60 * 60 * 1000);
assert.equal(history.taskTitle('product_swap'), '一键换产品');
assert.equal(history.isExpired({ expiresAt: 100 }, 100), true);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/local-history.test.js tests/build.test.js`
Expected: FAIL because `local-history.js` and its build output do not exist.

- [ ] **Step 3: Implement the repository**

Create IndexedDB database `product_swap_history_v1` with `tasks` and `assets` stores. Export:

```js
ensureUserId();
startTask({ taskType, title, input, images });
completeTask(taskId, result);
failTask(taskId, code, message);
listTasks({ taskType, cursor, limit });
getTask(taskId);
deleteTask(taskId);
cleanupExpiredAssets(now);
dataUrlToBlob(source);
```

Use localStorage key `product_swap_local_user_id`; store input images as Blob records; store output as `sourceUrl` only. When cleaning, replace expired Blob data with `blob: null` and `deletedAt`, retaining metadata.

- [ ] **Step 4: Add `local-history.js` to the static build and run GREEN tests**

Run: `node --test tests/local-history.test.js tests/build.test.js`
Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/product-swap/local-history.js apps/product-swap/tests/local-history.test.js apps/product-swap/build.mjs apps/product-swap/tests/build.test.js
git commit -m "feat: add browser-local task repository"
```

### Task 2: Record product generation locally

**Files:**
- Modify: `apps/product-swap/index.html`
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`

- [ ] **Step 1: Write failing lifecycle contract tests**

Assert `index.html` loads `/local-history.js` before `/script.js`, and `script.js` calls `startTask` before `apiFetch`, then `completeTask` or `failTask` after the response.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/frontend-contract.test.js`
Expected: FAIL because the generation page does not call the local repository.

- [ ] **Step 3: Implement local task lifecycle**

At initial generation, persist target/product/scene and sanitized requirements. At refinement, also persist the prior output URL as a `previous` asset. Complete with `imageUrl`, conversation ID, assistant message and archive warning; fail with the stable API error code/message. A local storage failure must not block image generation; show it as the existing archive notice.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/frontend-contract.test.js`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/product-swap/index.html apps/product-swap/script.js apps/product-swap/tests/frontend-contract.test.js
git commit -m "feat: record product tasks in the browser"
```

### Task 3: Read history from IndexedDB

**Files:**
- Modify: `apps/product-swap/history.html`
- Rewrite: `apps/product-swap/history.js`
- Modify: `apps/product-swap/tests/history-contract.test.js`
- Modify: `apps/product-swap/tests/browser-smoke.js`

- [ ] **Step 1: Write failing local-history page tests**

Assert the page no longer references `/api/tasks`, calls `LocalTaskHistory.listTasks/getTask/deleteTask`, creates Blob URLs for local assets, uses direct output URLs, and handles `error` events as expired placeholders.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/history-contract.test.js`
Expected: FAIL while the page still uses the remote task API.

- [ ] **Step 3: Rewrite the page data adapter**

Keep the existing filters, cards, detail drawer, pagination and delete UI. Replace credentialed fetch calls with local repository calls. Revoke Blob URLs on rerender/unload. Treat assets with `deletedAt`, passed `expiresAt`, missing Blob, or failed remote URL load as expired.

- [ ] **Step 4: Update browser smoke coverage**

Generate and refine in the real browser, navigate to `/history.html`, verify two local cards and a detail view with input/output assets, then seed or age one asset and verify the expired state.

- [ ] **Step 5: Run and verify GREEN**

Run: `node --test tests/history-contract.test.js && npm run test:browser`
Expected: contract and browser smoke tests pass with zero browser errors.

- [ ] **Step 6: Commit**

```bash
git add apps/product-swap/history.html apps/product-swap/history.js apps/product-swap/tests/history-contract.test.js apps/product-swap/tests/browser-smoke.js
git commit -m "feat: read task history from indexeddb"
```

### Task 4: Remove remote task storage from Worker runtime

**Files:**
- Modify: `apps/my-cloud-hub/src/index.ts`
- Modify: `apps/my-cloud-hub/src/index.test.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/router.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`
- Modify: `apps/my-cloud-hub/wrangler.toml`

- [ ] **Step 1: Write failing stateless-worker tests**

Assert the Worker does not mount `/api/tasks`, does not declare `TASK_ASSETS`, has no scheduled cleanup, and product generation succeeds with an environment that only contains the provider configuration.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- --run src/projects/product-swap src/index.test.ts`
Expected: FAIL while remote task storage remains wired.

- [ ] **Step 3: Remove runtime wiring**

Make the product-swap router use a no-op archive by default, remove task-history imports/routes/scheduled handler from `index.ts`, remove R2 and cron configuration, and retain existing public CORS behavior for other APIs. Leave the already-applied migration file as historical schema only.

- [ ] **Step 4: Run and verify GREEN plus Worker bundle**

Run: `npm test -- --run src/projects/product-swap src/index.test.ts`
Run: `node -e "require('esbuild').build({entryPoints:['src/index.ts'],bundle:true,write:false,platform:'browser',format:'esm',target:'es2022'})"`
Expected: focused tests and bundle pass without R2 bindings.

- [ ] **Step 5: Commit**

```bash
git add apps/my-cloud-hub/src/index.ts apps/my-cloud-hub/src/index.test.ts apps/my-cloud-hub/src/projects/product-swap/router.ts apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts apps/my-cloud-hub/wrangler.toml
git commit -m "refactor: remove remote task storage runtime"
```

### Task 5: Verify, push and deploy

**Files:**
- Verify all files above; no new production files.

- [ ] **Step 1: Run complete feature verification**

Run backend focused tests, frontend tests, build, browser smoke, `git diff --check`, and confirm a clean worktree. Existing unrelated couplet/typecheck failures must be reported separately and their paths confirmed unchanged.

- [ ] **Step 2: Push `main`**

```bash
git push origin main
```

- [ ] **Step 3: Deploy stateless Worker and frontend**

```bash
cd apps/my-cloud-hub && npm run deploy
cd ../product-swap && npm run deploy
```

Expected: both Wrangler deployments succeed without an R2 subscription.

- [ ] **Step 4: Run online smoke checks**

Verify `https://api.mm0708.top/`, `https://product-swap.mm0708.top/`, and `https://product-swap.mm0708.top/history.html`; confirm the generation page and local task center load successfully.
