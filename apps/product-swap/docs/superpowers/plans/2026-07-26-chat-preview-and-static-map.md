# Chat Preview and Static Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the exported chat screenshot ratio in the browser preview, visibly mark fallback locations, and reuse one server-proxied Tencent static map image across the editor and PNG renderer.

**Architecture:** Location normalization keeps a UI-only `fallback` flag, while the chat client serializes a strict backend-compatible location object. `tencent-map-picker.js` owns a page-session Promise cache for static map images; the editor and renderer share that loader, so a selected coordinate is requested at most once and failures are not retried until refresh.

**Tech Stack:** Browser JavaScript, Canvas 2D, CSS, Node.js test runner, Cloudflare Workers

---

### Task 1: Preserve and safely contain the fallback marker

**Files:**
- Modify: `apps/product-swap/tests/tencent-map-picker.test.js`
- Modify: `apps/product-swap/tests/chat-materials.test.js`
- Modify: `apps/product-swap/tests/chat-draft-client.test.js`
- Modify: `apps/product-swap/tencent-map-picker.js`
- Modify: `apps/product-swap/chat-materials.js`
- Modify: `apps/product-swap/chat-draft-client.js`

- [ ] **Step 1: Add failing normalization and request tests**

Update the Tencent search fixture to include `fallback: true` and expect:

```js
{
    id: 'store-location',
    sourceId: 'fallback-shenzhen-hubeili',
    name: '深圳湖贝里',
    address: '深圳市罗湖区湖贝路1068号',
    city: '深圳市',
    lat: 22.546394,
    lng: 114.128133,
    fallback: true,
}
```

Add a `normalizeLocation` assertion that preserves only a strict boolean:

```js
assert.equal(normalizeLocation({
    id: 'store-location',
    name: '深圳湖贝里',
    address: '深圳市罗湖区湖贝路1068号',
    city: '深圳市',
    lat: 22.546394,
    lng: 114.128133,
    fallback: true,
}).fallback, true);
```

In the request client test, pass a location containing `fallback: true` and assert:

```js
assert.equal(
    Object.hasOwn(JSON.parse(call.options.body).location, 'fallback'),
    false,
);
```

- [ ] **Step 2: Run the three tests and verify RED**

Run:

```powershell
Set-Location apps/product-swap
node --test tests/tencent-map-picker.test.js tests/chat-materials.test.js tests/chat-draft-client.test.js
```

Expected: fallback-preservation assertions fail because both normalizers currently drop the property.

- [ ] **Step 3: Preserve fallback in UI normalizers**

Add to the returned location in both normalizers:

```js
fallback: value?.fallback === true,
```

For Tencent search items, use:

```js
fallback: item?.fallback === true,
```

- [ ] **Step 4: Serialize a strict AI request location**

In `requestChatDraft`, build:

```js
const requestMaterials = {
    ...normalized,
    location: normalized.location ? {
        id: normalized.location.id,
        name: normalized.location.name,
        address: normalized.location.address,
        city: normalized.location.city,
        lat: normalized.location.lat,
        lng: normalized.location.lng,
    } : null,
};
```

Spread `requestMaterials` into the request body. Continue passing `normalized` to response validation so the editor retains its UI-only marker.

- [ ] **Step 5: Run the tests and verify GREEN**

Run the command from Step 2.

Expected: all selected tests pass and request JSON contains no `fallback` property.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/tests/tencent-map-picker.test.js apps/product-swap/tests/chat-materials.test.js apps/product-swap/tests/chat-draft-client.test.js apps/product-swap/tencent-map-picker.js apps/product-swap/chat-materials.js apps/product-swap/chat-draft-client.js
git commit -m "feat: preserve fallback location status safely"
```

### Task 2: Cache one static map load per coordinate

**Files:**
- Modify: `apps/product-swap/tests/tencent-map-picker.test.js`
- Modify: `apps/product-swap/tencent-map-picker.js`

- [ ] **Step 1: Add failing cache tests**

Import `loadMapPreviewImage` and test a successful cached load:

```js
const created = [];
const imageFactory = () => {
    const image = {};
    created.push(image);
    return image;
};
const first = loadMapPreviewImage(location, {
    apiBase: 'https://api.example.com',
    imageFactory,
});
const second = loadMapPreviewImage(location, {
    apiBase: 'https://api.example.com',
    imageFactory,
});
assert.strictEqual(first, second);
created[0].onload();
assert.strictEqual(await first, created[0]);
assert.equal(created.length, 1);
```

Use a different coordinate for the failure case, call `onerror`, and assert two calls return the same Promise resolving to `null` with one created image.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
Set-Location apps/product-swap
node --test tests/tencent-map-picker.test.js
```

