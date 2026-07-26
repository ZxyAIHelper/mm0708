# Dish Ranking Deterministic Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AI-generated dish-ranking images with AI-produced ordering/comments and a deterministic browser Canvas renderer.

**Architecture:** The Cloudflare API validates dish images, asks the existing Doubao-compatible multimodal endpoint for strict ranking JSON, and returns only safe structured data. The browser normalizes that data with program-owned commercial rules, renders the original images into a fixed five-tier Canvas template, and feeds the resulting PNG into the existing preview/history/download path.

**Tech Stack:** TypeScript, Hono, Vitest, browser JavaScript, Canvas 2D, Node test runner, Puppeteer.

---

## File structure

- Create `apps/my-cloud-hub/src/projects/product-swap/dish-ranking-draft.ts`: request/response types, validation, prompt construction and model JSON parsing.
- Create `apps/my-cloud-hub/src/projects/product-swap/dish-ranking-provider.ts`: one bounded multimodal model request with no automatic retry.
- Modify `apps/my-cloud-hub/src/projects/product-swap/router.ts`: expose `POST /dish-ranking-draft`.
- Create `apps/my-cloud-hub/src/projects/product-swap/__tests__/dish-ranking-draft.test.ts`: backend contract and prompt tests.
- Modify `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`: route success and error mapping.
- Create `apps/product-swap/dish-ranking-client.js`: browser response validation, deterministic completion and API request.
- Create `apps/product-swap/dish-ranking-renderer.js`: fixed five-tier Canvas layout and PNG generation.
- Modify `apps/product-swap/script.js`: select the deterministic path, store its result through existing history/version APIs, and disable refinement.
- Modify `apps/product-swap/template-packs/dish-ranking-guide/manifest.js`: expose only the tier layout and zero image-generation credits.
- Modify `apps/product-swap/create.html`, `apps/product-swap/build.mjs`, `apps/product-swap/server/dev-server.js`: load and publish the two browser modules.
- Create `apps/product-swap/tests/dish-ranking-client.test.js`: client contract, own-dish override and fallback tests.
- Create `apps/product-swap/tests/dish-ranking-renderer.test.js`: deterministic geometry and drawing tests.
- Modify `apps/product-swap/tests/dish-ranking-browser-smoke.js`: intercept the draft endpoint and verify a decodable exported PNG without a generation request.

### Task 1: Backend ranking contract

**Files:**
- Create: `apps/my-cloud-hub/src/projects/product-swap/dish-ranking-draft.ts`
- Create: `apps/my-cloud-hub/src/projects/product-swap/__tests__/dish-ranking-draft.test.ts`

- [ ] **Step 1: Write failing request and response validation tests**

Cover a valid 1–12 item request, at least one owned item, library items not owned, unique `dish-N` IDs, strict keys, accepted image data URLs, and comments containing 2–6 visible Chinese characters. Assert unknown refs, duplicate refs, unknown tiers, extra keys and invalid comments are rejected.

```ts
const input = validateDishRankingDraftRequest({
    templateId: 'dish-ranking-guide',
    dishes: [
        { id: 'dish-0', image: PNG_DATA_URL, owned: true, source: 'user' },
        { id: 'dish-1', image: PNG_DATA_URL, owned: false, source: 'library' },
    ],
})
expect(input.dishes).toHaveLength(2)

expect(() => parseDishRankingDraft({
    version: 1,
    items: [
        { refId: 'dish-0', tier: 'top', order: 0, comment: '闭眼冲' },
        { refId: 'dish-1', tier: 'good', order: 0, comment: '挺稳的' },
    ],
}, input.dishes.map((dish) => dish.id))).not.toThrow()
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run src/projects/product-swap/__tests__/dish-ranking-draft.test.ts`

Expected: FAIL because `dish-ranking-draft.ts` does not exist.

- [ ] **Step 3: Implement strict types, validators and prompt builder**

