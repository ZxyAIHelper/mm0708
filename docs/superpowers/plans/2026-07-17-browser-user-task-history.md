# Browser Anonymous User Task History Implementation Plan

> Superseded by `2026-07-17-browser-local-task-history.md`; the deployed runtime no longer uses D1/R2 task storage.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each browser an automatic anonymous identity and persist generic generation tasks, their text, and 30-day input/output images for a reusable task center.

**Architecture:** `my-cloud-hub` owns an HttpOnly parent-domain session, generic D1 task metadata, and private R2 assets. `product-swap` records every synchronous generation through that service and exposes a standalone history page that reads protected images as Blob URLs. A daily Worker cron deletes expired R2 objects while leaving D1 task text intact.

**Tech Stack:** Cloudflare Workers, Hono, D1, R2, TypeScript, vanilla HTML/CSS/JavaScript, Vitest, Node test runner, Puppeteer smoke tests.

---

## File Structure

- Create `packages/database/migrations/0004_task_history.sql`: anonymous users, generic tasks, task assets, and indexes.
- Create `apps/my-cloud-hub/src/projects/task-history/types.ts`: shared task/session/storage contracts.
- Create `apps/my-cloud-hub/src/projects/task-history/session.ts`: opaque session generation, hashing, Cookie parsing and setting.
- Create `apps/my-cloud-hub/src/projects/task-history/service.ts`: D1/R2 task lifecycle, image decoding/archive, lookup, deletion and expiry cleanup.
- Create `apps/my-cloud-hub/src/projects/task-history/router.ts`: generic task session/list/detail/delete/asset endpoints.
- Create `apps/my-cloud-hub/src/projects/task-history/cleanup.ts`: scheduled expired-asset cleanup entry.
- Create `apps/my-cloud-hub/src/projects/task-history/__tests__/session.test.ts`: identity behavior.
- Create `apps/my-cloud-hub/src/projects/task-history/__tests__/router.test.ts`: authorization, pagination, detail, expiry and deletion behavior.
- Modify `apps/my-cloud-hub/src/projects/product-swap/router.ts`: create/finalize/fail tasks and archive inputs/outputs.
- Modify `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`: verify task lifecycle and non-blocking output archive failure.
- Modify `apps/my-cloud-hub/src/index.ts`: credentialed CORS, generic task route, R2 binding type and scheduled handler.
- Modify `apps/my-cloud-hub/wrangler.toml`: R2 binding and daily cron.
- Create `apps/product-swap/api-client.js`: credentialed API requests and stable error parsing.
- Create `apps/product-swap/history.html`: reusable task center shell.
- Create `apps/product-swap/history.js`: task filters, cursor pagination, authenticated Blob image loading, detail layer and delete.
- Modify `apps/product-swap/index.html`: task-record navigation and shared API client.
- Modify `apps/product-swap/script.js`: use credentialed API calls, initialize session, surface archive warning.
- Modify `apps/product-swap/style.css`: navigation, task cards, states and responsive detail layer.
- Modify `apps/product-swap/build.mjs`: include new static files.
- Modify/add tests under `apps/product-swap/tests`: API-client contract, build outputs, history markup and browser smoke flow.

### Task 1: Database and Cloudflare Bindings

- [ ] **Step 1: Add a migration test/check expectation**

Extend the repository validation by asserting the migration contains `anonymous_users`, `generation_tasks`, `task_assets`, `(user_id, created_at)` indexes, and foreign-key cascades. If no migration test harness exists, use the exact verification command in Step 4.

- [ ] **Step 2: Run the check and verify the new schema is absent**

Run:

```powershell
rg -n "anonymous_users|generation_tasks|task_assets" packages/database/migrations
```

Expected: no matches for migration `0004_task_history.sql`.

- [ ] **Step 3: Create the schema and bindings**

Create `0004_task_history.sql` with text UUID primary keys, `session_hash` uniqueness, generic `task_type/status/input_json/result_json`, asset `role/r2_key/expires_at/deleted_at`, foreign keys, and list/expiry indexes. Add:

```toml
[[r2_buckets]]
binding = "TASK_ASSETS"
bucket_name = "my-cloud-hub-task-assets"

[triggers]
crons = ["0 3 * * *"]
```

to `wrangler.toml`.

- [ ] **Step 4: Verify schema and Wrangler configuration**

Run:

```powershell
rg -n "anonymous_users|generation_tasks|task_assets|TASK_ASSETS|crons" packages/database/migrations/0004_task_history.sql apps/my-cloud-hub/wrangler.toml
```