Expected: FAIL because `loadMapPreviewImage` is not exported.

- [ ] **Step 3: Implement the page-session cache**

Add:

```js
const mapPreviewImageCache = new Map();

function loadMapPreviewImage(
    location,
    {
        apiBase = global.API_BASE_URL || DEFAULT_API_BASE,
        imageFactory = () => new Image(),
    } = {},
) {
    const source = mapPreviewUrl(location, apiBase);
    if (mapPreviewImageCache.has(source)) {
        return mapPreviewImageCache.get(source);
    }
    const promise = new Promise((resolve) => {
        const image = imageFactory();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.crossOrigin = 'anonymous';
        image.src = source;
    });
    mapPreviewImageCache.set(source, promise);
    return promise;
}
```

Export `loadMapPreviewImage` from the module API. Do not delete failed cache entries and do not add retry logic.

- [ ] **Step 4: Run the test and verify GREEN**

Run the command from Step 2.

Expected: all Tencent picker tests pass; each test URL creates one image.

- [ ] **Step 5: Commit**

```powershell
git add apps/product-swap/tests/tencent-map-picker.test.js apps/product-swap/tencent-map-picker.js
git commit -m "feat: cache static map previews per session"
```

### Task 3: Mark fallback locations and show the selected static map

**Files:**
- Modify: `apps/product-swap/tests/wechat-chat-editor.test.js`
- Modify: `apps/product-swap/wechat-chat-editor.js`
- Modify: `apps/product-swap/app.css`

- [ ] **Step 1: Add failing editor contract assertions**

Assert the editor source includes these stable contracts:

```js
assert.match(source, /备用位置/);
assert.match(source, /地图暂不可用，已提供备用地点/);
assert.match(source, /loadMapPreviewImage/);
assert.match(source, /正在加载地图/);
assert.match(source, /chat-location-fallback-badge/);
assert.match(source, /chat-location-map-preview/);
```

- [ ] **Step 2: Run the editor test and verify RED**

Run:

```powershell
Set-Location apps/product-swap
node --test tests/wechat-chat-editor.test.js
```

Expected: FAIL because the fallback badge and selected map preview are absent.

- [ ] **Step 3: Add the fallback badge and status copy**

When a search contains a fallback item, set:

```js
searchStatus.textContent =
    '地图暂不可用，已提供备用地点';
```

Append the badge to fallback results and to the selected summary:

```js
element(
    'span',
    'chat-location-fallback-badge',
    '备用位置',
)
```

- [ ] **Step 4: Load one selected map preview**

In `renderLocation`, append a status element with “正在加载地图…”, then call:

```js
map.loadMapPreviewImage(location).then((image) => {
    const current = state.snapshot().materials.location;
    if (
        !current
        || current.lat !== location.lat
        || current.lng !== location.lng
    ) return;
    if (!image) {
        mapPreview.textContent = '地图暂不可用';
        return;
    }
    image.className = 'chat-location-map-preview';
    image.alt = `${location.name}地图`;
    mapPreview.replaceChildren(image);
});
```

- [ ] **Step 5: Style the badge and map**

Add:

```css
.chat-location-fallback-badge {
    justify-self: start;
    border-radius: 999px;
    padding: 3px 8px;
    background: #fff1d6;
    color: #9a5b00;
    font-size: 12px;
    font-weight: 700;
}

.chat-location-map-preview {
    display: block;
    width: 100%;
    aspect-ratio: 640 / 260;
    border-radius: 10px;
    object-fit: cover;
}
```

- [ ] **Step 6: Run the editor test and verify GREEN**

Run the command from Step 2.