Export `DishRankingDraftRequest`, `DishRankingDraft`, `DishRankingDraftValidationError`, `validateDishRankingDraftRequest`, `parseDishRankingDraftContent`, and `buildDishRankingMessages`. The prompt must say that AI has exactly two jobs: assign tier/order and write one short comment per supplied ref. It must forbid page-layout instructions, unverifiable facts and extra JSON fields.

```ts
export type DishTier = 'top' | 'great' | 'good' | 'average' | 'poor'
export type DishRankingItem = {
    refId: string
    tier: DishTier
    order: number
    comment: string
}
export type DishRankingDraft = { version: 1; items: DishRankingItem[] }
```

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run src/projects/product-swap/__tests__/dish-ranking-draft.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the backend contract**

```bash
git add apps/my-cloud-hub/src/projects/product-swap/dish-ranking-draft.ts apps/my-cloud-hub/src/projects/product-swap/__tests__/dish-ranking-draft.test.ts
git commit -m "feat: define dish ranking draft contract"
```

### Task 2: One-shot multimodal provider and route

**Files:**
- Create: `apps/my-cloud-hub/src/projects/product-swap/dish-ranking-provider.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/router.ts`
- Create: `apps/my-cloud-hub/src/projects/product-swap/__tests__/dish-ranking-provider.test.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`

- [ ] **Step 1: Write failing provider and router tests**

Inject a mock fetch and assert exactly one `/chat/completions` call, `stream: false`, the existing server-side bearer secret, and one `image_url` content part per dish. Assert invalid model JSON is returned as `INVALID_DISH_RANKING_DRAFT` without a second request. Inject a `dishRankingGenerator` into the router and assert a successful response contains only `success`, `draft`, `provider`, and `requestId`.

```ts
expect(fetchMock).toHaveBeenCalledTimes(1)
expect(body.messages[1].content.filter(
    (part: { type: string }) => part.type === 'image_url',
)).toHaveLength(2)
```

- [ ] **Step 2: Run focused backend tests and verify failure**

Run: `npx vitest run src/projects/product-swap/__tests__/dish-ranking-provider.test.ts src/projects/product-swap/__tests__/router.test.ts`

Expected: FAIL because the provider and route do not exist.

- [ ] **Step 3: Implement the one-shot provider**

Use `DOUBAO_API_KEY`, `DOUBAO_CHAT_ENDPOINT` and `DOUBAO_ARK_BASE_URL`. Build OpenAI-compatible multimodal content using text and data-URL `image_url` parts. Bound the response to 1 MiB and timeout at 60 seconds. Do not retry or repair invalid JSON.

