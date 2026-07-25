# Template Test and Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators test an extracted template with a real product, save its assets and metadata, publish it into the live catalog, and let merchants generate from it through the existing creator experience.

**Architecture:** Persist template metadata in D1 and binary assets in R2. Keep public catalog responses sanitized; target images, masks, internal rules, and test products remain server-side. A provider-neutral runtime adapter uses the stored template plus merchant product input for both operator tests and merchant generation.

**Tech Stack:** Hono, Cloudflare Workers, D1, R2, Drizzle schema definitions, TypeScript, Vitest, vanilla JavaScript, IndexedDB, Puppeteer.

---

## Dependencies

Complete these plans first:

1. `2026-07-25-template-annotation-workbench.md`.
2. `2026-07-25-template-extraction-services.md`.

This plan consumes the version-1 annotated draft, five-part rules, operator authentication, and the existing `ProductSwapProvider`.

## Public/private boundary

Public catalog data contains:

- ID, name, category, platforms, summary.
- Cover URL.
- Output label and credit cost.
- Input field schema.
- Status.

Private template data contains:

- Original target image.
- Masks and region metadata.
- Internal five-part rules.
- Test product.
- Provider metadata.

Private data is only available inside the Worker and operator-authenticated endpoints.

### Task 1: Add D1 metadata and R2 asset storage

**Files:**
- Create: `packages/database/migrations/0005_content_templates.sql`
- Modify: `packages/database/src/schema.ts`
- Modify: `apps/my-cloud-hub/src/index.ts`
- Modify: `apps/my-cloud-hub/wrangler.toml`
- Create: `apps/my-cloud-hub/src/projects/template-extraction/repository.ts`
- Create: `apps/my-cloud-hub/src/projects/template-extraction/__tests__/repository.test.ts`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE `content_templates` (
    `id` text PRIMARY KEY NOT NULL,
    `name` text NOT NULL,
    `summary` text NOT NULL DEFAULT '',
    `category` text NOT NULL,
    `platforms_json` text NOT NULL,
    `status` text NOT NULL DEFAULT 'draft',
    `width` integer NOT NULL,
    `height` integer NOT NULL,
    `source_asset_key` text NOT NULL,
    `mask_asset_key` text NOT NULL,
    `cover_asset_key` text,
    `test_product_asset_key` text,
    `test_result_asset_key` text,
    `rules_json` text NOT NULL,
    `input_schema_json` text NOT NULL,
    `output_label` text NOT NULL,
    `credit_cost` integer NOT NULL DEFAULT 0,
    `extraction_model` text NOT NULL DEFAULT '',
    `rules_version` integer NOT NULL DEFAULT 1,
    `last_test_succeeded_at` integer,
    `published_at` integer,
    `created_at` integer NOT NULL,
    `updated_at` integer NOT NULL,
    CHECK (`status` IN ('draft', 'live'))
);

CREATE INDEX `content_templates_status_updated_idx`
ON `content_templates` (`status`, `updated_at`);
```

- [ ] **Step 2: Add the matching Drizzle schema**

Export `contentTemplates` from `schema.ts` with the exact column names above. Represent timestamps as integers and JSON fields as text to keep migration and Worker serialization explicit.

- [ ] **Step 3: Write failing repository tests**

Use fake D1 and R2 adapters to verify:

- Draft metadata writes after assets succeed.
- A failed R2 write does not create metadata.
- Replacing an asset deletes the previous unreferenced object after metadata commits.
- Live listing returns only `status = 'live'`.
- Public projection excludes source, masks, rules, and test product.
- Publishing without `lastTestSucceededAt` throws `TEMPLATE_NOT_TESTED`.

- [ ] **Step 4: Define repository interfaces**

```ts
export type TemplateAssets = {
    source: ArrayBuffer
    masks: ArrayBuffer
    cover?: ArrayBuffer
    testProduct?: ArrayBuffer
    testResult?: ArrayBuffer
}

