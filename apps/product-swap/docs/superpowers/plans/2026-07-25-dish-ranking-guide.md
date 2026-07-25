# Dish Ranking Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-dish ranking-guide template with owned-dish prioritization, automatic library fillers, four layouts, reusable dish-list form support, and a public read-only dish asset API.

**Architecture:** Extend the manifest registry with one composite `dish-list` field and keep the existing catalog-driven creator. Store a validated static dish catalog beside compressed WebP assets; local Node and the Cloudflare Worker expose the same query behavior. The browser resolves fillers before dispatch so the existing external generation API receives data URLs and never needs to fetch remote assets.

**Tech Stack:** Node.js CommonJS tests, vanilla JavaScript, Node test runner, Sharp, Cloudflare Workers static assets, HTML/CSS.

---

## File map

- `server/template-registry.js`: validate and publish `dish-list` fields.
- `template-packs/dish-ranking-guide/manifest.js`: declare the new template.
- `template-packs/dish-ranking-guide/prompt.js`: encode layout, ownership, image ordering, and refinement rules.
- `dish-assets/catalog.json`: source-of-truth metadata.
- `dish-assets/library.js`: validate, filter, and select catalog entries.
- `assets/dish-library/*.webp`: compressed crops from the supplied reference screenshot.
- `tools/extract-dish-assets.js`: reproducible Sharp crop script.
- `server/dev-server.js`: dish asset API and multi-dish generation validation.
- `worker.js`, `wrangler.jsonc`, `build.mjs`: production resource API and static asset routing.
- `creator-form.js`, `creator-meta.js`, `script.js`, `style.css`: dish-list state, UI, uploads, fillers, history, and dispatch.
- `generation-worker.js`: generation protocol version 3.
- `tests/*.test.js`: focused unit and contract coverage.

### Task 1: Manifest field and template catalog

**Files:**
- Modify: `server/template-registry.js`
- Create: `template-packs/dish-ranking-guide/manifest.js`
- Create: `tests/dish-ranking-manifest.test.js`

- [ ] **Step 1: Write failing registry and catalog tests**

```js
test('publishes the live dish ranking template', () => {
    const template = publicCatalog().find(
        (item) => item.id === 'dish-ranking-guide',
    );
    assert.equal(template.status, 'live');
    assert.deepEqual(template.fields[0], {
        key: 'dishes',
        type: 'dish-list',
        role: 'dish',
        label: '菜品图片',
        required: true,
        minItems: 1,
        maxItems: 12,
        minOwned: 1,
        accept: ['image/jpeg', 'image/png', 'image/webp'],
    });
});

test('rejects invalid dish-list bounds', () => {
    assert.throws(() => validateManifest({
        ...baseManifest,
        fields: [{
            key: 'dishes',
            type: 'dish-list',
            role: 'dish',
            label: '菜品图片',
            required: true,
            minItems: 3,
            maxItems: 2,
            minOwned: 1,
        }],
    }, 'sample'), /dish-list bounds/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/dish-ranking-manifest.test.js`

Expected: FAIL because `dish-list` is unknown and the template does not exist.

- [ ] **Step 3: Add registry schema and manifest**

Add the field schema:

```js
'dish-list': [
    'key', 'type', 'role', 'label', 'required',
    'minItems', 'maxItems', 'minOwned', 'accept',
],
```

Validate integer bounds `1 <= minItems <= maxItems <= 12` and
`1 <= minOwned <= maxItems`; validate `role`, `required`, and accepted image
media types with the same rules as an image field.

Create a live manifest with fields `dishes`, `layout`, `aspectRatio`, and
`requirements`; layout values are `tier`, `grid`, `quad`, `collage`, with
`tier` as default; ratio values are `3:4`, `1:1`, `9:16`, with `3:4` as
default.

- [ ] **Step 4: Run focused and registry tests**

