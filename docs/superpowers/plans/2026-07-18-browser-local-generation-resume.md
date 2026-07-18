# Browser-Local Generation Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a product generation alive across a normal page refresh and restore its progress/result from browser-local state.

**Architecture:** The page creates an IndexedDB task and delegates the existing generation request to an active Service Worker. The Service Worker writes completion/failure to the same IndexedDB database, while each page instance polls the local task and restores the newest processing task after reload.

**Tech Stack:** Browser Service Worker, IndexedDB, vanilla JavaScript, Node test runner, Puppeteer, Cloudflare static assets.

---

### Task 1: Extend local task state for resumable jobs

**Files:**
- Modify: `apps/product-swap/local-history.js`
- Modify: `apps/product-swap/tests/local-history.test.js`

- [ ] **Step 1: Write failing tests**

Assert that the public API includes `latestProcessingTask`, `touchTask`, and a task lookup that never bulk-loads assets for list polling.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/local-history.test.js`

Expected: FAIL because the resumable helpers are not exported.

- [ ] **Step 3: Implement minimal helpers**

Add helpers with these signatures:

```js
async function latestProcessingTask(taskType = 'product_swap')
async function touchTask(taskId, updatedAt = Date.now())
```

`latestProcessingTask` reads task metadata only, filters by the local user and status, and returns the newest match. `touchTask` updates only `updatedAt` while preserving the task state.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/local-history.test.js`

Expected: all local-history tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/product-swap/local-history.js apps/product-swap/tests/local-history.test.js
git commit -m "feat: expose resumable local task state"
```

### Task 2: Add the generation Service Worker

**Files:**
- Create: `apps/product-swap/generation-worker.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build-contract.test.js`
- Create: `apps/product-swap/tests/generation-worker.test.js`

- [ ] **Step 1: Write failing worker contract tests**

Assert that the worker handles only the versioned message below, calls the generation endpoint once, and routes successful/failed responses to `LocalTaskHistory`.

```js
{
  type: 'product-swap:start',
  version: 1,
  taskId,
  apiUrl,
  payload
}
```

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/generation-worker.test.js tests/build-contract.test.js`

Expected: FAIL because `generation-worker.js` is missing.

- [ ] **Step 3: Implement the worker**

Use `importScripts('/local-history.js')`, validate message fields, deduplicate running task IDs in memory, and call:

```js
event.waitUntil(runGeneration(message));
```

`runGeneration` performs one credentialed JSON POST, maps the existing response shape, and invokes `completeTask` or `failTask`. It never installs a `fetch` handler or static cache.

- [ ] **Step 4: Include the worker in deployment output**

Add `generation-worker.js` to the static file list in `build.mjs` and assert it exists in `dist`.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test tests/generation-worker.test.js tests/build-contract.test.js`

```bash
git add apps/product-swap/generation-worker.js apps/product-swap/build.mjs apps/product-swap/tests
git commit -m "feat: run generations in a service worker"
```

### Task 3: Poll and restore tasks in the generation page

**Files:**
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`

- [ ] **Step 1: Write failing controller tests**

Cover Service Worker registration, one-second bounded polling, terminal state mapping, refresh restoration, and fallback to the current synchronous request when Service Worker is unavailable.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/frontend-contract.test.js`

Expected: FAIL because no Service Worker registration or polling controller exists.

- [ ] **Step 3: Implement registration and dispatch**

Register `/generation-worker.js`, await `navigator.serviceWorker.ready`, post the versioned message to `registration.active`, and begin polling the exact local task ID. Do not send the same task twice after a reload.

- [ ] **Step 4: Implement UI restoration**

On boot, call `latestProcessingTask('product_swap')`. If found, show the generating state, poll it, and render its result/error when terminal. Read its saved assets only when restoring visible input previews.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test tests/frontend-contract.test.js`

```bash
git add apps/product-swap/script.js apps/product-swap/tests/frontend-contract.test.js
git commit -m "feat: restore generation polling after refresh"
```

### Task 4: Prove refresh recovery in a real browser

**Files:**
- Modify: `apps/product-swap/tests/browser-smoke.js`

- [ ] **Step 1: Add a failing refresh scenario**

Delay the mocked generation response, start one generation, wait until the local task is processing, reload the page, and assert the server observed exactly one generation POST.

- [ ] **Step 2: Verify the scenario fails before integration is complete**

Run: `npm run test:browser`

Expected: FAIL when the refreshed page does not recover the same task.

- [ ] **Step 3: Complete integration until the test passes**

Assert the refreshed page shows generating state, then displays the delayed result and records a completed task without `/api/tasks` requests.

- [ ] **Step 4: Run full frontend verification and commit**

Run:

```bash
npm test
npm run build
npm run test:browser
```

Expected: all commands exit 0.

```bash
git add apps/product-swap
git commit -m "test: cover generation recovery after refresh"
```

### Task 5: Verify and deploy

**Files:**
- No source changes expected.

- [ ] **Step 1: Run backend regression tests**

Run: `npm test -- --run src/projects/product-swap src/index.test.ts` from `apps/my-cloud-hub`.

Expected: all related tests pass; the live provider test remains skipped unless explicitly enabled.

- [ ] **Step 2: Review the final diff**

Run: `git diff --check` and request an independent code review focused on duplicate billing, Service Worker lifecycle, and IndexedDB consistency.

- [ ] **Step 3: Push and deploy**

Push `main`, deploy `apps/my-cloud-hub`, then build and deploy `apps/product-swap` using Wrangler.

- [ ] **Step 4: Verify production**

Confirm `/`, `/history.html`, `/generation-worker.js`, and `/local-history.js` return HTTP 200 and that deployed worker source contains the versioned message protocol.