export type ContentTemplateRecord = {
    id: string
    name: string
    summary: string
    category: string
    platforms: string[]
    status: 'draft' | 'live'
    width: number
    height: number
    sourceAssetKey: string
    maskAssetKey: string
    coverAssetKey: string | null
    testProductAssetKey: string | null
    testResultAssetKey: string | null
    rules: TemplateRules
    inputSchema: Array<{
        key: string
        type: 'image' | 'text'
        required: boolean
    }>
    outputLabel: string
    creditCost: number
    extractionModel: string
    rulesVersion: number
    lastTestSucceededAt: number | null
    publishedAt: number | null
    createdAt: number
    updatedAt: number
}
```

Repository methods:

- `saveDraft(input, assets)`.
- `markTestSuccess(id, testProduct, testResult)`.
- `publish(id)`.
- `getPrivate(id)`.
- `getPublic(id)`.
- `listPublic()`.
- `getAsset(key)`.

- [ ] **Step 5: Implement D1/R2 repository**

Use key prefix:

```text
templates/{templateId}/{assetKind}-{uuid}.{extension}
```

Store:

- Source as original MIME type.
- Masks as `application/json` containing serialized mask document and enabled region metadata.
- Cover and test images as image MIME types.

Use parameterized D1 statements. Never interpolate IDs or keys into SQL.

- [ ] **Step 6: Add bindings**

In Worker `Bindings` add:

```ts
TEMPLATE_ASSETS: R2Bucket
```

In `wrangler.toml` add:

```toml
[[r2_buckets]]
binding = "TEMPLATE_ASSETS"
bucket_name = "content-template-assets"
```

- [ ] **Step 7: Run database and repository tests**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/template-extraction/__tests__/repository.test.ts
pnpm --filter my-cloud-hub test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add packages/database/migrations/0005_content_templates.sql packages/database/src/schema.ts apps/my-cloud-hub/src/index.ts apps/my-cloud-hub/wrangler.toml apps/my-cloud-hub/src/projects/template-extraction/repository.ts apps/my-cloud-hub/src/projects/template-extraction/__tests__/repository.test.ts
git commit -m "feat: persist extracted templates"
```

### Task 2: Add public catalog and protected save/publish endpoints

**Files:**
- Create: `apps/my-cloud-hub/src/projects/content-templates/router.ts`
- Create: `apps/my-cloud-hub/src/projects/content-templates/__tests__/router.test.ts`
- Modify: `apps/my-cloud-hub/src/index.ts`
- Modify: `apps/my-cloud-hub/src/projects/template-extraction/router.ts`
- Modify: `apps/my-cloud-hub/src/projects/template-extraction/__tests__/router.test.ts`

- [ ] **Step 1: Write failing public-route tests**

Test:

```text
GET /api/content-templates
GET /api/content-templates/:id
GET /api/content-templates/:id/cover
```

Assertions:

- Only live templates appear.
- Response does not contain `rules`, `sourceAssetKey`, `maskAssetKey`, or test product keys.
- Cover returns correct content type and immutable cache headers.
- Missing template returns 404.
- Draft template returns 404 through public routes.

- [ ] **Step 2: Write failing operator-route tests**

Test:

```text
POST /api/template-extraction/templates
POST /api/template-extraction/templates/:id/publish
```

Assertions:

- Both require the operator bearer token.
- Draft save accepts source image, serialized masks, rules, metadata, and optional successful test assets.
- Saving with `status: live` without successful test returns `409 TEMPLATE_NOT_TESTED`.
- Publishing a successfully tested draft returns public template metadata.