Expected: all editor tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/product-swap/tests/wechat-chat-editor.test.js apps/product-swap/wechat-chat-editor.js apps/product-swap/app.css
git commit -m "feat: label fallback locations in chat editor"
```

### Task 4: Reuse the cached map in canvas and remove the fake marker

**Files:**
- Modify: `apps/product-swap/tests/wechat-chat-renderer.test.js`
- Modify: `apps/product-swap/wechat-chat-renderer.js`

- [ ] **Step 1: Add failing renderer assertions**

Add a test loader returning a sentinel image and assert one call for a multi-page render:

```js
let calls = 0;
const mapPreviewImage = async () => {
    calls += 1;
    return { width: 640, height: 260 };
};
await renderChatPages(draft, materials, {
    canvasFactory,
    mapPreviewImage,
});
assert.equal(calls, 1);
```

Add a source contract assertion:

```js
assert.match(source, /地图暂不可用/);
assert.doesNotMatch(source, /ctx\.arc\(\s*item\.x \+ item\.width \/ 2/);
```

- [ ] **Step 2: Run the renderer test and verify RED**

Run:

```powershell
Set-Location apps/product-swap
node --test tests/wechat-chat-renderer.test.js
```

Expected: FAIL because the renderer has no `mapPreviewImage` option and still draws a green dot.

- [ ] **Step 3: Accept and reuse the shared loader**

Add `mapPreviewImage = global.TencentMapPicker?.loadMapPreviewImage` to render options and pass it to `loadResources`. Prefer this loader when present; keep the existing URL loader only as a compatibility fallback for tests and older callers.

- [ ] **Step 4: Replace the fake marker**

In the no-image branch, draw a light gray area and:

```js
ctx.fillStyle = '#767676';
ctx.font = '400 32px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(
    '地图暂不可用',
    item.x + item.width / 2,
    item.y + 90,
);
```

- [ ] **Step 5: Run the renderer test and verify GREEN**

Run the command from Step 2.

Expected: all renderer tests pass and the existing `1179×2556` assertions remain green.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/tests/wechat-chat-renderer.test.js apps/product-swap/wechat-chat-renderer.js
git commit -m "fix: reuse real maps in chat screenshot rendering"
```

### Task 5: Fix only the browser preview ratio

**Files:**
- Modify: `apps/product-swap/tests/wechat-chat-editor.test.js`
- Modify: `apps/product-swap/app.css`

- [ ] **Step 1: Add a failing CSS contract test**

Read `app.css`, isolate `.chat-preview-canvas`, and assert:

```js
assert.match(rule, /height:\s*auto/);
assert.doesNotMatch(rule, /aspect-ratio:\s*9\s*\/\s*16/);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
Set-Location apps/product-swap
node --test tests/wechat-chat-editor.test.js
```

Expected: FAIL because the preview rule still forces `9 / 16`.

- [ ] **Step 3: Correct the CSS**

Replace:

```css
aspect-ratio: 9 / 16;
```

with:

```css
height: auto;
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the command from Step 2.

Expected: all editor tests pass without changing canvas width or height attributes.

- [ ] **Step 5: Commit**

```powershell
git add apps/product-swap/tests/wechat-chat-editor.test.js apps/product-swap/app.css
git commit -m "fix: preserve chat preview aspect ratio"
```

### Task 6: Safe verification and frontend deployment

**Files:**
- Verify: `apps/product-swap`

- [ ] **Step 1: Run all frontend unit tests**

```powershell
Set-Location apps/product-swap
npm test
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the intercepted browser smoke test**

```powershell
Set-Location apps/product-swap
node tests/wechat-chat-browser-smoke.js
```

Expected: two or more screenshots render at `1179×2556`; all API responses are intercepted.

- [ ] **Step 3: Inspect the generated preview ratio locally**

Use the smoke output screenshot and confirm the canvas preview width divided by height is approximately `1179 / 2556`, while the exported PNG metadata is exactly `1179×2556`.

- [ ] **Step 4: Verify no retry and no browser Key exposure**

```powershell
rg -n "retry|setInterval|while \\(" tencent-map-picker.js wechat-chat-renderer.js
rg -n "TENCENT_MAP_KEY|map-key" *.js
```

Expected: no retry/polling code and no Tencent Key in frontend source.

- [ ] **Step 5: Deploy the existing frontend Worker**

Load the Cloudflare skill, then run:

```powershell
npm run deploy
```

Expected: Wrangler reports a successful product-swap deployment.

- [ ] **Step 6: Verify only deployment metadata and static frontend content**

Confirm the new Worker version is active and the deployed CSS contains `height:auto` for `.chat-preview-canvas`. Do not request the map preview, location search, or AI generation endpoints.

- [ ] **Step 7: Confirm a clean worktree**

```powershell
git status --short
```

Expected: no output.