Run: `node --test tests/dish-ranking-manifest.test.js tests/template-registry.test.js tests/template-catalog.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
git add server/template-registry.js template-packs/dish-ranking-guide/manifest.js tests/dish-ranking-manifest.test.js
git commit -m "feat: register dish ranking guide template"
```

### Task 2: Prompt behavior

**Files:**
- Create: `template-packs/dish-ranking-guide/prompt.js`
- Create: `tests/dish-ranking-prompt.test.js`

- [ ] **Step 1: Write failing prompt tests**

```js
test('puts every owned dish in the 夯 tier', () => {
    const prompt = buildPrompt({
        dishes: [
            { owned: true, source: 'user' },
            { owned: false, source: 'library' },
            { owned: true, source: 'user' },
        ],
        layout: 'tier',
        aspectRatio: '3:4',
    });
    assert.match(prompt, /第 1 张菜品图：自家菜品/);
    assert.match(prompt, /第 3 张菜品图：自家菜品/);
    assert.match(prompt, /全部放入“夯”档/);
    assert.match(prompt, /3:4/);
});

test('treats a previous image as the refinement base', () => {
    const prompt = buildPrompt({
        hasPreviousImage: true,
        dishes: [{ owned: true, source: 'user' }],
        messages: [{ role: 'user', content: '标题大一点' }],
    });
    assert.match(prompt, /第一张图是上一版结果/);
    assert.match(prompt, /只修改用户明确指定的内容/);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/dish-ranking-prompt.test.js`

Expected: FAIL because the prompt module does not exist.

- [ ] **Step 3: Implement the prompt builder**

Export `buildPrompt`. Describe each image index after the optional previous
image, serialize `requirements` and `messages` inside the existing untrusted
intent delimiters, and map layouts to exact rules:

```js
const LAYOUT_RULES = {
    tier: '使用“夯 / 顶级 / 人上人 / NPC / 拉完了”纵向等级榜；全部自家菜品放入“夯”档。',
    grid: '使用九宫格点评，每格使用克制、清晰的中文短评。',
    quad: '使用四宫格攻略，把多道菜合理分组到四个区域。',
    collage: '使用大小错落、层次清晰的自由拼贴海报。',
};
```

Always forbid invented shop names, prices, addresses, sales, recipes, logos,
and watermarks. Require exactly one `result.png`.

- [ ] **Step 4: Run prompt and existing prompt tests**

Run: `node --test tests/dish-ranking-prompt.test.js tests/product-swap-prompt.test.js tests/food-copy-prompt.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
git add template-packs/dish-ranking-guide/prompt.js tests/dish-ranking-prompt.test.js
git commit -m "feat: build dish ranking guide prompt"
```

### Task 3: Dish asset library and extraction

**Files:**
- Create: `dish-assets/catalog.json`
- Create: `dish-assets/library.js`
- Create: `tools/extract-dish-assets.js`
- Create: `assets/dish-library/*.webp`
- Create: `tests/dish-assets.test.js`

- [ ] **Step 1: Write failing catalog query tests**

```js
test('filters by any tag and caps the result at twelve', () => {
    const items = queryDishAssets(catalog, {
        tags: ['甜品', '主食'],
        limit: 99,
        random: false,
    });
    assert.ok(items.length <= 12);
    assert.ok(items.every((item) => (
        item.tags.includes('甜品') || item.tags.includes('主食')
    )));
});

test('rejects unsafe catalog URLs', () => {
    assert.throws(() => validateCatalog([{
        id: 'bad',
        name: 'bad',
        tags: ['菜品'],
        width: 480,
        height: 480,
        url: 'https://evil.example/a.webp',
    }]), /dish-library/);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/dish-assets.test.js`

Expected: FAIL because `dish-assets/library.js` does not exist.

- [ ] **Step 3: Implement catalog validation and query**