- [ ] **Step 3: Run route tests and verify failure**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/content-templates src/projects/template-extraction
```

Expected: FAIL because public routes and save/publish routes are absent.

- [ ] **Step 4: Implement public sanitized routes**

Public list response:

```ts
{
    success: true,
    templates: [{
        id,
        name,
        summary,
        category,
        platforms,
        status: 'live',
        href: `/create.html?template=${encodeURIComponent(id)}`,
        cover: `/api/content-templates/${encodeURIComponent(id)}/cover`,
        outputLabel,
        creditCost,
        fields: inputSchema,
        runtime: 'extracted',
    }],
}
```

Cover route reads only `coverAssetKey` or falls back to `testResultAssetKey`. Set:

```text
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
ETag: stored R2 etag
```

- [ ] **Step 5: Implement save and publish routes**

Validate:

- ID uses generated `tpl_${crypto.randomUUID()}` on first save.
- Name 1–80 characters.
- Summary 0–200 characters.
- Category 1–40 characters.
- Platforms contains 1–5 strings.
- Source, mask, cover, and test images obey MIME and 10MB limits.
- Rules pass `parseTemplateRules`.
- Mask JSON version is 1 and dimensions match source metadata.
- `live` requires a successful test timestamp and test result.

Return stable error codes and never return private asset keys.

- [ ] **Step 6: Mount public router**

Mount at `/api/content-templates`. Keep `/api/template-extraction/*` behind existing origin and operator-token protections.

- [ ] **Step 7: Run all backend tests**

Run:

```powershell
pnpm --filter my-cloud-hub test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/content-templates/router.ts apps/my-cloud-hub/src/projects/content-templates/__tests__/router.test.ts apps/my-cloud-hub/src/projects/template-extraction/router.ts apps/my-cloud-hub/src/projects/template-extraction/__tests__/router.test.ts apps/my-cloud-hub/src/index.ts
git commit -m "feat: publish extracted template catalog"
```

### Task 3: Add provider-neutral test and runtime generation

**Files:**
- Create: `apps/my-cloud-hub/src/projects/content-templates/runtime.ts`
- Create: `apps/my-cloud-hub/src/projects/content-templates/__tests__/runtime.test.ts`
- Modify: `apps/my-cloud-hub/src/projects/template-extraction/router.ts`
- Modify: `apps/my-cloud-hub/src/projects/content-templates/router.ts`

- [ ] **Step 1: Write failing runtime tests**

Test the runtime interface:

```ts
export type ExtractedTemplateRuntime = {
    generate(input: {
        template: ContentTemplateRecord
        sourceImage: string
        masks: SerializedMaskDocument
        productImage: string
        requirements: string
        requestId: string
    }): Promise<ProductSwapResult>
}
```

Verify:

- Default adapter calls `ProductSwapProvider.generate`.
- Target image is the stored source.
- Merchant/test product is `productImage`.
- Requirements contain all five rules.
- Requirements describe enabled replacement regions.
- Operator requirements append after fixed rules.
- Empty or disabled replacement masks are rejected.
- Provider failure maps without exposing internal rules.

- [ ] **Step 2: Run runtime tests and verify failure**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/content-templates/__tests__/runtime.test.ts
```

Expected: FAIL because `runtime.ts` does not exist.

- [ ] **Step 3: Implement non-native-mask prompt composition**

Compose:

```text
模板替换规则：
替换内容：{replacement}
必须保留：{preserve}
构图与位置：{composition}
光线与风格：{lighting}
禁止内容：{negative}

启用替换区域：
{region names and normalized bounding boxes}

用户本次要求：
{requirements or "无额外要求"}
```

Call the existing provider with the stored source as `targetImage` and new product as `productImage`. This is the first adapter. Keep the runtime interface capable of receiving a later native-mask adapter.

- [ ] **Step 4: Add the protected test endpoint**

```text
POST /api/template-extraction/test
```

Input includes current unsaved source image, masks, rules, test product, and requirements. It does not require a saved template ID.

Return:

```ts
{
    success: true,
    imageUrl: string,
    testedAt: number,
    provider: string,
}
```

Require operator token. Preserve stable provider error mapping.

- [ ] **Step 5: Add merchant generation endpoint**

```text
POST /api/content-templates/:id/generate
```

Input:

```ts
{
    productImage: string
    requirements: string
}
```

Only live templates are usable. Load private source/masks/rules inside the Worker and return the same public generation shape as existing product swap. Never return private template inputs.

- [ ] **Step 6: Run runtime and route tests**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/content-templates src/projects/template-extraction
pnpm --filter my-cloud-hub test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/content-templates/runtime.ts apps/my-cloud-hub/src/projects/content-templates/__tests__/runtime.test.ts apps/my-cloud-hub/src/projects/template-extraction/router.ts apps/my-cloud-hub/src/projects/content-templates/router.ts
git commit -m "feat: generate from extracted templates"
```

### Task 4: Add test, save, and publish controls to the workbench

**Files:**
- Modify: `apps/product-swap/admin/template-extraction/index.html`
- Modify: `apps/product-swap/admin/template-extraction/workbench.css`
- Modify: `apps/product-swap/admin/template-extraction/workbench.js`
- Modify: `apps/product-swap/admin/template-extraction/extraction-api.js`
- Modify: `apps/product-swap/admin/template-extraction/draft-store.js`
- Create: `apps/product-swap/tests/template-publishing-state.test.js`

- [ ] **Step 1: Write failing state-transition tests**

Test:

```js
assert.equal(canPublish({ rules: validRules, lastSuccessfulTest: null }), false);
assert.equal(canPublish({
    rules: validRules,
    lastSuccessfulTest: { imageDataUrl: 'data:image/png;base64,AA==', testedAt: 1 },
}), true);
```

Also test:

- Failed test keeps previous successful result.
- Editing masks or rules marks the previous test `stale: true`.
- Draft save is allowed with stale or absent test.
- Live save is rejected with stale test.

- [ ] **Step 2: Run state tests and verify failure**

Run:

```powershell
node --test apps/product-swap/tests/template-publishing-state.test.js
```

Expected: FAIL because publishing state helpers do not exist.

- [ ] **Step 3: Extend draft state**

Add:

```js
testProduct: null | { dataUrl, mimeType, name },
lastSuccessfulTest: null | {
    imageDataUrl,
    mimeType,
    testedAt,
    stale,
},
templateMetadata: {
    id: string,
    name: string,
    summary: string,
    category: string,
    platforms: string[],
    status: 'draft' | 'live',
},
stage:
    | 'analyzing'
    | 'annotating'
    | 'annotated'
    | 'extracting'
    | 'rules'
    | 'testing'
    | 'test_failed'
    | 'test_succeeded'
    | 'saved',
```

Export `canPublish`, `markTestStale`, and `applyTestResult`.

- [ ] **Step 4: Add workbench UI**

Add:

- Test product file input and product-library placeholder button.
- Optional test requirements.
- `testTemplateButton`.
- One result image.
- “修改标注” and “修改规则”.
- Template name, summary, category, platform checkboxes.
- Cover choice defaulting to last successful result.
- `saveTemplateDraft`.
- `publishTemplate`.

Do not add multi-result comparison.

- [ ] **Step 5: Extend extraction API client**

Add:

- `testTemplate(input)`.
- `saveTemplate(input)`.
- `publishTemplate(id)`.

Reuse the session bearer token. On test failure, leave `lastSuccessfulTest` unchanged and set stage `test_failed`.

- [ ] **Step 6: Wire save and publish**

Save payload includes:

- Source image.
- Serialized masks and enabled region metadata.
- Five rules.
- Template metadata.
- Last successful test product/result if not stale.

After save, retain returned template ID in the local draft. Publishing first saves current changes, then calls publish. Display a link to `/create.html?template={id}` after success.

- [ ] **Step 7: Run frontend tests**

Run:

```powershell
node --test apps/product-swap/tests/template-*.test.js
pnpm --filter product-swap test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add apps/product-swap/admin/template-extraction/index.html apps/product-swap/admin/template-extraction/workbench.css apps/product-swap/admin/template-extraction/workbench.js apps/product-swap/admin/template-extraction/extraction-api.js apps/product-swap/admin/template-extraction/draft-store.js apps/product-swap/tests/template-publishing-state.test.js
git commit -m "feat: test and publish extracted templates"
```

### Task 5: Load the remote live catalog

**Files:**
- Modify: `apps/product-swap/templates.js`
- Modify: `apps/product-swap/home.js`
- Modify: `apps/product-swap/creator-meta.js`
- Modify: `apps/product-swap/tests/template-catalog.test.js`
- Modify: `apps/product-swap/tests/home-contract.test.js`
- Modify: `apps/product-swap/tests/creator-contract.test.js`

- [ ] **Step 1: Write failing async catalog tests**

Test:

```js
const catalog = createTemplateCatalog({
    fetchImpl: async () => new Response(JSON.stringify({
        success: true,
        templates: [remoteTemplate],
    })),
    apiBase: 'https://api.example',
});
await catalog.refresh();
assert.equal(await catalog.getTemplateAsync(remoteTemplate.id), remoteTemplate);
assert.ok(catalog.listTemplates().some((item) => item.id === remoteTemplate.id));
```

Also verify:

- Static templates remain when remote fetch fails.
- Remote IDs cannot overwrite static IDs.
- Only `status: live` remote items merge.
- Search includes remote templates.

- [ ] **Step 2: Run catalog tests and verify failure**

Run:

```powershell
node --test apps/product-swap/tests/template-catalog.test.js
```

Expected: FAIL because async catalog APIs do not exist.

- [ ] **Step 3: Implement async merging**

Keep existing synchronous methods. Add:

- `createTemplateCatalog({ fetchImpl, apiBase })`.
- `refresh()`.
- `getTemplateAsync(id)`.

The global default catalog uses `resolveApiBase` equivalent logic without importing `script.js`. Cache a successful remote response in memory for the page lifetime only.

- [ ] **Step 4: Make home boot await catalog refresh**

Render static templates immediately, await `refresh()`, then rerender. On fetch failure retain static cards without an error banner.

- [ ] **Step 5: Make creator metadata resolution async**

`resolveCreatorTemplate` remains for static templates. Add `resolveCreatorTemplateAsync`, used during browser boot before generation listeners attach. Unknown or draft IDs redirect to `/`.

- [ ] **Step 6: Run catalog and page contracts**

Run:

```powershell
node --test apps/product-swap/tests/template-catalog.test.js apps/product-swap/tests/home-contract.test.js apps/product-swap/tests/creator-contract.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/product-swap/templates.js apps/product-swap/home.js apps/product-swap/creator-meta.js apps/product-swap/tests/template-catalog.test.js apps/product-swap/tests/home-contract.test.js apps/product-swap/tests/creator-contract.test.js
git commit -m "feat: load published template catalog"
```

### Task 6: Generate from a published template in the shared creator

**Files:**
- Modify: `apps/product-swap/create.html`
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/api-client.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`
- Modify: `apps/product-swap/tests/api-client.test.js`

- [ ] **Step 1: Write failing extracted-template payload tests**

Add:

```js
assert.deepEqual(buildExtractedTemplatePayload({
    product: 'product-data',
    requirements: '背景更亮',
}), {
    productImage: 'product-data',
    requirements: '背景更亮',
});
```

Test the API URL:

```text
/api/content-templates/tpl_1/generate
```

and stable error mapping for `TEMPLATE_NOT_FOUND`, `TEMPLATE_NOT_LIVE`, and provider failure.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
node --test apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/api-client.test.js
```

Expected: FAIL because extracted-template generation is absent.

- [ ] **Step 3: Configure creator inputs from runtime type**

For `runtime: 'extracted'`:

- Hide target-template upload because the source is stored server-side.
- Hide optional scene upload in the first runtime.
- Make product upload required.
- Change example formula to “热点模板 + 你的产品 = 发布效果”.
- Use remote cover for the template side.
- Keep requirements, generate, result, download, and refinement layout.

Static `product-swap` behavior remains unchanged.

- [ ] **Step 4: Add extracted-template generation**

Export:

```js
function buildExtractedTemplatePayload(state) {
    return {
        productImage: state.product,
        requirements: state.requirements.trim(),
    };
}
```

When active template runtime is `extracted`, call:

```js
apiClient.generateFromTemplate(
    activeTemplate.id,
    buildExtractedTemplatePayload(state),
)
```

Store task history with:

```js
taskType: 'content_template',
title: activeTemplate.name,
input: {
    templateId: activeTemplate.id,
    requirements,
},
```

Do not store private target image or masks in browser history.

- [ ] **Step 5: Add API client method**

```js
generateFromTemplate(templateId, payload)
```

POST to the encoded public endpoint and return the same normalized `{ imageUrl, assistantMessage, provider }` shape used by existing generation.

- [ ] **Step 6: Run frontend regression tests**

Run:

```powershell
pnpm --filter product-swap test
```

Expected: all existing product-swap behavior and new runtime tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/product-swap/create.html apps/product-swap/script.js apps/product-swap/api-client.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/api-client.test.js
git commit -m "feat: generate with published templates"
```

### Task 7: Verify end-to-end extraction, test, publish, and merchant use

**Files:**
- Modify: `apps/product-swap/tests/template-workbench-smoke.js`
- Modify: `apps/product-swap/tests/browser-smoke.js`
- Modify: `apps/product-swap/server/dev-server.js`
- Modify: `apps/product-swap/README.md`

- [ ] **Step 1: Add local mock endpoints**

Extend the local server with injected in-memory handlers for:

- Analyze.
- Extract rules.
- Test template.
- Save template.
- Publish template.
- List public templates.
- Generate from published template.

Mocks must obey the production response contracts rather than bypassing frontend code.

- [ ] **Step 2: Extend operator browser journey**

Verify:

1. Upload target.
2. Automatic marks appear.
3. Edit masks.
4. Extract five rules.
5. Upload test product.
6. Successful test result appears.
7. Save draft.
8. Publish.
9. Published creator link appears.

- [ ] **Step 3: Extend merchant browser journey**

In a new page:

1. Open home.
2. Wait for remote template card.
3. Open the published template.
4. Confirm target upload is hidden and product is required.
5. Upload product.
6. Generate.
7. Confirm result, download control, Works entry, and refinement controls remain usable.

- [ ] **Step 4: Run full verification**

Run:

```powershell
pnpm --filter product-swap test
pnpm --filter product-swap test:template-workbench
pnpm --filter product-swap test:browser
pnpm --filter product-swap build
pnpm --filter my-cloud-hub test
```

Expected: all commands succeed.

- [ ] **Step 5: Update README**

Document:

- Operator route.
- Required `TEMPLATE_ADMIN_TOKEN`.
- Required `TEMPLATE_ASSETS` R2 bucket.
- D1 migration `0005_content_templates.sql`.
- Public catalog and generation endpoints.
- Draft versus live test requirement.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/tests/template-workbench-smoke.js apps/product-swap/tests/browser-smoke.js apps/product-swap/server/dev-server.js apps/product-swap/README.md
git commit -m "test: cover extracted template publishing"
```

## Acceptance checklist

- [ ] Template metadata is stored in D1 and assets in R2.
- [ ] Public APIs never expose source images, masks, internal rules, or test products.
- [ ] Untested templates save as drafts but cannot publish.
- [ ] Failed tests do not overwrite the last successful result.
- [ ] Changing masks or rules marks an existing test stale.
- [ ] Published templates appear in the home catalog.
- [ ] Merchants can generate from a published template without receiving private template data.
- [ ] Existing static product-swap template remains functional.
- [ ] Complete frontend, browser, backend, and build suites pass.