```ts
const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DOUBAO_API_KEY}`,
    },
    body: JSON.stringify({ model: env.DOUBAO_CHAT_ENDPOINT, messages, stream: false }),
    signal: AbortSignal.timeout(60_000),
})
```

- [ ] **Step 4: Add the route and stable error mapping**

Add `dishRankingGenerator?: typeof generateDishRankingDraft` to router options and `router.post('/dish-ranking-draft', ...)`. Map request errors to 400, not-configured to 503, timeout to 504, and upstream/invalid-model errors to 502.

- [ ] **Step 5: Run focused backend tests**

Run: `npx vitest run src/projects/product-swap/__tests__/dish-ranking-draft.test.ts src/projects/product-swap/__tests__/dish-ranking-provider.test.ts src/projects/product-swap/__tests__/router.test.ts`

Expected: PASS with no network access.

- [ ] **Step 6: Commit provider and route**

```bash
git add apps/my-cloud-hub/src/projects/product-swap/dish-ranking-provider.ts apps/my-cloud-hub/src/projects/product-swap/router.ts apps/my-cloud-hub/src/projects/product-swap/__tests__/dish-ranking-provider.test.ts apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts
git commit -m "feat: add dish ranking draft endpoint"
```

### Task 3: Browser validation and deterministic fallback

**Files:**
- Create: `apps/product-swap/dish-ranking-client.js`
- Create: `apps/product-swap/tests/dish-ranking-client.test.js`

- [ ] **Step 1: Write failing client tests**

Assert the client posts only once to `/api/product-swap/dish-ranking-draft`; self-owned dishes always become `top` and precede non-owned dishes; invalid/duplicate/unknown AI items are ignored; every input ref appears once; missing items are distributed across non-top tiers; and fallback comments are stable across repeated calls.

```js
const result = normalizeRanking(dishes, {
    version: 1,
    items: [{ refId: 'dish-1', tier: 'poor', order: 9, comment: '一般般' }],
})
assert.deepEqual(result.items.map((item) => item.refId).sort(), [
    'dish-0',
    'dish-1',
])
assert.equal(result.items[0].tier, 'top')
```

- [ ] **Step 2: Run the focused client test and verify failure**

Run: `node --test tests/dish-ranking-client.test.js`

Expected: FAIL because `dish-ranking-client.js` does not exist.

- [ ] **Step 3: Implement request, validation and normalization**

Export `requestDishRankingDraft`, `normalizeRanking`, `fallbackRanking` and tier constants. The request sends `{ templateId, dishes: [{id,image,owned,source}] }`. Catch API/response validation errors at the integration layer so the same normalizer can produce a result from `null`.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/dish-ranking-client.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the browser contract**

```bash
git add apps/product-swap/dish-ranking-client.js apps/product-swap/tests/dish-ranking-client.test.js
git commit -m "feat: normalize dish ranking drafts"
```

### Task 4: Fixed Canvas renderer

**Files:**
- Create: `apps/product-swap/dish-ranking-renderer.js`
- Create: `apps/product-swap/tests/dish-ranking-renderer.test.js`

- [ ] **Step 1: Write failing pure-layout and rendering tests**

Assert exact output sizes for `3:4`, `1:1`, and `9:16`; five equal rows; an 18% label rail; bounded card rectangles; stable ordering; cover-crop geometry; and a PNG data URL from an injected canvas/image loader.

```js
assert.deepEqual(canvasSize('3:4'), { width: 1080, height: 1440 })
assert.equal(layoutRanking({ ratio: '3:4', items }).rows.length, 5)
assert.ok(layout.rows.every((row) => row.cards.every(
    (card) => card.x >= layout.labelWidth && card.x + card.width <= 1080,
)))
```

- [ ] **Step 2: Run the renderer test and verify failure**

Run: `node --test tests/dish-ranking-renderer.test.js`

Expected: FAIL because `dish-ranking-renderer.js` does not exist.

- [ ] **Step 3: Implement pure geometry and Canvas drawing**

Export `canvasSize`, `coverRect`, `layoutRanking`, `renderDishRanking`, and `renderDishRankingDataUrl`. Draw white background, five colored labels, original images with cover cropping, short comments, and a subtle “自家” badge. Use only the supplied Canvas and image loader so unit tests require no browser.

- [ ] **Step 4: Run renderer tests**

Run: `node --test tests/dish-ranking-renderer.test.js`

Expected: PASS.

- [ ] **Step 5: Commit renderer**

```bash
git add apps/product-swap/dish-ranking-renderer.js apps/product-swap/tests/dish-ranking-renderer.test.js
git commit -m "feat: render fixed dish ranking template"
```

### Task 5: Creation-page integration

**Files:**
- Modify: `apps/product-swap/template-packs/dish-ranking-guide/manifest.js`
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/create.html`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/server/dev-server.js`
- Modify: `apps/product-swap/tests/dish-ranking-manifest.test.js`
- Modify: `apps/product-swap/tests/creator-contract.test.js`
- Modify: `apps/product-swap/tests/build.test.js`

- [ ] **Step 1: Update contract tests first**

Assert the manifest contains only `{ value: 'tier' }`, has `creditCost: 0`, and no longer exposes refinement prompts for this template. Assert both browser modules appear in the HTML, build list and local static allowlist.

- [ ] **Step 2: Run focused contract tests and verify failure**

Run: `node --test tests/dish-ranking-manifest.test.js tests/creator-contract.test.js tests/build.test.js`

Expected: FAIL on the new module and manifest expectations.

- [ ] **Step 3: Wire the deterministic generation path**

In `boot()`, derive `isDishRankingTemplate`. During submit, keep current validation and resource-library fill, call `requestDishRankingDraft` once, fall back locally on any error, render to a PNG data URL, and pass that URL into `addVersion`. Skip service-worker/background image generation and hide refinement UI for this template.

```js
const ranking = await window.DishRankingClient
    .requestDishRankingDraft(payload.dishes)
    .catch(() => null)
