# Food Copy Layout Production Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deployed Cloudflare Worker honor the modular food template contract, make production image results safely downloadable, and enforce public template-catalog isolation as the package count grows.

**Architecture:** The production Worker gets a small template-strategy module that validates template-specific request fields, orders images, and constructs the final prompt before invoking the existing Volcano provider. Volcano returns bounded Base64 JPEG data instead of expiring third-party URLs; the browser download model validates PNG and JPEG data consistently. The Node template registry publishes an explicit public DTO and rejects malformed or private manifest properties.

**Tech Stack:** Cloudflare Workers, Hono, TypeScript, Vitest Workers pool, Node.js CommonJS, native browser JavaScript, Node Test Runner.

---

### Task 1: Enforce the public template manifest boundary

**Files:**
- Modify: `apps/product-swap/server/template-registry.js`
- Modify: `apps/product-swap/tests/template-registry.test.js`
- Modify: `apps/product-swap/tests/template-catalog.test.js`

- [ ] **Step 1: Write failing registry tests**

Add tests proving:

```js
assert.throws(
    () => validateManifest({ ...validManifest, prompt: 'private' }, 'sample'),
    /unknown manifest key prompt/,
);
assert.throws(
    () => validateManifest({
        ...validManifest,
        fields: [{ key: 'messages', type: 'text', label: 'Messages' }],
    }, 'sample'),
    /reserved field key messages/,
);
```

Also cover invalid field types, choice defaults outside options, unsupported image MIME values, non-boolean defaults, invalid text limits, and public-catalog omission of any non-public property.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd apps/product-swap
node --test tests/template-registry.test.js tests/template-catalog.test.js
```

Expected: failures showing that unknown manifest keys and malformed field schemas currently pass.

- [ ] **Step 3: Implement a discriminated manifest validator**

Define:

```js
const PUBLIC_MANIFEST_KEYS = new Set([
    'id', 'taskType', 'name', 'summary', 'category', 'platforms',
    'tags', 'status', 'href', 'cover', 'outputLabel', 'creditCost',
    'fields', 'quickPrompts',
]);
const RESERVED_FIELD_KEYS = new Set([
    'templateId', 'previousImage', 'messages', 'conversationId',
    'generatedAt', 'requestId', '__proto__', 'constructor', 'prototype',
]);
```

Reject unknown top-level keys. Validate common field properties plus exact properties for `image`, `choice`, `boolean`, and `text`. Choice defaults must be present in `options`; image accepts must come from the supported MIME allowlist; text limits must be positive integers.

- [ ] **Step 4: Build an explicit public DTO**

Replace whole-manifest serialization with an explicit projection:

```js
function publicManifest(manifest) {
    return {
        id: manifest.id,
        taskType: manifest.taskType,
        name: manifest.name,
        summary: manifest.summary,
        category: manifest.category,
        platforms: [...manifest.platforms],
        tags: [...manifest.tags],
        status: manifest.status,
        href: manifest.href,
        cover: manifest.cover,
        outputLabel: manifest.outputLabel,
        creditCost: manifest.creditCost,
        fields: manifest.fields.map((field) => ({ ...field })),
        quickPrompts: [...(manifest.quickPrompts || [])],
    };
}
```

`publicCatalog()` must return only these DTOs.

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd apps/product-swap
node --test tests/template-registry.test.js tests/template-catalog.test.js
npm test
npm run build
```

Expected: all pass and `dist/template-catalog.js` contains no `prompt` or internal property.

Commit:

```bash
git commit -m "fix: enforce public template manifests"
```

### Task 2: Route production Worker generation by template

**Files:**
- Create: `apps/my-cloud-hub/src/projects/product-swap/template-strategies.ts`
- Create: `apps/my-cloud-hub/src/projects/product-swap/__tests__/template-strategies.test.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/provider.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/router.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/prompt-builder.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/volcano-provider.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/__tests__/volcano-provider.test.ts`

- [ ] **Step 1: Write failing production-router tests**

Add a `food-copy-layout` request with `targetImage`, `aspectRatio: "3:4"`, `showDateTime: true`, an RFC 3339 `generatedAt`, and spaced requirements. Assert the provider receives:

```ts
expect(input.templateId).toBe('food-copy-layout')
expect(input.prompt).toContain('真实随手分享')
expect(input.prompt).toContain('2026-07-25')
expect(input.prompt).toContain('不得编造店名、价格、地点、菜名或食材')
expect(input.images).toEqual([targetImage])
```