`validateCatalog` accepts a dense array with unique safe IDs, non-empty names
and tags, positive integer dimensions, and URLs beginning
`/assets/dish-library/`. `parseDishAssetQuery` enforces `limit` 1–12 and parses
comma-separated tags. `queryDishAssets` performs OR tag matching and uses an
injected random function for deterministic tests.

- [ ] **Step 4: Add reproducible crops and catalog**

The extraction script reads the supplied reference image path from argv,
uses explicit crop rectangles for the center 3×3 panel, right 3×3 panel, and
bottom 2×2 panel, applies `resize({ width: 480, withoutEnlargement: false })`,
and writes quality-68 WebP files. The catalog contains at least 18 useful
entries with Chinese names and broad tags such as `主食`, `肉类`, `小吃`,
`甜品`, `蔬菜`, `辣味`, and `西餐`.

Run:

```text
node tools/extract-dish-assets.js C:\Users\mm\AppData\Local\Temp\codex-clipboard-19021228-13a6-48f2-8d16-1b295fafba4c.png
```

Expected: every catalog URL resolves to a generated WebP below 120 KB.

- [ ] **Step 5: Run tests and inspect one contact sheet**

Run: `node --test tests/dish-assets.test.js`

Expected: PASS. Generate one small contact sheet and inspect it once to ensure
the crop coordinates contain dishes rather than surrounding UI.

- [ ] **Step 6: Commit**

```text
git add dish-assets assets/dish-library tools/extract-dish-assets.js tests/dish-assets.test.js
git commit -m "feat: add compressed dish asset library"
```

### Task 4: Local and production resource API

**Files:**
- Modify: `server/dev-server.js`
- Create: `worker.js`
- Modify: `wrangler.jsonc`
- Modify: `build.mjs`
- Create: `tests/dish-assets-api.test.js`
- Modify: `tests/build.test.js`

- [ ] **Step 1: Write failing API and build tests**

```js
test('serves random dish assets from the local API', async () => {
    const response = await fetch(
        `${origin}/api/dish-assets?limit=3&tags=甜品&random=true`,
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.items.length <= 3);
    assert.ok(body.items.every((item) => item.tags.includes('甜品')));
});

test('rejects an invalid resource limit', async () => {
    const response = await fetch(`${origin}/api/dish-assets?limit=nope`);
    assert.equal(response.status, 400);
});
```

The build test must require `worker.js` and
`assets/dish-library/catalog.json` in the output contract.

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/dish-assets-api.test.js tests/build.test.js`

Expected: FAIL with 404/missing worker output.

- [ ] **Step 3: Implement both API routes**

Local Node loads the validated catalog and returns:

```js
{
    success: true,
    items,
    total: items.length,
}
```

Production `worker.js` fetches
`/assets/dish-library/catalog.json` through `env.ASSETS`, applies the same
query contract, returns JSON with `Cache-Control: public, max-age=300`, and
delegates all non-API requests to `env.ASSETS.fetch(request)`.

Configure `wrangler.jsonc` with `"main": "worker.js"` and
`"binding": "ASSETS"`. Keep `assets` copied by `build.mjs`; copy or generate
the catalog into `assets/dish-library/catalog.json`.

- [ ] **Step 4: Run API/build tests and a Worker dry run**

Run: `node --test tests/dish-assets-api.test.js tests/build.test.js`

Run: `npm run build && npx wrangler deploy --dry-run`

Expected: all tests PASS and Wrangler exits 0.

- [ ] **Step 5: Commit**

```text
git add server/dev-server.js worker.js wrangler.jsonc build.mjs tests/dish-assets-api.test.js tests/build.test.js
git commit -m "feat: expose dish asset resource api"
```

### Task 5: Dish-list form model and renderer

**Files:**
- Modify: `creator-form.js`
- Modify: `creator-meta.js`
- Create: `tests/dish-list-form.test.js`
- Modify: `tests/creator-contract.test.js`

- [ ] **Step 1: Write failing state and rendering tests**

```js
test('requires one owned dish and builds a safe payload', () => {
    const emptyOwned = validateValues(manifest, {
        dishes: [{ image: 'data:image/png;base64,AA==', owned: false, source: 'user' }],
    });
    assert.equal(emptyOwned.message, '请至少标记一道自家菜品');

    const payload = buildTemplatePayload(manifest, {
        dishes: [{ image: ' x ', owned: true, source: 'user' }],
    });
    assert.deepEqual(payload.dishes, [
        { image: 'x', owned: true, source: 'user' },
    ]);
});
```

The DOM contract asserts a multiple file input, a counter, an owned toggle,
and a card list inside the rendered `dish-list` section.

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/dish-list-form.test.js tests/creator-contract.test.js`

