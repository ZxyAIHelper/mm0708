# WeChat Chat Screenshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a template that turns a store name, uploaded images, or a Tencent-selected real location into an editable AI-written WeChat-style single-chat PNG.

**Architecture:** Extend the manifest registry with one focused composite field, then mount a template-specific editor instead of adding its state to the generic form controller. The shared Cloudflare API calls the existing Doubao text endpoint and proxies Tencent map configuration/static previews; the browser validates the draft again and renders it deterministically to Canvas.

**Tech Stack:** Vanilla JavaScript, HTML/CSS, Canvas 2D, Node test runner, Hono, TypeScript, Vitest, Cloudflare Workers, Doubao Ark chat completions, Tencent Location Picker and Static Map API V2.

---

### Task 1: Register the template and shared browser contracts

**Files:**
- Create: `apps/product-swap/template-packs/wechat-chat-screenshot/manifest.js`
- Create: `apps/product-swap/chat-materials.js`
- Create: `apps/product-swap/tests/chat-materials.test.js`
- Modify: `apps/product-swap/server/template-registry.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/server/dev-server.js`
- Modify: `apps/product-swap/tests/template-registry.test.js`
- Modify: `apps/product-swap/tests/build.test.js`

- [ ] **Step 1: Write failing manifest and material tests**

Add tests that require:

```js
const {
    normalizeChatMaterials,
    validateChatMaterials,
} = require('../chat-materials');

assert.equal(registry.getTemplatePackage(
    'wechat-chat-screenshot',
).manifest.fields[0].type, 'chat-materials');

assert.deepEqual(normalizeChatMaterials({
    storeName: '  三山山  ',
    images: [],
    location: null,
    requirements: '  像朋友聊天  ',
}), {
    storeName: '三山山',
    images: [],
    location: null,
    requirements: '像朋友聊天',
});

assert.equal(validateChatMaterials({
    storeName: '',
    images: [],
    location: null,
    requirements: '',
}).message, '请至少填写店铺名称、上传图片或选择地点');
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
node --test apps/product-swap/tests/chat-materials.test.js apps/product-swap/tests/template-registry.test.js apps/product-swap/tests/build.test.js
```

Expected: failure because the module, field type, and manifest do not exist.

- [ ] **Step 3: Implement the manifest and pure material contract**

Export browser/CommonJS functions:

```js
normalizeChatMaterials(value)
validateChatMaterials(value)
normalizeLocation(value)
normalizeImages(value)
```

Use these limits:

```js
const LIMITS = {
    storeName: 60,
    requirements: 200,
    images: 3,
};
```

The manifest must be live at `/create.html?template=wechat-chat-screenshot`, use `chat-materials`, cost 0 beans for the first text-only release, and advertise a 1080×1920 PNG. Extend `FIELD_KEYS` with only:

```js
'chat-materials': [
    'key',
    'type',
    'label',
    'required',
    'minSources',
    'maxImages',
    'accept',
]
```

Add `chat-materials.js` to build and local static allowlists.

- [ ] **Step 4: Run focused tests**