Expected: all five concepts appear.

- [ ] **Step 5: Commit**

```powershell
git add packages/database/migrations/0004_task_history.sql apps/my-cloud-hub/wrangler.toml
git commit -m "feat: add task history storage schema"
```

### Task 2: Anonymous Session Foundation

- [ ] **Step 1: Write failing session tests**

Test that a missing Cookie produces a new anonymous user ID and `mm_anonymous_session`; a valid Cookie reuses the existing user; a stable `X-Browser-Session` bootstrap token converges cookie-less tabs on the same user; an unknown/invalid Cookie rotates to a new session; production Cookie is host-only and includes `Secure`, `HttpOnly`, `SameSite=Lax`, and a one-year max age; localhost omits `Secure`.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
npm test -- --run src/projects/task-history/__tests__/session.test.ts
```

from `apps/my-cloud-hub`.

Expected: FAIL because `task-history/session.ts` does not exist.

- [ ] **Step 3: Implement session contracts and helpers**

Define `TaskHistoryEnv` with `DB` and `TASK_ASSETS`, `AnonymousUser`, `TaskRecord`, and `TaskAsset` in `types.ts`. Implement base64url random token generation using `crypto.getRandomValues`, SHA-256 hashing using `crypto.subtle.digest`, strict token validation, D1 lookup/update/insert, and Hono Cookie helpers in `session.ts`. Expose `ensureAnonymousSession(c)` returning the user and setting a replacement Cookie only when needed.

- [ ] **Step 4: Run the focused tests**

Expected: all session tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/task-history
git commit -m "feat: add anonymous browser sessions"
```

### Task 3: Generic Task Service and API

- [ ] **Step 1: Write failing router/service tests**

Use an injected in-memory `TaskHistoryService` fake to cover:

```text
POST /session creates or restores identity
GET / lists only the current user and forwards type/cursor/limit
GET /:id rejects another user's task
GET /:id/assets/:assetId returns 410 after expiresAt
DELETE /:id removes owned assets before metadata
```

Also unit-test Data URL validation for JPEG/PNG/WebP, 10 MB input limit, 20 MB downloaded output limit, and a 30-day `expires_at`.

- [ ] **Step 2: Run tests and confirm failure**

Run the task-history test directory with Vitest. Expected: FAIL for missing service/router.

- [ ] **Step 3: Implement the task service**

Implement focused methods:

```ts
startTask(userId, draft): Promise<TaskRecord>
archiveDataUrl(task, role, source): Promise<TaskAsset>
archiveRemoteImage(task, role, url): Promise<TaskAsset>
archiveOwnedResult(task, sourceUrl): Promise<TaskAsset>
completeTask(taskId, result): Promise<void>
failTask(taskId, code, message): Promise<void>
listTasks(userId, query): Promise<TaskPage>
getTask(userId, taskId): Promise<TaskDetail | null>
getAsset(userId, taskId, assetId, now): Promise<R2ObjectBody | 'expired' | null>
deleteTask(userId, taskId): Promise<boolean>
cleanupExpiredAssets(now, limit): Promise<number>
```

D1 stores only text metadata; R2 keys use `tasks/{userId}/{taskId}/{assetId}.{ext}`. Remote output downloads must reject redirects to unsupported protocols, non-image MIME and payloads over 20 MB.

- [ ] **Step 4: Implement the Hono router**

Add session, cursor list, detail, private asset, and delete endpoints. Asset responses use `Cache-Control: private, max-age=300`; expired assets return `{ error: { code: "ASSET_EXPIRED" } }` with 410.

- [ ] **Step 5: Run focused tests and TypeScript checks**

Run Vitest plus:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/task-history
git commit -m "feat: add generic task history api"
```

### Task 4: Product Swap Archiving

- [ ] **Step 1: Extend product router tests**

Inject a fake task history adapter and assert: identity is established before provider usage; `product_swap` task starts with sanitized requirements; target/product/scene/previous roles archive when present; success archives output and completes the task; provider errors fail the task; output archive errors preserve a successful generation response with `archiveWarning`; input archive errors do not call the provider.

- [ ] **Step 2: Run product router tests and confirm failure**

Expected: new assertions FAIL because the route does not record tasks.

- [ ] **Step 3: Integrate the generic service**

Extend `ProductSwapEnv` with D1/R2 bindings, inject a small `ProductSwapTaskArchive` boundary for tests, and use the production task service by default. Return `taskId` and nullable `archiveWarning` without removing existing response fields.

- [ ] **Step 4: Run product router and provider tests**

Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/product-swap
git commit -m "feat: archive product swap tasks"
```

