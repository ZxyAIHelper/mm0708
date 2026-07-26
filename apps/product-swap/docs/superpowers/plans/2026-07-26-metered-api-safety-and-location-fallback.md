# Metered API Safety and Location Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-wide rule that prevents accidental consumption of metered APIs, and make only the current product-swap location search fall back to 深圳湖贝里 when Tencent Map is unavailable.

**Architecture:** The repository root `AGENTS.md` contains only generic external-API safety rules. The product-swap backend keeps its existing validation and successful Tencent response handling, but funnels every external failure through one local fallback response helper; no frontend contract change is required because the existing picker already reads the `locations` array.

**Tech Stack:** Markdown, TypeScript, Hono, Vitest, Cloudflare Workers

---

### Task 1: Lock the product-swap fallback contract with mocked tests

**Files:**
- Modify: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`
- Test: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`

- [ ] **Step 1: Define the expected fallback fixture in the test**

Add a fixture near the existing product-swap test constants:

```ts
const hubeiliFallback = {
    id: 'fallback-shenzhen-hubeili',
    name: '深圳湖贝里',
    address: '深圳市罗湖区湖贝路1068号',
    city: '深圳市',
    lat: 22.546394,
    lng: 114.128133,
    fallback: true,
}
```

- [ ] **Step 2: Replace the quota and provider-error expectations with fallback expectations**

For mocked Tencent statuses `110` and `121`, assert HTTP 200, `Cache-Control: no-store`, exact fallback location, the appropriate finite reason, and exactly one injected fetch call:

```ts
expect(response.status).toBe(200)
expect(response.headers.get('Cache-Control')).toBe('no-store')
expect(await response.json()).toEqual({
    success: true,
    locations: [hubeiliFallback],
    fallback: true,
    fallbackReason: 'quota_exhausted',
})
expect(fetchMock).toHaveBeenCalledTimes(1)
```

Status `110` uses `fallbackReason: 'upstream_unavailable'`; status `121` uses `fallbackReason: 'quota_exhausted'`.

- [ ] **Step 3: Add missing-key and network-failure tests**

Use injected mocks only:

```ts
it('uses the template fallback without calling Tencent when the key is missing', async () => {
    const fetchMock = vi.fn()
    const provider: ProductSwapProvider = {
        name: 'fake',
        generate: async () => ({ imageUrl: targetImage }),
    }
    const app = new Hono()
    app.route('/api/product-swap', createProductSwapRouter(
        () => provider,
        noOpArchive,
        { fetchImpl: fetchMock },
    ))

    const response = await app.request(
        '/api/product-swap/location-search?region=深圳&keyword=湖贝里',
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
        success: true,
        locations: [hubeiliFallback],
        fallback: true,
        fallbackReason: 'not_configured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
})

it('uses the template fallback after one failed Tencent request', async () => {
    const fetchMock = vi.fn(async () => {
        throw new Error('mocked network failure')
    })
    const provider: ProductSwapProvider = {
        name: 'fake',
        generate: async () => ({ imageUrl: targetImage }),
    }
    const app = new Hono()
    app.route('/api/product-swap', createProductSwapRouter(
        () => provider,
        noOpArchive,
        { fetchImpl: fetchMock },
    ))

    const response = await app.request(
        '/api/product-swap/location-search?region=深圳&keyword=湖贝里',
        undefined,
        { TENCENT_MAP_KEY: 'mock-key' },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
        success: true,
        locations: [hubeiliFallback],
        fallback: true,
        fallbackReason: 'upstream_unavailable',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 4: Add a valid empty-result test**

Mock `{ status: 0, data: [] }` and assert the response remains:

```ts
{
    success: true,
    locations: [],
}
```

This ensures a valid empty search result is not replaced by the fallback.

- [ ] **Step 5: Run the targeted tests and verify they fail for the intended reason**

Run:

```powershell
Set-Location apps/my-cloud-hub
npx vitest run src/projects/product-swap/__tests__/router.test.ts
```

Expected: the new fallback assertions fail because the router still returns 503, 502, or 429. No real external request occurs because every external path uses an injected fetch mock.

- [ ] **Step 6: Commit the red tests**

```powershell
git add apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts
git commit -m "test: define product swap location fallback"
```

### Task 2: Implement the template-scoped fallback

**Files:**
- Modify: `apps/my-cloud-hub/src/projects/product-swap/router.ts:94`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/router.ts:187-310`
- Test: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`

- [ ] **Step 1: Add the fixed location and reason type**

Add beside the existing map constants:

```ts
const FALLBACK_LOCATION = Object.freeze({
    id: 'fallback-shenzhen-hubeili',
    name: '深圳湖贝里',
    address: '深圳市罗湖区湖贝路1068号',
    city: '深圳市',
    lat: 22.546394,
    lng: 114.128133,
    fallback: true,
})

type LocationFallbackReason =
    | 'not_configured'
    | 'upstream_unavailable'
    | 'quota_exhausted'