Run the Step 2 command.

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/product-swap/template-packs/wechat-chat-screenshot/manifest.js apps/product-swap/chat-materials.js apps/product-swap/tests/chat-materials.test.js apps/product-swap/server/template-registry.js apps/product-swap/build.mjs apps/product-swap/server/dev-server.js apps/product-swap/tests/template-registry.test.js apps/product-swap/tests/build.test.js
git commit -m "feat: register chat screenshot template"
```

### Task 2: Add strict AI draft validation and the text provider

**Files:**
- Create: `apps/my-cloud-hub/src/projects/product-swap/chat-draft.ts`
- Create: `apps/my-cloud-hub/src/projects/product-swap/chat-provider.ts`
- Create: `apps/my-cloud-hub/src/projects/product-swap/__tests__/chat-draft.test.ts`
- Create: `apps/my-cloud-hub/src/projects/product-swap/__tests__/chat-provider.test.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/provider.ts`

- [ ] **Step 1: Write failing draft-validation tests**

Cover a valid 6-message draft and reject:

```ts
parseChatDraft({
    version: 1,
    contactName: '小林',
    messages: [
        { id: 'm1', side: 'right', type: 'image_ref', refId: 'image-1' },
        { id: 'm2', side: 'left', type: 'text', text: '看着就很好吃。' },
        { id: 'm3', side: 'right', type: 'location_ref', refId: 'store-location' },
        { id: 'm4', side: 'left', type: 'text', text: '位置也挺好找。' },
        { id: 'm5', side: 'right', type: 'text', text: '下次一起去。' },
        { id: 'm6', side: 'left', type: 'text', text: '可以呀。' },
    ],
}, {
    imageIds: ['image-1'],
    locationId: 'store-location',
});
```

Reject unknown keys, duplicate IDs, one-sided chats, fewer than 6 or more than 10 messages, text over 80 characters, unknown references, missing provided references, and repeated references.

- [ ] **Step 2: Run the focused validation test**

Run:

```powershell
npx vitest run src/projects/product-swap/__tests__/chat-draft.test.ts
```

from `apps/my-cloud-hub`.

Expected: failure because `chat-draft.ts` does not exist.

- [ ] **Step 3: Implement the request and response validators**

Export:

```ts
export function validateChatDraftRequest(value: unknown): ChatDraftRequest
export function parseChatDraft(value: unknown, refs: DraftRefs): ChatDraft
export function buildChatDraftMessages(input: ChatDraftRequest): ArkMessage[]
export function parseChatDraftContent(content: string, refs: DraftRefs): ChatDraft
```

`parseChatDraftContent` may remove exactly one outer Markdown code fence. Prompt data must be JSON-stringified inside explicit untrusted-data delimiters. Require every supplied image and location reference exactly once.

- [ ] **Step 4: Write failing provider tests**

Use a mocked `fetch` and assert:

```ts
expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/chat/completions');
expect(body.model).toBe('ep-chat');
expect(body.stream).toBe(false);
expect(result.draft.messages).toHaveLength(6);
expect(fetchMock).toHaveBeenCalledTimes(1);
```

Also return invalid JSON once, valid repaired JSON second, and assert exactly two calls. A second invalid response must throw `INVALID_CHAT_DRAFT`.

- [ ] **Step 5: Implement the text provider**

Export:

```ts
export async function generateChatDraft(
    input: ChatDraftRequest,
    env: ProductSwapEnv,
    fetchImpl: typeof fetch = fetch,
): Promise<ChatDraftResult>
```

Reuse `DOUBAO_API_KEY`, `DOUBAO_CHAT_ENDPOINT`, and `DOUBAO_ARK_BASE_URL`. Apply a 60-second timeout and a 1 MiB response limit. Never call `/images/generations`. On parse failure, send one repair request containing only the schema error and original response.

- [ ] **Step 6: Run focused backend tests**

Run:

```powershell
npx vitest run src/projects/product-swap/__tests__/chat-draft.test.ts src/projects/product-swap/__tests__/chat-provider.test.ts
```

Expected: both files pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/product-swap/chat-draft.ts apps/my-cloud-hub/src/projects/product-swap/chat-provider.ts apps/my-cloud-hub/src/projects/product-swap/provider.ts apps/my-cloud-hub/src/projects/product-swap/__tests__/chat-draft.test.ts apps/my-cloud-hub/src/projects/product-swap/__tests__/chat-provider.test.ts
git commit -m "feat: generate structured chat drafts"
```

### Task 3: Expose chat and Tencent map API routes

**Files:**
- Modify: `apps/my-cloud-hub/src/projects/product-swap/router.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`
- Modify: `apps/my-cloud-hub/wrangler.jsonc`

- [ ] **Step 1: Write failing route tests**

Require:

```ts
await app.request('/api/product-swap/chat-draft', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Origin: 'https://product-swap.mm0708.top',
    },
    body: JSON.stringify(validRequest),
});
```

to return `{ success: true, draft, provider: 'volcano', requestId }`.

Require `GET /map-config` to return:

```json
{
  "success": true,
  "key": "map-key",
  "referer": "product-swap"
}
```

Require `GET /map-preview?lat=39.998766&lng=116.273938` to call only:

```text
https://apis.map.qq.com/ws/staticmap/v2/
```

with fixed `zoom=16`, `size=720*260`, `maptype=roadmap`, one marker, and the server-side key. Invalid or missing coordinates return 400.