### Task 5: CORS, Routing and Scheduled Cleanup

- [ ] **Step 1: Add integration tests for trusted origins and cleanup**

Assert credentialed responses allow `https://product-swap.mm0708.top`, reject unrelated origins, mount `/api/tasks`, and scheduled cleanup calls `cleanupExpiredAssets` with the current timestamp.

- [ ] **Step 2: Run tests and confirm failure**

Expected: FAIL because the route and scheduled handler are not mounted.

- [ ] **Step 3: Implement application wiring**

Configure Hono CORS with explicit trusted `mm0708.top` origins/local development, `credentials: true`, and required methods/headers. Add `TASK_ASSETS: R2Bucket`, mount the generic router, and export a `scheduled` handler that deletes expired assets in bounded batches.

- [ ] **Step 4: Run all backend tests and typecheck**

Run:

```powershell
npm test -- --run
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/my-cloud-hub/src/index.ts apps/my-cloud-hub/src/projects/task-history
git commit -m "feat: wire task history worker services"
```

### Task 6: Credentialed Frontend API Client

- [ ] **Step 1: Add failing Node contract tests**

Test API base resolution, `credentials: "include"`, JSON error mapping, session bootstrap, and compatibility with Node `module.exports`.

- [ ] **Step 2: Run frontend tests and confirm failure**

Run `npm test` from `apps/product-swap`. Expected: FAIL because `api-client.js` is missing.

- [ ] **Step 3: Implement `api-client.js` and integrate generation calls**

Expose `resolveApiBase`, `apiFetch`, `ensureSession`, and `assetUrl`. Load it before `script.js`; replace direct generate/refine `fetch` calls with `apiFetch`; bootstrap the anonymous session on page load; display `archiveWarning` as a non-blocking message while leaving generated output usable.

- [ ] **Step 4: Run frontend unit tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/product-swap/api-client.js apps/product-swap/index.html apps/product-swap/script.js apps/product-swap/tests
git commit -m "feat: add credentialed task api client"
```

### Task 7: Task Center Page

- [ ] **Step 1: Add failing history/build contract tests**

Assert `history.html` contains the all-task header, type filter, list, loading/error/empty states, load-more control and detail dialog/layer; `build.mjs` copies `api-client.js`, `history.html`, and `history.js`; generation page links to `/history.html`.

- [ ] **Step 2: Run tests and confirm failure**

Expected: FAIL for missing history assets and build outputs.

- [ ] **Step 3: Build the history shell and behavior**

Implement cursor pagination, type filtering, status labels, task cards, output-or-target preview selection, authenticated image fetch to Blob URL, full detail with classified input/output assets, downloads, delete confirmation, retry, empty state, and cleanup of every created Blob URL.

- [ ] **Step 4: Add responsive styling**

Match the existing dark navy/cyan visual language. Use one column below 700px and two columns above it; use a full-viewport accessible detail layer with visible focus, close button and scroll containment. Expired assets render a stable “图片已过期” card without hiding text.

- [ ] **Step 5: Run unit/build tests**

Run:

```powershell
npm test
npm run build
```

Expected: PASS and all new assets appear under `dist/`.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/history.html apps/product-swap/history.js apps/product-swap/style.css apps/product-swap/build.mjs apps/product-swap/tests
git commit -m "feat: add product task center"
```

### Task 8: Browser Smoke Test and Final Verification

- [ ] **Step 1: Extend the browser smoke fixture**

Mock session, generate, task list, task detail, asset Blob, expired asset and delete endpoints. Verify generating creates a task link, task cards show input/output details, expired images show the placeholder, and delete removes the card.

- [ ] **Step 2: Run the browser test and fix only observed failures**

Run `npm run test:browser` from `apps/product-swap`. Expected: PASS.

- [ ] **Step 3: Run complete verification**

Run:

```powershell
npm test -- --run
npx tsc --noEmit
```

in `apps/my-cloud-hub`, then:

```powershell
npm test
npm run build
npm run test:browser
```

in `apps/product-swap`.

Expected: every command exits 0.

- [ ] **Step 4: Inspect the final diff**

Run `git diff --check`, `git status --short`, and a bounded `git diff --stat`. Confirm no secrets, generated dependency files, temporary screenshots or unrelated edits are included.

- [ ] **Step 5: Commit final verification fixes**

```powershell
git add apps/my-cloud-hub apps/product-swap packages/database/migrations/0004_task_history.sql
git commit -m "test: verify anonymous task history flow"
```