Expected: FAIL because arrays are not initialized, validated, or rendered.

- [ ] **Step 3: Implement pure model functions and renderer**

Initialize `dish-list` as `[]`. Add `normalizeDishItems`,
`dishListValidation`, and payload cloning that permits only `image`, `owned`,
and `source`. Render:

```html
<input type="file" multiple accept="image/jpeg,image/png,image/webp" hidden>
<button type="button" class="dish-upload-box">批量上传或拖拽图片</button>
<p class="dish-list-status" aria-live="polite"></p>
<div class="dish-card-list"></div>
```

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/dish-list-form.test.js tests/creator-form.test.js tests/creator-contract.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
git add creator-form.js creator-meta.js tests/dish-list-form.test.js tests/creator-contract.test.js
git commit -m "feat: render reusable dish list field"
```

### Task 6: Uploads, fillers, history, and protocol v3

**Files:**
- Create: `dish-library-client.js`
- Modify: `create.html`
- Modify: `script.js`
- Modify: `generation-worker.js`
- Modify: `local-history.js`
- Create: `tests/dish-library-client.test.js`
- Modify: `tests/frontend-contract.test.js`
- Modify: `tests/generation-worker.test.js`
- Modify: `tests/local-history.test.js`

- [ ] **Step 1: Write failing filler and protocol tests**

```js
test('fills fewer than six user dishes to nine', async () => {
    const result = await fillDishList(
        [userDish],
        { fetchAssets, fetchImage },
    );
    assert.equal(result.length, 9);
    assert.equal(result[0].source, 'user');
    assert.ok(result.slice(1).every(
        (item) => item.source === 'library' && item.owned === false,
    ));
});

test('does not fetch fillers when six dishes are supplied', async () => {
    const result = await fillDishList(sixDishes, { fetchAssets });
    assert.equal(result.length, 6);
    assert.equal(fetchAssets.callCount, 0);
});
```

Generation worker tests require version 3 with a valid `dishes` array and
continue accepting versions 1 and 2.

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/dish-library-client.test.js tests/generation-worker.test.js tests/local-history.test.js`

Expected: FAIL because filler helpers and protocol v3 are absent.

- [ ] **Step 3: Implement fillers and multi-upload UI**

`dish-library-client.js` exports `fillerCount`, `fetchDishAssets`,
`fetchImageAsDataUrl`, and `fillDishList`. On resource failure it returns the
original dishes plus a warning instead of throwing.

`script.js` processes selected files sequentially through the existing file
metadata/dimension checks, caps at twelve, renders cards, toggles ownership,
deletes items, and displays:

```text
已上传 X/12，自家菜 Y 张；生成时将从资源库补充 Z 张
```

The first submission stores the filled payload as `lastInitialPayload`.
Refinements reuse it and add `previousImage`, `messages`, and
`conversationId` without requesting new fillers.

- [ ] **Step 4: Store and hydrate dish assets**

Save images with roles `dish-0`, `dish-1`, ... and input metadata:

```js
dishes: [
    { role: 'dish-0', owned: true, source: 'user' },
]
```

Hydration joins metadata to stored assets and reconstructs the full dish
array. Do not persist data URLs in task input primitives.

- [ ] **Step 5: Add generation message version 3**