- [ ] **Step 2: Run route tests and confirm failure**

Run:

```powershell
npx vitest run src/projects/product-swap/__tests__/router.test.ts
```

from `apps/my-cloud-hub`.

Expected: 404 for the new routes.

- [ ] **Step 3: Implement routes and stable errors**

Add:

```ts
router.post('/chat-draft', handleChatDraft)
router.get('/map-config', handleMapConfig)
router.get('/map-preview', handleMapPreview)
```

`map-config` returns 503 `TENCENT_MAP_NOT_CONFIGURED` if either map variable is absent. `map-preview` validates finite latitude `3.5..53.6` and longitude `73.5..135.1`, URL-encodes all parameters, fetches only Tencent HTTPS, enforces a 2 MiB response limit, and returns `Cache-Control: public, max-age=86400`.

Declare non-secret `TENCENT_MAP_REFERER = "product-swap"` in Wrangler vars. Keep `TENCENT_MAP_KEY` out of the file so it can later be set with `wrangler secret put`.

- [ ] **Step 4: Run route and full hub tests**

Run:

```powershell
npx vitest run src/projects/product-swap/__tests__/router.test.ts
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/my-cloud-hub/src/projects/product-swap/router.ts apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts apps/my-cloud-hub/wrangler.jsonc
git commit -m "feat: add chat draft and map api routes"
```

### Task 4: Build the Tencent picker and chat API browser clients

**Files:**
- Create: `apps/product-swap/tencent-map-picker.js`
- Create: `apps/product-swap/chat-draft-client.js`
- Create: `apps/product-swap/tests/tencent-map-picker.test.js`
- Create: `apps/product-swap/tests/chat-draft-client.test.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/server/dev-server.js`
- Modify: `apps/product-swap/create.html`

- [ ] **Step 1: Write failing client tests**

Assert:

```js
assert.deepEqual(normalizePickerMessage({
    origin: 'https://apis.map.qq.com',
    data: {
        module: 'locationPicker',
        poiname: '颐和园',
        poiaddress: '北京市海淀区新建宫门路19号',
        cityname: '北京市',
        latlng: { lat: 39.998766, lng: 116.273938 },
    },
}), {
    id: 'store-location',
    name: '颐和园',
    address: '北京市海淀区新建宫门路19号',
    city: '北京市',
    lat: 39.998766,
    lng: 116.273938,
});
```

Reject any other origin, module, missing name/address, or invalid coordinate. Assert `buildPickerUrl` includes `search=1`, `type=1`, encoded key, and encoded referer. Assert the chat client posts to `/api/product-swap/chat-draft`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```powershell
node --test apps/product-swap/tests/tencent-map-picker.test.js apps/product-swap/tests/chat-draft-client.test.js
```

Expected: missing modules.

- [ ] **Step 3: Implement focused browser/CommonJS clients**

`TencentMapPicker` exports:

```js
getMapConfig()
buildPickerUrl(config)
normalizePickerMessage(event)
mapPreviewUrl(location)
```

`ChatDraftClient` exports:

```js
requestChatDraft(materials)
normalizeChatDraftResponse(value, materials)
```

Use `ProductSwapApi.apiJson`; use no direct WebService requests from the browser. Add both scripts before `script.js`, and add both files to build/local static lists.

- [ ] **Step 4: Run focused tests**

Run the Step 2 command.

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/product-swap/tencent-map-picker.js apps/product-swap/chat-draft-client.js apps/product-swap/tests/tencent-map-picker.test.js apps/product-swap/tests/chat-draft-client.test.js apps/product-swap/build.mjs apps/product-swap/server/dev-server.js apps/product-swap/create.html
git commit -m "feat: add chat and tencent map clients"
```

### Task 5: Implement deterministic layout and Canvas export

**Files:**
- Create: `apps/product-swap/wechat-chat-renderer.js`
- Create: `apps/product-swap/tests/wechat-chat-renderer.test.js`
- Create: `apps/product-swap/assets/chat-avatar-left.svg`
- Create: `apps/product-swap/assets/chat-avatar-right.svg`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/server/dev-server.js`
- Modify: `apps/product-swap/create.html`

- [ ] **Step 1: Write failing layout tests**