const normalized = window.DishRankingClient.normalizeRanking(
    payload.dishes,
    ranking,
)
const imageUrl = await window.DishRankingRenderer
    .renderDishRankingDataUrl({
        ratio: payload.aspectRatio,
        dishes: payload.dishes,
        ranking: normalized,
    })
```

Show “AI 评价暂不可用，已使用默认排序生成。” only when the API path failed. Save the normal PNG through the existing version/history code and prevent refinement submission for this template.

- [ ] **Step 4: Publish modules and simplify the manifest**

Load client before renderer before `script.js`, add them to static/build lists, set the manifest to the sole tier choice and zero credits, and clear quick prompts.

- [ ] **Step 5: Run focused frontend tests**

Run: `node --test tests/dish-ranking-client.test.js tests/dish-ranking-renderer.test.js tests/dish-ranking-manifest.test.js tests/creator-contract.test.js tests/build.test.js`

Expected: PASS.

- [ ] **Step 6: Commit creation-page integration**

```bash
git add apps/product-swap/template-packs/dish-ranking-guide/manifest.js apps/product-swap/script.js apps/product-swap/create.html apps/product-swap/build.mjs apps/product-swap/server/dev-server.js apps/product-swap/tests/dish-ranking-manifest.test.js apps/product-swap/tests/creator-contract.test.js apps/product-swap/tests/build.test.js
git commit -m "feat: use fixed dish ranking renderer"
```

### Task 6: Browser smoke and regression verification

**Files:**
- Modify: `apps/product-swap/tests/dish-ranking-browser-smoke.js`
- Modify: `apps/product-swap/tests/dish-ranking-prompt.test.js`

- [ ] **Step 1: Rewrite the browser smoke around a mocked draft response**

Intercept `/api/product-swap/dish-ranking-draft` and return fixed JSON. Fail the test if `/api/product-swap/generate` is requested. Upload fixtures, mark the owned dish, submit, verify five visible tiers in the rendered PNG workflow, download the PNG, and validate its eight-byte signature.

- [ ] **Step 2: Replace obsolete image-prompt expectations**

Remove assertions for four image layouts and `result.png`. Keep a regression test proving no active frontend path uses the old dish image-generation prompt.

- [ ] **Step 3: Run the browser smoke**

Run: `node tests/dish-ranking-browser-smoke.js`

Expected: PASS using only intercepted/local requests.

- [ ] **Step 4: Run full project verification**

Run: `npm test && npm run build`

Working directory: `apps/product-swap`

Run: `npx vitest run src/projects/product-swap/__tests__/dish-ranking-draft.test.ts src/projects/product-swap/__tests__/dish-ranking-provider.test.ts src/projects/product-swap/__tests__/router.test.ts`

Working directory: `apps/my-cloud-hub`

Expected: all tests and build PASS with no live AI request.

- [ ] **Step 5: Commit smoke coverage**

```bash
git add apps/product-swap/tests/dish-ranking-browser-smoke.js apps/product-swap/tests/dish-ranking-prompt.test.js
git commit -m "test: cover deterministic dish ranking workflow"
```
