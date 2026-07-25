# Template Extraction Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add operator-authenticated AI endpoints that analyze a target image into editable candidate regions and extract five editable Chinese template rules from the confirmed annotations.

**Architecture:** Add a dedicated Hono project with an injected provider boundary and strict runtime validation. The vision provider returns normalized polygons rather than binary images; the workbench rasterizes them into the mask model from the annotation plan. Rule extraction receives the original image, a generated colored overlay, normalized region metadata, and operator notes.

**Tech Stack:** Hono, TypeScript, Cloudflare Workers, Vitest, Volcano Ark multimodal chat API, vanilla JavaScript, Canvas 2D, Node.js tests.

---

## Dependency

Complete `2026-07-25-template-annotation-workbench.md` first. This plan uses:

- `TemplateMaskModel`.
- `TemplateEditorGeometry.polygonIndexes`.
- The version-1 local draft.
- `/admin/template-extraction/`.

## Stable API contracts

`POST /api/template-extraction/analyze`

```ts
type AnalyzeResponse = {
    success: true
    analysis: {
        width: number
        height: number
        regions: Array<{
            id: string
            kind: 'replace' | 'preserve' | 'reference'
            label: string
            confidence: number
            polygon: Array<[number, number]>
        }>
        composition: string
        lighting: string
        warnings: string[]
    }
}
```

Polygon coordinates are normalized to `0..1`.

`POST /api/template-extraction/rules`

```ts
type RulesResponse = {
    success: true
    rules: {
        replacement: string
        preserve: string
        composition: string
        lighting: string
        negative: string
    }
}
```

### Task 1: Define and validate extraction types

**Files:**
- Create: `apps/my-cloud-hub/src/projects/template-extraction/types.ts`
- Create: `apps/my-cloud-hub/src/projects/template-extraction/__tests__/types.test.ts`

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from 'vitest'
import {
    parseAnalysisResult,
    parseTemplateRules,
} from '../types'