Test pure functions:

```js
const layout = layoutChat({
    width: 1080,
    height: 1920,
    messages: validMessages,
    measureText: (text) => text.length * 32,
    assets: validAssets,
});

assert.equal(layout.width, 1080);
assert.equal(layout.height, 1920);
assert.equal(layout.items.length, validMessages.length);
assert.equal(layout.overflow, false);
assert.ok(layout.items.every((item) => item.bottom <= 1800));
```

Add cases for Chinese wrapping, long Latin words, image aspect ratios, location-card height, both sides, deleted messages, and overflow.

- [ ] **Step 2: Run the renderer test and confirm failure**

Run:

```powershell
node --test apps/product-swap/tests/wechat-chat-renderer.test.js
```

Expected: missing renderer.

- [ ] **Step 3: Implement pure layout, drawing, and export**

Export:

```js
wrapMessageText(text, maxWidth, measureText)
layoutChat(input)
drawChat(canvas, layout, resources)
renderChatPng(draft, materials, options)
```

Use a 1080×1920 backing canvas, explicit numeric spacing constants, round-rect paths, white/green bubbles, fixed 88px avatars, decoded Data URL images, and map preview blobs converted to Data URLs. Throw `CHAT_OVERFLOW` if content enters the bottom safe area. Return a PNG Blob and object URL without mutating draft data.

- [ ] **Step 4: Run focused renderer tests**

Run the Step 2 command.

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/product-swap/wechat-chat-renderer.js apps/product-swap/tests/wechat-chat-renderer.test.js apps/product-swap/assets/chat-avatar-left.svg apps/product-swap/assets/chat-avatar-right.svg apps/product-swap/build.mjs apps/product-swap/server/dev-server.js apps/product-swap/create.html
git commit -m "feat: render wechat style chat png"
```

### Task 6: Build the chat-material editor

**Files:**
- Create: `apps/product-swap/wechat-chat-editor.js`
- Create: `apps/product-swap/tests/wechat-chat-editor.test.js`
- Modify: `apps/product-swap/create.html`
- Modify: `apps/product-swap/app.css`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/server/dev-server.js`

- [ ] **Step 1: Write failing editor-state tests**

Test:

```js
const state = createChatEditorState();
state.setStoreName('三山山');
state.setDraft(validDraft);
state.editText('m2', '真的很不错。');
state.toggleSide('m2');
state.removeMessage('m6');

assert.equal(state.snapshot().materials.storeName, '三山山');
assert.equal(state.snapshot().draft.messages[1].text, '真的很不错。');
assert.equal(state.snapshot().draft.messages[1].side, 'right');
assert.equal(state.snapshot().draft.messages.length, 5);
```

Reject deleting below 2 messages, drafts without both sides, more than 3 images, and text over 80 characters. Verify failed regeneration preserves the old draft.

- [ ] **Step 2: Run focused editor tests and confirm failure**

Run:

```powershell
node --test apps/product-swap/tests/wechat-chat-editor.test.js
```

Expected: missing editor.

- [ ] **Step 3: Implement state and mount function**

Export:

```js
createChatEditorState(initial)
createSafeExampleDraft(materials)
mountWechatChatEditor({ section, field, api, map, renderer })
```

The mounted editor owns material inputs, picker dialog, AI loading/error states, message editing, preview refresh, regenerate, and PNG download. Use `textContent`, DOM methods, and explicit event listeners; do not use `innerHTML` for AI or location content.

Create a semantic `<dialog>` with an iframe for the map picker and a close button. If map config returns 503, disable only the location button and show “腾讯地图 Key 待配置”.

- [ ] **Step 4: Add responsive styles**

Use a two-column desktop layout above 960px and a single column below it. Keep the preview at a 9:16 aspect ratio, use a maximum visual width of 420px, make editor controls at least 44px high, and ensure the map dialog fills small screens without horizontal scroll.

- [ ] **Step 5: Run editor and responsive contract tests**

Run:

```powershell
node --test apps/product-swap/tests/wechat-chat-editor.test.js apps/product-swap/tests/responsive-contract.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/wechat-chat-editor.js apps/product-swap/tests/wechat-chat-editor.test.js apps/product-swap/create.html apps/product-swap/app.css apps/product-swap/build.mjs apps/product-swap/server/dev-server.js
git commit -m "feat: add editable chat screenshot creator"
```