Add rejection tests for unknown/coming-soon templates, invalid ratios, non-boolean switches, invalid timestamps, and missing required images. Preserve legacy product-swap requests with no `templateId`.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd apps/my-cloud-hub
npx vitest run src/projects/product-swap/__tests__/router.test.ts
```

Expected: the food fields are ignored and the legacy product prompt is supplied.

- [ ] **Step 3: Implement Worker template strategies**

Create typed validated input:

```ts
export type TemplateGeneration = {
    templateId: 'product-swap' | 'food-copy-layout'
    prompt: string
    images: string[]
    previousImage?: string
    requirements: string
    conversationId: string
    messages: ProductSwapMessage[]
}
```

Implement `validateTemplateRequest()` and `buildTemplateGeneration()`. The food prompt must match the local strategy: Shanghai time, selected/original ratio, single-item versus whole-table copy lengths, safe text placement, subject/utensil/face protection, factuality, one image, and minimum-change refinement. User text must remain explicitly delimited as untrusted edit intent.

- [ ] **Step 4: Make the provider execute the strategy output**

Extend `ProductSwapInput` with `templateId`, `prompt`, and `images`. The router constructs these values; the provider sends `input.prompt` and `input.images`. The optional chat composer may refine product-swap prompts only; it must not rewrite food operational constraints.

- [ ] **Step 5: Return bounded Base64 image results**

Per the Volcano ImageGenerations API, request:

```ts
response_format: 'b64_json'
```

Require a canonical, bounded Base64 response and return:

```ts
imageUrl: `data:image/jpeg;base64,${firstImage.b64_json}`
```

Do not return third-party provider URLs from this route.

- [ ] **Step 6: Verify Worker behavior**

Run:

```bash
cd apps/my-cloud-hub
npx vitest run src/projects/product-swap
npx tsc --noEmit
```

Expected: production router, strategy, and Volcano provider tests pass with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: route production image templates"
```

### Task 3: Support production JPEG downloads and template guidance

**Files:**
- Modify: `apps/product-swap/version-history.js`
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/create.html`
- Modify: `apps/product-swap/creator-meta.js`
- Modify: `apps/product-swap/tests/version-history.test.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`
- Modify: `apps/product-swap/tests/creator-contract.test.js`
- Modify: `apps/product-swap/tests/browser-smoke.js`

- [ ] **Step 1: Write failing JPEG download tests**

Use a real valid JPEG fixture and assert:

```js
const parsed = parseDownloadDataUrl(validJpegDataUrl);
assert.equal(parsed.mimeType, 'image/jpeg');
assert.equal(parsed.extension, 'jpg');
```

Add invalid/truncated JPEG, excessive dimensions, noncanonical Base64, network MIME mismatch, and filename-extension tests.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd apps/product-swap
node --test tests/version-history.test.js tests/frontend-contract.test.js
```

Expected: JPEG is rejected by the PNG-only download policy.

- [ ] **Step 3: Generalize the bounded image download policy**

Keep PNG structural validation. Add JPEG SOI/segment/SOF/SOS/EOI parsing, width/height/pixel limits, and browser decode verification. Permit only canonical `data:image/png` and `data:image/jpeg`, plus same-origin network responses with matching supported MIME. Return the verified extension from the policy so `script.js` downloads `.png` or `.jpg` correctly.

- [ ] **Step 4: Make upload guidance schema-driven**

Give the static helper text an ID. In `creator-meta.js`, render guidance from the active schema:

```js
const imageCount = manifest.fields.filter((field) => field.type === 'image').length;
guidance.textContent = imageCount === 1
    ? '上传一张清晰原图，保留完整菜品内容。'
    : '准备目标图；产品图和场景图可按需补充。';
```

Do not hard-code `food-copy-layout`.

- [ ] **Step 5: Extend browser smoke**

Exercise a valid JPEG current result through the safe download policy without allowing a real filesystem download to escape the test. Assert the computed filename extension and that invalid foreign URLs remain rejected.

- [ ] **Step 6: Full verification**

Run:

```bash
cd apps/product-swap
npm test
npm run build
npm run test:browser

cd ../my-cloud-hub
npx vitest run
npx tsc --noEmit
```

Expected: all commands exit zero. The production-shaped Base64 JPEG result can be selected, refined, restored, and downloaded.

- [ ] **Step 7: Commit**

```bash
git commit -m "fix: support production image downloads"
```

### Task 4: Final cross-runtime verification

**Files:**
- Modify tests only if a real cross-runtime regression is exposed.

- [ ] **Step 1: Verify public catalog isolation**

Run the product-swap build and execute `dist/template-catalog.js` in a VM. Assert the result equals the public DTO and contains no unknown/private keys.

- [ ] **Step 2: Verify the production-shaped request**

Run a Worker router test with the exact browser food payload. Assert template fields survive validation and the provider receives the food strategy prompt and ordered images.

- [ ] **Step 3: Run all relevant suites**

```bash
cd apps/product-swap
npm test
npm run build
npm run test:browser

cd ../my-cloud-hub
npx vitest run
npx tsc --noEmit

cd ../..
git diff --check
git status --short
```

Expected: all tests and builds pass; only implementation-plan files are changed; no dev server or browser process remains.

- [ ] **Step 4: Commit any verification-only fixes**

```bash
git commit -m "test: verify production food layout flow"
```