describe('template extraction types', () => {
    it('accepts normalized semantic polygons', () => {
        const result = parseAnalysisResult({
            width: 1000,
            height: 800,
            regions: [{
                id: 'product-1',
                kind: 'replace',
                label: '中央产品',
                confidence: 0.9,
                polygon: [[0.1, 0.2], [0.8, 0.2], [0.8, 0.7]],
            }],
            composition: '俯拍居中构图',
            lighting: '左上方暖光',
            warnings: [],
        })
        expect(result.regions[0].kind).toBe('replace')
    })

    it('rejects coordinates outside the normalized range', () => {
        expect(() => parseAnalysisResult({
            width: 10,
            height: 10,
            regions: [{
                id: 'bad',
                kind: 'replace',
                label: 'bad',
                confidence: 1,
                polygon: [[-0.1, 0], [1, 0], [0, 1]],
            }],
            composition: '',
            lighting: '',
            warnings: [],
        })).toThrow('INVALID_ANALYSIS_RESULT')
    })

    it('requires all five non-empty Chinese rule fields', () => {
        expect(parseTemplateRules({
            replacement: '替换中央产品',
            preserve: '保留托盘',
            composition: '保持俯拍',
            lighting: '保持暖光',
            negative: '不增加文字',
        }).negative).toBe('不增加文字')
        expect(() => parseTemplateRules({ replacement: '' }))
            .toThrow('INVALID_TEMPLATE_RULES')
    })
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/template-extraction/__tests__/types.test.ts
```

Expected: FAIL because `../types` does not exist.

- [ ] **Step 3: Implement strict parsers**

Define:

```ts
export type RegionKind = 'replace' | 'preserve' | 'reference'
export type NormalizedPoint = [number, number]
export type AnalysisRegion = {
    id: string
    kind: RegionKind
    label: string
    confidence: number
    polygon: NormalizedPoint[]
}
export type TemplateAnalysis = {
    width: number
    height: number
    regions: AnalysisRegion[]
    composition: string
    lighting: string
    warnings: string[]
}
export type TemplateRules = {
    replacement: string
    preserve: string
    composition: string
    lighting: string
    negative: string
}
export type SerializedMaskDocument = {
    version: 1
    width: number
    height: number
    selectedLayerId: string
    nextReplaceNumber: number
    layers: Array<{
        id: string
        kind: RegionKind
        name: string
        enabled: boolean
        visible: boolean
        pixelsBase64: string
    }>
}
```

`parseAnalysisResult` must enforce:

- Positive integer width and height.
- Maximum 50 regions.
- Unique IDs of 1–80 characters.
- Allowed kinds only.
- Confidence `0..1`.
- Polygon length `3..200`.
- Every coordinate finite and `0..1`.
- Text fields trimmed and bounded to 500 characters.

`parseTemplateRules` requires five strings, each trimmed to `1..1000` characters.

- [ ] **Step 4: Run type tests**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/template-extraction/__tests__/types.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/template-extraction/types.ts apps/my-cloud-hub/src/projects/template-extraction/__tests__/types.test.ts
git commit -m "feat: define template extraction contracts"
```

### Task 2: Add operator authentication and routes

**Files:**
- Create: `apps/my-cloud-hub/src/projects/template-extraction/router.ts`
- Create: `apps/my-cloud-hub/src/projects/template-extraction/__tests__/router.test.ts`
- Modify: `apps/my-cloud-hub/src/index.ts`
- Modify: `apps/my-cloud-hub/wrangler.toml`

- [ ] **Step 1: Write failing route-authentication tests**

Use an injected fake provider:

```ts
const provider = {
    analyze: vi.fn(async () => validAnalysis),
    extractRules: vi.fn(async () => validRules),
}
const app = createApp({ templateExtractionProvider: provider })
```

Test:

```ts
it('rejects missing and incorrect operator tokens', async () => {
    const env = { TEMPLATE_ADMIN_TOKEN: 'secret' }
    const missing = await app.request(
        '/api/template-extraction/analyze',
        { method: 'POST', body: '{}' },
        env,
    )
    expect(missing.status).toBe(401)

    const wrong = await app.request(
        '/api/template-extraction/analyze',
        {
            method: 'POST',
            headers: { Authorization: 'Bearer wrong' },
            body: '{}',
        },
        env,
    )
    expect(wrong.status).toBe(401)
})
```

Also test:

- Correct token reaches the injected provider.
- Unsupported image data URL returns `400 INVALID_IMAGE`.
- Image over 10MB returns `413 IMAGE_TOO_LARGE`.
- Provider failure maps to `502 EXTRACTION_PROVIDER_FAILED`.

- [ ] **Step 2: Run route tests and verify failure**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/template-extraction/__tests__/router.test.ts
```

Expected: FAIL because the router does not exist.

- [ ] **Step 3: Define the provider boundary**

In `router.ts` define:

```ts
export type TemplateExtractionEnv = {
    TEMPLATE_ADMIN_TOKEN?: string
    DOUBAO_API_KEY?: string
    DOUBAO_CHAT_ENDPOINT?: string
    DOUBAO_ARK_BASE_URL?: string
}

export type TemplateExtractionProvider = {
    analyze(input: {
        imageDataUrl: string
        width: number
        height: number
    }, env: TemplateExtractionEnv): Promise<TemplateAnalysis>
    extractRules(input: {
        imageDataUrl: string
        overlayDataUrl: string
        regions: AnalysisRegion[]
        composition: string
        lighting: string
        notes: string
    }, env: TemplateExtractionEnv): Promise<TemplateRules>
}
```

- [ ] **Step 4: Implement authentication and request validation**

Require:

```ts
const authorization = c.req.header('Authorization') || ''
const expected = c.env.TEMPLATE_ADMIN_TOKEN || ''
if (!expected || authorization !== `Bearer ${expected}`) {
    return c.json({
        success: false,
        error: { code: 'OPERATOR_UNAUTHORIZED', message: '需要运营权限' },
    }, 401)
}
```

Accepted images are `data:image/jpeg`, `data:image/png`, and `data:image/webp`. Validate decoded size at no more than 10MB without logging the data URL.

Implement:

- `POST /analyze`.
- `POST /rules`.

Return stable errors:

- `INVALID_INPUT` 400.
- `INVALID_IMAGE` 400.
- `IMAGE_TOO_LARGE` 413.
- `OPERATOR_UNAUTHORIZED` 401.
- `EXTRACTION_PROVIDER_FAILED` 502.

- [ ] **Step 5: Mount the router and allow Authorization CORS**

Update `createApp` to accept optional injected dependencies without changing existing callers:

```ts
export function createApp(dependencies: {
    templateExtractionProvider?: TemplateExtractionProvider
} = {}) {
```

Mount at `/api/template-extraction`.

Add `Authorization` to CORS `allowHeaders`.

Add to root `Bindings`:

```ts
TEMPLATE_ADMIN_TOKEN?: string
```

Add to `wrangler.toml`:

```toml
[secrets]
required = [ "DOUBAO_API_KEY", "TEMPLATE_ADMIN_TOKEN" ]
```

- [ ] **Step 6: Run route and existing backend tests**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/template-extraction/__tests__/router.test.ts
pnpm --filter my-cloud-hub test
```

Expected: new route tests and all existing tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/template-extraction/router.ts apps/my-cloud-hub/src/projects/template-extraction/__tests__/router.test.ts apps/my-cloud-hub/src/index.ts apps/my-cloud-hub/wrangler.toml
git commit -m "feat: add protected template extraction routes"
```

### Task 3: Implement the multimodal analysis provider

**Files:**
- Create: `apps/my-cloud-hub/src/projects/template-extraction/provider.ts`
- Create: `apps/my-cloud-hub/src/projects/template-extraction/__tests__/provider.test.ts`
- Modify: `apps/my-cloud-hub/src/projects/template-extraction/router.ts`

- [ ] **Step 1: Write failing provider tests with mocked fetch**

Cover:

- Request uses `DOUBAO_ARK_BASE_URL/chat/completions`.
- Model is `DOUBAO_CHAT_ENDPOINT`.
- Image is sent as `image_url`.
- Prompt requires JSON and normalized polygons.
- JSON inside a Markdown fence is parsed.
- Invalid JSON throws `EXTRACTION_PROVIDER_FAILED`.
- Timeout aborts the request.

Expected request content:

```ts
[
    {
        type: 'image_url',
        image_url: { url: input.imageDataUrl },
    },
    {
        type: 'text',
        text: expect.stringContaining('"kind":"replace|preserve|reference"'),
    },
]
```

- [ ] **Step 2: Run provider tests and verify failure**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/template-extraction/__tests__/provider.test.ts
```

Expected: FAIL because `provider.ts` does not exist.

- [ ] **Step 3: Implement a shared Ark chat call**

Create:

```ts
async function arkChat(
    env: TemplateExtractionEnv,
    content: Array<Record<string, unknown>>,
    fetchImpl: typeof fetch = fetch,
): Promise<string>
```

Requirements:

- Require API key, endpoint, and base URL.
- POST to `${baseUrl.replace(/\/$/, '')}/chat/completions`.
- Send `{ model, messages: [{ role: 'user', content }], temperature: 0.1 }`.
- Abort after 60 seconds.
- Read `choices[0].message.content`.
- Throw a provider error without including API keys or image data.

- [ ] **Step 4: Implement the analysis prompt and parser**

The prompt must define the three semantics, normalized coordinates, and exact JSON shape:

```json
{
  "width": 1000,
  "height": 800,
  "regions": [
    {
      "id": "product-1",
      "kind": "replace",
      "label": "中央产品",
      "confidence": 0.9,
      "polygon": [[0.1, 0.2], [0.8, 0.2], [0.8, 0.7]]
    }
  ],
  "composition": "俯拍居中构图",
  "lighting": "左上方暖光",
  "warnings": []
}
```

Strip one surrounding Markdown JSON fence, `JSON.parse`, override width and height with the trusted request values, and call `parseAnalysisResult`.

Export `createVolcanoTemplateExtractionProvider({ fetchImpl })`.

- [ ] **Step 5: Make the Volcano provider the router default**

Use the injected provider in tests; otherwise resolve one singleton from `createVolcanoTemplateExtractionProvider()`.

- [ ] **Step 6: Run provider, router, and full backend tests**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/template-extraction
pnpm --filter my-cloud-hub test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/template-extraction/provider.ts apps/my-cloud-hub/src/projects/template-extraction/__tests__/provider.test.ts apps/my-cloud-hub/src/projects/template-extraction/router.ts
git commit -m "feat: analyze template images with vision"
```

### Task 4: Implement five-part rule extraction

**Files:**
- Modify: `apps/my-cloud-hub/src/projects/template-extraction/provider.ts`
- Modify: `apps/my-cloud-hub/src/projects/template-extraction/__tests__/provider.test.ts`

- [ ] **Step 1: Add failing rule-extraction tests**

Verify the request contains:

- Original target image.
- Colored annotation overlay.
- Region JSON.
- Composition and lighting analysis.
- Operator notes.
- Required five-key response shape.

Test successful fenced JSON parsing and rejection of any missing rule field.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/template-extraction/__tests__/provider.test.ts
```

Expected: FAIL because `extractRules` is not implemented.

- [ ] **Step 3: Implement the rules prompt**

Send two images followed by text. Require only:

```json
{
  "replacement": "替换内容",
  "preserve": "必须保留",
  "composition": "构图与位置",
  "lighting": "光线与风格",
  "negative": "禁止内容"
}
```

The prompt must state:

- Red means replace.
- Green means preserve.
- Yellow means learn visual relationships.
- Do not quote pixel coordinates in user-facing rules.
- Do not preserve source brands, watermarks, or text unless operator notes explicitly require it.
- Rules must be concise Chinese instructions.

Parse with `parseTemplateRules`.

- [ ] **Step 4: Run provider and route tests**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/template-extraction
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/template-extraction/provider.ts apps/my-cloud-hub/src/projects/template-extraction/__tests__/provider.test.ts
git commit -m "feat: extract editable template rules"
```

### Task 5: Add the extraction client and operator token gate

**Files:**
- Create: `apps/product-swap/admin/template-extraction/extraction-api.js`
- Create: `apps/product-swap/tests/template-extraction-api.test.js`
- Modify: `apps/product-swap/admin/template-extraction/index.html`
- Modify: `apps/product-swap/admin/template-extraction/workbench.css`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build.test.js`

- [ ] **Step 1: Write failing API client tests**

Test:

```js
const calls = [];
const client = createExtractionApi({
    baseUrl: 'https://api.example',
    getToken: () => 'secret',
    fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({
            success: true,
            analysis: validAnalysis,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
});
await client.analyze({ imageDataUrl: 'data:image/png;base64,AA==', width: 2, height: 2 });
assert.equal(calls[0].init.headers.Authorization, 'Bearer secret');
```

Also verify 401 maps to `OPERATOR_UNAUTHORIZED` and provider errors preserve their stable code.

- [ ] **Step 2: Run client tests and verify failure**

Run:

```powershell
node --test apps/product-swap/tests/template-extraction-api.test.js
```

Expected: FAIL because `extraction-api.js` does not exist.

- [ ] **Step 3: Implement the client**

Export:

```js
createExtractionApi({ baseUrl, getToken, fetchImpl })
```

with methods:

- `analyze(input)`.
- `extractRules(input)`.

POST JSON to `/api/template-extraction/analyze` and `/api/template-extraction/rules`. Add `Content-Type` and `Authorization`. Parse JSON once. Throw an `Error` with `code` and Chinese `message`.

- [ ] **Step 4: Add an operator-token dialog**

Add:

```html
<dialog id="operatorAuthDialog">
    <form id="operatorAuthForm" method="dialog">
        <h2>运营验证</h2>
        <label for="operatorToken">运营访问令牌</label>
        <input id="operatorToken" type="password" autocomplete="current-password" required>
        <button type="submit">进入工作台</button>
    </form>
</dialog>
```

Store the token in `sessionStorage` under `template_extraction_operator_token`; never place it in localStorage, IndexedDB, logs, URLs, or draft JSON.

Load `extraction-api.js` before `workbench.js`.

- [ ] **Step 5: Add dialog styles and build output**

Style the dialog as a centered card with a 48px submit button. Add `extraction-api.js` through the existing copied `admin` directory; update only tests that enumerate files inside that directory.

- [ ] **Step 6: Run client, contract, and build tests**

Run:

```powershell
node --test apps/product-swap/tests/template-extraction-api.test.js apps/product-swap/tests/template-workbench-contract.test.js apps/product-swap/tests/build.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/product-swap/admin/template-extraction/extraction-api.js apps/product-swap/admin/template-extraction/index.html apps/product-swap/admin/template-extraction/workbench.css apps/product-swap/tests/template-extraction-api.test.js apps/product-swap/tests/template-workbench-contract.test.js
git commit -m "feat: connect protected extraction client"
```

### Task 6: Apply AI regions and edit extracted rules

**Files:**
- Modify: `apps/product-swap/admin/template-extraction/draft-store.js`
- Modify: `apps/product-swap/admin/template-extraction/workbench.js`
- Modify: `apps/product-swap/admin/template-extraction/index.html`
- Modify: `apps/product-swap/admin/template-extraction/workbench.css`
- Create: `apps/product-swap/tests/template-analysis-apply.test.js`

- [ ] **Step 1: Write failing analysis-application tests**

Test a pure function:

```js
const document = createMaskDocument(100, 80);
const result = applyAnalysisToMasks(document, {
    regions: [
        {
            id: 'p1',
            kind: 'replace',
            label: '产品',
            polygon: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]],
        },
        {
            id: 'keep',
            kind: 'preserve',
            label: '托盘',
            polygon: [[0, 0], [1, 0], [1, 1]],
        },
    ],
});
assert.ok(Object.values(result.layers)
    .some((layer) => layer.kind === 'replace'));
assert.equal(countOverlappingPixels(result), 0);
```

Also test that restore-AI uses a deep copy and does not mutate the stored initial analysis masks.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
node --test apps/product-swap/tests/template-analysis-apply.test.js
```

Expected: FAIL because `applyAnalysisToMasks` is not exported.

- [ ] **Step 3: Implement analysis rasterization**

For each normalized polygon:

1. Convert points to image pixels.
2. Rasterize with `polygonIndexes`.
3. Create one replacement layer per replace region.
4. Write preserve and reference regions into their fixed layers.
5. Apply regions in order `reference`, `preserve`, `replace`, so replace has final precedence for model candidates.
6. Save a deep serialized `aiMasks` snapshot.

Export `applyAnalysisToMasks` and `countOverlappingPixels`.

- [ ] **Step 4: Extend the local draft**

Add:

```js
analysis: null | TemplateAnalysis,
aiMasks: null | SerializedMaskDocument,
rules: null | {
    replacement: string,
    preserve: string,
    composition: string,
    lighting: string,
    negative: string,
},
operatorNotes: string,
stage: 'analyzing' | 'annotating' | 'annotated' | 'extracting' | 'rules',
```

Keep version 1 and default missing fields during normalization so existing local drafts remain readable.

- [ ] **Step 5: Wire automatic analysis**

After a new target image:

1. Save the image and blank draft immediately.
2. Set stage to `analyzing`.
3. Call `api.analyze`.
4. Apply candidate regions.
5. Save `analysis`, `aiMasks`, and edited masks.
6. Set stage to `annotating`.
7. If analysis fails, keep blank masks and show “未自动识别到明确主体，请手动圈选”.

`restoreAiButton` replaces edited masks with a deep copy of `aiMasks` after confirmation.

- [ ] **Step 6: Add and wire the rules panel**

Add five labeled textareas:

- `ruleReplacement`.
- `rulePreserve`.
- `ruleComposition`.
- `ruleLighting`.
- `ruleNegative`.

Add `operatorNotes`, `extractRulesButton`, and `keepRulesChoice`.

On extraction:

1. Render a temporary overlay canvas at source-image dimensions.
2. Draw the original and colored masks.
3. Export overlay as WebP data URL at quality `0.9`.
4. Send image, overlay, enabled region metadata, analysis, and notes.
5. Fill the five textareas.
6. Save rules and stage `rules`.

When annotations changed after rules exist, prompt “保留当前规则” or “重新提取规则”; default to preserve.

- [ ] **Step 7: Run all frontend extraction tests**

Run:

```powershell
node --test apps/product-swap/tests/template-*.test.js
pnpm --filter product-swap test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add apps/product-swap/admin/template-extraction/draft-store.js apps/product-swap/admin/template-extraction/workbench.js apps/product-swap/admin/template-extraction/index.html apps/product-swap/admin/template-extraction/workbench.css apps/product-swap/tests/template-analysis-apply.test.js
git commit -m "feat: apply AI extraction in workbench"
```

### Task 7: Verify analysis failure and rule recovery

**Files:**
- Modify: `apps/product-swap/tests/template-workbench-smoke.js`
- Modify: `apps/product-swap/server/dev-server.js`

- [ ] **Step 1: Inject local extraction handlers**

Extend `createProductSwapServer` options:

```js
{
    provider,
    templateAnalyzer,
    templateRuleExtractor,
}
```

Handle local `POST /api/template-extraction/analyze` and `/rules` with the injected functions. This is local development behavior only; production still uses `API_BASE_URL`.

- [ ] **Step 2: Extend browser smoke coverage**

Test:

- Valid token.
- Automatic region appears.
- Manual edit survives rule extraction.
- Five rule textareas populate.
- Refresh restores analysis, masks, and rules.
- Analyzer failure falls back to blank manual masks.
- A later successful retry does not lose the source image.
- No token appears in IndexedDB draft export.

- [ ] **Step 3: Run browser and full suites**

Run:

```powershell
pnpm --filter product-swap test:template-workbench
pnpm --filter product-swap test
pnpm --filter my-cloud-hub test
```

Expected: all suites pass.

- [ ] **Step 4: Commit**

```powershell
git add apps/product-swap/tests/template-workbench-smoke.js apps/product-swap/server/dev-server.js
git commit -m "test: cover AI template extraction flow"
```

## Acceptance checklist

- [ ] Unauthorized extraction requests return 401.
- [ ] Operator token is session-only and absent from drafts and logs.
- [ ] Analysis returns validated normalized semantic polygons.
- [ ] Candidate polygons become editable mutually exclusive masks.
- [ ] Analysis failure leaves a usable manual workbench.
- [ ] Restore AI returns to the initial candidate masks.
- [ ] Rule extraction returns five editable Chinese fields.
- [ ] Manual rules survive annotation changes unless re-extraction is chosen.
- [ ] Refresh restores analysis, edited masks, and rules.
- [ ] Existing product generation and backend tests remain green.