```

- [ ] **Step 2: Add one route-local fallback response helper**

After input validation and before checking the Key, add:

```ts
const fallbackResponse = (reason: LocationFallbackReason) => {
    c.header('Cache-Control', 'no-store')
    return c.json({
        success: true,
        locations: [{ ...FALLBACK_LOCATION }],
        fallback: true,
        fallbackReason: reason,
    }, 200)
}
```

- [ ] **Step 3: Route every external failure through the helper**

Use:

```ts
if (!key) {
    return fallbackResponse('not_configured')
}
```

Replace fetch exceptions, non-2xx responses, oversized responses, invalid JSON, and nonzero upstream statuses with:

```ts
return fallbackResponse(
    result?.status === 121
        ? 'quota_exhausted'
        : 'upstream_unavailable',
)
```

For branches without a parsed Tencent status, use `upstream_unavailable`. Do not add retry, recursive call, loop, or a second fetch.

- [ ] **Step 4: Run the targeted backend tests**

Run:

```powershell
Set-Location apps/my-cloud-hub
npx vitest run src/projects/product-swap/__tests__/router.test.ts
```

Expected: all router tests pass, including invalid input, successful Tencent normalization, valid empty results, missing Key, network failure, status `110`, and quota status `121`.

- [ ] **Step 5: Commit the implementation**

```powershell
git add apps/my-cloud-hub/src/projects/product-swap/router.ts
git commit -m "fix: fall back when product swap map search fails"
```

### Task 3: Add the repository-wide metered API constraint

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Create the root constraint file**

Create `AGENTS.md` with only generic external-service safety rules:

```md
# Repository Agent Instructions

## 外部 Key、额度与计费接口

- 自动化测试、冒烟测试、CI 和重复调试默认禁止调用真实的额度或计费接口，包括但不限于腾讯地图和豆包 AI。
- 测试必须使用注入的 mock、fake 或本地固定响应；不得启用 live-test 环境变量绕过此限制。
- 只有用户明确要求真实验收时，才允许进行一次真实调用；调用前必须说明目标接口及调用次数。
- 真实调用禁止自动重试、批量请求和轮询；首次失败后立即停止。
- API Key 只能保存在服务端 Secret 中，不得写入前端代码、日志、响应、测试快照或截图。
- 外部失败场景必须通过 mock 验证，不得为了制造失败而请求真实服务。
- 发起任何可能消耗额度的请求前，必须确认请求次数具有明确上限。
```

Do not include 深圳湖贝里, map fallback behavior, or any other product-specific rule.

- [ ] **Step 2: Verify the scope and wording**

Run:

```powershell
rg -n "深圳湖贝里|fallback|兜底" AGENTS.md
rg -n "mock|一次真实调用|禁止自动重试|API Key" AGENTS.md
```

Expected: the first command has no matches; the second command matches all four safety concepts.

- [ ] **Step 3: Commit the constraint**

```powershell
git add AGENTS.md
git commit -m "docs: guard metered external API usage"
```

### Task 4: Perform safe regression verification

**Files:**
- Verify: `apps/my-cloud-hub/src/projects/product-swap/router.ts`
- Verify: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`
- Verify: `apps/product-swap/tencent-map-picker.js`
- Verify: `AGENTS.md`

- [ ] **Step 1: Run backend tests with no live-test flags**

Run:

```powershell
Set-Location apps/my-cloud-hub
npx vitest run src/projects/product-swap
```

Expected: all product-swap backend tests pass. Do not set `RUN_LIVE_*`, Tencent, or Doubao environment variables.

- [ ] **Step 2: Run frontend unit tests**

Run:

```powershell
Set-Location apps/product-swap
npm test
```

Expected: all frontend unit tests pass; these tests use local fixtures and mocks.

- [ ] **Step 3: Run the intercepted browser smoke test**

Run:

```powershell
Set-Location apps/product-swap
node tests/wechat-chat-browser-smoke.js
```

Expected: the smoke test passes while intercepting backend responses. It must not call Tencent Map or Doubao AI.

- [ ] **Step 4: Inspect the final diff and verify request count**

Run:

```powershell
git diff --check HEAD~3..HEAD
rg -n "retry|setInterval|while \\(" apps/my-cloud-hub/src/projects/product-swap/router.ts
```

Expected: no whitespace errors and no newly added retry, polling, or loop behavior in the location-search route.

### Task 5: Deploy only the backend change and verify without metered calls

**Files:**
- Deploy: `apps/my-cloud-hub/src/projects/product-swap/router.ts`

- [ ] **Step 1: Load the Cloudflare deployment instructions**

Read the Cloudflare skill before deployment and follow its authentication, project, and verification requirements.

- [ ] **Step 2: Deploy the existing Worker**

Run from `apps/my-cloud-hub`:

```powershell
npm run deploy
```

Expected: Wrangler reports a successful new Worker version. This deployment command does not call Tencent Map or Doubao AI.

- [ ] **Step 3: Verify only the deployment/version state**

Use Wrangler or Cloudflare deployment metadata to confirm the new Worker version is active. Do not request `/location-search`, the chat-generation endpoint, Tencent Map, or Doubao AI.

- [ ] **Step 4: Check the working tree**

Run:

```powershell
git status --short
```

Expected: no uncommitted changes.
