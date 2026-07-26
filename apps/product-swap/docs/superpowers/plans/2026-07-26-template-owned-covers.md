# Template-Owned Covers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every merchant-content template own a unique, function-appropriate cover and reject invalid cover declarations before the homepage is built.

**Architecture:** Each template manifest remains the single source of truth for `cover`. The template registry validates the template-owned filename and source asset; the public catalog forwards the value unchanged, while the homepage remains a generic catalog renderer.

**Tech Stack:** CommonJS template manifests, Node.js registry and `node:test`, static SVG/WebP assets, existing static build script.

---

### Task 1: Enforce the template-owned cover contract

**Files:**
- Modify: `apps/product-swap/tests/template-registry.test.js`
- Modify: `apps/product-swap/server/template-registry.js`

- [ ] **Step 1: Write failing registry tests**

Add tests that require `/assets/<template-id>-cover.<supported-extension>` and an existing source file:

```js
test('requires each manifest to own its cover path', () => {
    assert.throws(
        () => validateManifest(validManifest({
            cover: '/assets/shared-cover.svg',
        }), 'sample'),
        /Template sample cover must use its template-owned filename/,
    );
});

test('requires each discovered template cover asset to exist', () => {
    assert.throws(
        () => assertCoverAssetExists(validManifest({
            cover: '/assets/sample-cover.svg',
        })),
        /Template sample cover asset does not exist/,
    );
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
node --test apps/product-swap/tests/template-registry.test.js
```

Expected: FAIL because the ownership rule and `assertCoverAssetExists` do not exist.

- [ ] **Step 3: Implement minimal registry validation**

Add `ASSETS_ROOT`, supported extensions, an escaped template-ID filename check, and:

```js
function assertCoverAssetExists(manifest, assetsRoot = ASSETS_ROOT) {
    const filename = path.posix.basename(manifest.cover);
    if (!fs.existsSync(path.join(assetsRoot, filename))) {
        throw new Error(
            `Template ${manifest.id} cover asset does not exist: ${manifest.cover}`,
        );
    }
}
```

Call this function from `listTemplatePackages()` after `validateManifest()`, and export it for focused tests.

- [ ] **Step 4: Verify the new focused registry tests pass**

Run:

```powershell
node --test --test-name-pattern "requires each manifest to own|requires each discovered template cover" apps/product-swap/tests/template-registry.test.js
```

Expected: the two new tests PASS. The full registry suite remains red until Task 2 replaces the legacy generic cover paths.

### Task 2: Give all seven templates unique owned covers

**Files:**
- Create: `apps/product-swap/assets/before-after-cover.svg`
- Create: `apps/product-swap/assets/food-copy-layout-cover.svg`
- Create: `apps/product-swap/assets/product-swap-cover.svg`
- Create: `apps/product-swap/assets/store-promotion-cover.svg`
- Create: `apps/product-swap/assets/summer-seeding-cover.svg`
- Modify: `apps/product-swap/template-packs/before-after/manifest.js`
- Modify: `apps/product-swap/template-packs/food-copy-layout/manifest.js`
- Modify: `apps/product-swap/template-packs/product-swap/manifest.js`
- Modify: `apps/product-swap/template-packs/store-promotion/manifest.js`
- Modify: `apps/product-swap/template-packs/summer-seeding/manifest.js`
- Modify: `apps/product-swap/tests/template-catalog.test.js`
- Modify: `apps/product-swap/tests/build.test.js`

- [ ] **Step 1: Write failing catalog and build ownership tests**

```js
test('every template publishes a unique template-owned cover', () => {
    const templates = listTemplates();
    assert.equal(
        new Set(templates.map(({ cover }) => cover)).size,
        templates.length,
    );
    for (const template of templates) {
        assert.match(
            template.cover,
            new RegExp(`/assets/${template.id}-cover\\.(svg|png|jpe?g|webp)$`),
        );
    }
});
```

In `build.test.js`, import `publicCatalog` and assert that every catalog cover is emitted:

```js
for (const { cover } of publicCatalog()) {
    assert.equal(
        await fs.stat(path.join(
            appRoot,
            'dist',
            cover.replace(/^\//, ''),
        )).then((stat) => stat.isFile()),
        true,
    );
}
```

- [ ] **Step 2: Verify the ownership tests fail**

Run:

```powershell
node --test apps/product-swap/tests/template-catalog.test.js apps/product-swap/tests/build.test.js
```

Expected: FAIL because five manifests still use generic example assets and their owned cover files do not exist.

- [ ] **Step 3: Add five 600×600 SVG covers**

Use the existing warm mobile-card palette and these unambiguous motifs:

| Template | Required visual |
| --- | --- |
| `before-after` | Split comparison with “使用前 / 使用后” and a center divider |
| `food-copy-layout` | Dish card with a separate, clearly typeset social-copy panel |
| `product-swap` | “参考场景 + 我的产品 → 同款图” three-stage composition |
| `store-promotion` | Storefront, weekend calendar, and promotion badge |
| `summer-seeding` | Summer drink/product, sun, leaves, and sharing-card treatment |

All SVG text is authored directly and must not rely on generated text.

- [ ] **Step 4: Point each manifest to its owned cover**

Use:

```js
cover: '/assets/<template-id>-cover.svg',
```

Do not change `home.js`; it must continue rendering `model.cover`.

- [ ] **Step 5: Verify catalog and registry tests pass**

Run:

```powershell
node --test apps/product-swap/tests/template-catalog.test.js apps/product-swap/tests/template-registry.test.js
```

Expected: PASS.

### Task 3: Verify build output and homepage presentation

**Files:**
- Create: `apps/product-swap/art_reviews/template-owned-covers/home-mobile.png`
- Create: `apps/product-swap/art_reviews/template-owned-covers/report.md`
- Modify: `apps/product-swap/docs/requirements-and-buglist.md`

- [ ] **Step 1: Build and run the full frontend suite**

Run:

```powershell
npm test --prefix apps/product-swap
npm run build --prefix apps/product-swap
```

Expected: all tests pass and the build exits with code 0. These commands use only local fixtures and do not call metered APIs.

- [ ] **Step 2: Capture and review the mobile homepage**

Run the local dev server, capture the homepage at a mobile viewport, and review:

1. All seven cards have distinct covers.
2. Each cover communicates its template without relying on the card title.
3. Important content survives `object-fit: cover`.
4. No broken images or placeholder assets remain.
5. Overall visual score is at least 7/10.

Write the screenshot and scored report under `art_reviews/template-owned-covers/`.

- [ ] **Step 3: Close the tracked bug**

Change `BUG-001` in `requirements-and-buglist.md` to `已修复`, leaving `BUG-002` unchanged.