### Task 7: Wire the composite field into the creation page

**Files:**
- Modify: `apps/product-swap/creator-form.js`
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/tests/creator-form.test.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`
- Add: `apps/product-swap/assets/wechat-chat-screenshot-cover.svg`

- [ ] **Step 1: Write failing integration contract tests**

Require initial values for `chat-materials` to be:

```js
{
    storeName: '',
    images: [],
    location: null,
    requirements: '',
}
```

Require `script.js` to call `mountWechatChatEditor` for the composite field and to skip the image-generation Service Worker path for this template. Require the manifest cover to resolve to the new SVG.

- [ ] **Step 2: Run focused integration tests and confirm failure**

Run:

```powershell
node --test apps/product-swap/tests/creator-form.test.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/template-catalog.test.js
```

Expected: failures for missing composite-field integration.

- [ ] **Step 3: Implement the smallest generic hook**

In `creator-form.js`, initialize and validate `chat-materials` through `ChatMaterials`.

In `script.js`, branch at field mount time:

```js
if (field.type === 'chat-materials') {
    chatEditor = WechatChatEditor.mountWechatChatEditor({
        section,
        field,
        api: ChatDraftClient,
        map: TencentMapPicker,
        renderer: WechatChatRenderer,
    });
    return;
}
```

When the active template is `wechat-chat-screenshot`, hide image-generation-only result, refinement, version-history, and bean-cost controls. The editor's own actions become the only generation and export controls.

Create a compact SVG cover that previews white/green bubbles and a location card without brand logos.

- [ ] **Step 4: Run focused and full product tests**

Run:

```powershell
node --test apps/product-swap/tests/creator-form.test.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/template-catalog.test.js
npm test
```

from `apps/product-swap`.

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/product-swap/creator-form.js apps/product-swap/script.js apps/product-swap/tests/creator-form.test.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/assets/wechat-chat-screenshot-cover.svg
git commit -m "feat: integrate chat screenshot workflow"
```

### Task 8: Browser verification and configuration handoff

**Files:**
- Create: `apps/product-swap/tests/wechat-chat-browser-smoke.js`
- Modify: `apps/product-swap/package.json`
- Modify: `apps/product-swap/docs/superpowers/specs/2026-07-25-wechat-chat-screenshot-design.md`

- [ ] **Step 1: Add a browser smoke test with mocked external services**

The test must:

```js
await page.setRequestInterception(true);
```

and mock `map-config`, `map-preview`, and `chat-draft`. Verify name-only creation, an injected trusted Tencent picker message, image upload, 6-message preview, text editing, side switching, deletion, and a PNG download whose first eight bytes are the PNG signature.

- [ ] **Step 2: Run build and browser smoke test**

Run:

```powershell
npm run build
node tests/wechat-chat-browser-smoke.js
```

from `apps/product-swap`.

Expected: build succeeds and browser smoke passes.

- [ ] **Step 3: Run all verification suites**

Run:

```powershell
npm test
npm run test:browser
```

from `apps/product-swap`, then:

```powershell
npm test -- --run
```

from `apps/my-cloud-hub`.

Expected: all suites pass with no unhandled rejections.

- [ ] **Step 4: Perform a local visual check**

Start:

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:8791/create.html?template=wechat-chat-screenshot
```

Check desktop and 390px mobile viewport. Save one local screenshot and one exported PNG, verify text, avatars, image message, map card, scroll behavior, and no overlap. Do not commit verification artifacts.

- [ ] **Step 5: Record the configuration and deploy**

Append a short implementation note to the design document recording:

- `TENCENT_MAP_KEY` has been stored with Cloudflare Secrets and is not present in the repository.
- Tencent Console still requires the production domain/referer whitelist.

Deploy the shared API first, smoke-check `/api/product-swap/map-config`, then deploy `apps/product-swap`. Never print the Key while checking the response.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/tests/wechat-chat-browser-smoke.js apps/product-swap/package.json apps/product-swap/docs/superpowers/specs/2026-07-25-wechat-chat-screenshot-design.md
git commit -m "test: verify chat screenshot workflow"
```