`createGenerationMessage` emits version 3 for `dish-ranking-guide` and
version 2 otherwise. `normalizeGenerationMessage` accepts version 3 only
when `templateId` is non-empty and `dishes` is a non-empty dense array of
safe items.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/dish-library-client.test.js tests/frontend-contract.test.js tests/generation-worker.test.js tests/local-history.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```text
git add dish-library-client.js create.html script.js generation-worker.js local-history.js tests/dish-library-client.test.js tests/frontend-contract.test.js tests/generation-worker.test.js tests/local-history.test.js
git commit -m "feat: generate ranking guides from multi-dish uploads"
```

### Task 7: Server multi-dish validation and provider ordering

**Files:**
- Modify: `server/dev-server.js`
- Modify: `tests/request-validation.test.js`
- Modify: `tests/dev-server.test.js`

- [ ] **Step 1: Write failing request tests**

```js
test('accepts a valid owned multi-dish request', async () => {
    const input = await validateGenerateRequest({
        templateId: 'dish-ranking-guide',
        dishes: [
            { image: validImage, owned: true, source: 'user' },
            { image: validImage, owned: false, source: 'library' },
        ],
        layout: 'tier',
        aspectRatio: '3:4',
        requirements: '',
    });
    assert.equal(input.values.dishes.length, 2);
});

test('rejects a library dish marked as owned', async () => {
    await assert.rejects(() => validateGenerateRequest({
        templateId: 'dish-ranking-guide',
        dishes: [{
            image: validImage,
            owned: true,
            source: 'library',
        }],
    }), /资源库菜品不能标记为自家菜品/);
});
```

Provider tests assert optional previous image is first and dish paths follow
the request order.

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/request-validation.test.js tests/dev-server.test.js`

Expected: FAIL because arrays are rejected or passed to the image decoder as
scalars.

- [ ] **Step 3: Implement strict dish array validation**

Reject accessors, sparse arrays, extra item properties, non-boolean `owned`,
invalid `source`, limits above twelve, zero owned items, and library-owned
items. Decode each `image` with existing functions. Keep only:

```js
{
    image: decodedImage,
    owned,
    source,
}
```

Write each image as `dish-0`, `dish-1`, ...; pass metadata-only dishes to the
prompt and paths to the provider in the same order.

- [ ] **Step 4: Run server tests**

Run: `node --test tests/request-validation.test.js tests/dev-server.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
git add server/dev-server.js tests/request-validation.test.js tests/dev-server.test.js
git commit -m "feat: validate multi-dish generation requests"
```

### Task 8: Styling, integration, and final verification

**Files:**
- Modify: `style.css`
- Modify: `tests/responsive-contract.test.js`
- Modify: `tests/browser-smoke.js`

- [ ] **Step 1: Write failing responsive and smoke assertions**

Assert `.dish-card-list` uses a responsive grid, `.dish-owned-toggle` has a
visible selected state, the counter is readable at mobile widths, and the
browser can select multiple fixture images, mark an owned dish, choose a
layout, submit, and see a result.

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/responsive-contract.test.js`

Expected: FAIL because dish-list styles are absent.

- [ ] **Step 3: Add focused responsive styles**

Use a two-column card grid on desktop and one column below 640px. Preserve
44px touch targets, visible keyboard focus, image `object-fit: cover`, owned
badge contrast, and existing creator panel spacing.

- [ ] **Step 4: Run focused browser verification**

Run: `node --test tests/responsive-contract.test.js`

Run: `npm run test:browser`

Expected: PASS.

- [ ] **Step 5: Run complete verification**

Run: `npm test`

Run: `npm run build`

Run: `npx wrangler deploy --dry-run`

Run: `git diff --check`

Expected: every command exits 0 with no test failures.

- [ ] **Step 6: Commit**

```text
git add style.css tests/responsive-contract.test.js tests/browser-smoke.js
git commit -m "feat: finish dish ranking guide experience"
```

