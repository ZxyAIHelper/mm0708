# Social Content Platform Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-purpose root page with a mobile-first hotspot-template platform shell while preserving the current product-swap generator as the first live template.

**Architecture:** Keep the existing static HTML/CSS/CommonJS-compatible JavaScript approach. Add a browser/CommonJS template catalog and merchant profile store, move the current generator to `create.html`, make `index.html` the template-discovery home, upgrade `history.html` into Works, and add a local Profile page. Existing generation API, service worker, IndexedDB task history, and refinement flow remain unchanged.

**Tech Stack:** Static HTML5, CSS, vanilla JavaScript, Node.js built-in test runner, IndexedDB/localStorage, service worker, Puppeteer browser smoke test, Cloudflare Worker static deployment.

---

## Scope boundary

This plan implements one cohesive, testable platform shell:

- A new template-discovery home.
- A shared four-item mobile navigation.
- A unified creator route containing the existing real generator.
- A Works page based on the existing local task history.
- A local Shop and Product profile page.
- “Coming soon” template discovery cards.

This plan does not add a second generation API, video generation, multi-result comparison, automatic social publishing, or a free-form canvas.

## File responsibility map

- `apps/product-swap/templates.js`: source of truth for template metadata and discovery.
- `apps/product-swap/merchant-store.js`: validated local shop and product persistence.
- `apps/product-swap/index.html`: template-discovery home markup.
- `apps/product-swap/home.js`: home rendering, search, category filtering, and shop summary.
- `apps/product-swap/create.html`: the existing generator markup at a stable template route.
- `apps/product-swap/creator-meta.js`: validates the template query and applies template metadata.
- `apps/product-swap/profile.html`: shop and product management markup.
- `apps/product-swap/profile.js`: profile form behavior.
- `apps/product-swap/history.html`: Works markup and status filters.
- `apps/product-swap/history.js`: Works rendering and status selection.
- `apps/product-swap/app.css`: shared light platform shell, home, navigation, and profile styles.
- `apps/product-swap/style.css`: creator and Works styles, updated to the shared light palette.
- `apps/product-swap/build.mjs`: deployable static asset manifest.
- `apps/product-swap/tests/*.test.js`: pure module and HTML contracts.
- `apps/product-swap/tests/browser-smoke.js`: real browser path from home to generation and Works.

### Task 1: Add the template catalog

**Files:**
- Create: `apps/product-swap/templates.js`
- Create: `apps/product-swap/tests/template-catalog.test.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build.test.js`

- [ ] **Step 1: Write the failing catalog test**

```js
// apps/product-swap/tests/template-catalog.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getTemplate,
    listTemplates,
    searchTemplates,
} = require('../templates');

test('exposes one live generator and discoverable coming-soon templates', () => {
    const live = getTemplate('product-swap');
    assert.equal(live.status, 'live');
    assert.equal(live.taskType, 'product_swap');
    assert.equal(live.href, '/create.html?template=product-swap');
    assert.deepEqual(live.platforms, ['小红书', '抖音图文']);
    assert.deepEqual(live.fields.map((field) => field.key), [
        'target',
        'product',
        'scene',
        'requirements',
    ]);

    const all = listTemplates();
    assert.ok(all.length >= 4);
    assert.ok(all.some((item) => item.status === 'coming_soon'));
});

test('filters by category and searchable merchant language', () => {
    assert.ok(listTemplates({ category: '改造图片' })
        .every((item) => item.category === '改造图片'));
    assert.deepEqual(
        searchTemplates('背景').map((item) => item.id),
        ['product-swap'],
    );
    assert.equal(getTemplate('missing-template'), null);
});
```

- [ ] **Step 2: Run the test and confirm the module is missing**

Run:

```powershell
node --test apps/product-swap/tests/template-catalog.test.js
```

Expected: FAIL with `Cannot find module '../templates'`.

- [ ] **Step 3: Implement the browser/CommonJS catalog**

```js
// apps/product-swap/templates.js
(function exposeTemplateCatalog(globalScope) {
    const templates = Object.freeze([
        {
            id: 'product-swap',
            taskType: 'product_swap',
            name: '爆款场景同款图',
            summary: '保留参考图的构图，把画面主体替换成你的产品。',
            category: '改造图片',
            platforms: ['小红书', '抖音图文'],
            tags: ['换背景', '产品图', '同款'],
            status: 'live',
            href: '/create.html?template=product-swap',
            cover: '/assets/example-result.jpg',
            outputLabel: '生成 1 张场景图',
            creditCost: 3,
            fields: [
                { key: 'target', type: 'image', required: true },
                { key: 'product', type: 'image', required: false },
                { key: 'scene', type: 'image', required: false },
                { key: 'requirements', type: 'text', required: false },
            ],
        },
        {
            id: 'summer-seeding',
            name: '夏日产品种草',
            summary: '生成清爽的夏日产品种草封面。',
            category: '种草推荐',
            platforms: ['小红书'],
            tags: ['夏日', '种草', '产品'],
            status: 'coming_soon',
            href: '',
            cover: '/assets/example-product.jpg',
            outputLabel: '生成 3 张种草图',
            creditCost: 0,
            fields: [],
        },
        {
            id: 'store-promotion',
            name: '周末到店活动',
            summary: '把门店信息整理成周末活动宣传图。',
            category: '优惠活动',
            platforms: ['小红书', '抖音图文'],
            tags: ['门店', '活动', '周末'],
            status: 'coming_soon',
            href: '',
            cover: '/assets/example-template.jpg',
            outputLabel: '生成活动发布包',
            creditCost: 0,
            fields: [],
        },
        {
            id: 'before-after',
            name: '产品前后对比',
            summary: '用清晰的前后变化展示产品效果。',
            category: '前后对比',
            platforms: ['小红书', '抖音图文'],
            tags: ['对比', '效果', '案例'],
            status: 'coming_soon',
            href: '',
            cover: '/assets/example-result.jpg',
            outputLabel: '生成 1 张对比图',
            creditCost: 0,
            fields: [],
        },
    ]);

    function getTemplate(id) {
        return templates.find((item) => item.id === id) || null;
    }

    function listTemplates({ category = '' } = {}) {
        return templates.filter((item) =>
            !category || item.category === category);
    }

    function searchTemplates(query = '') {
        const needle = String(query).trim().toLocaleLowerCase('zh-CN');
        if (!needle) {
            return listTemplates();
        }
        return templates.filter((item) => [
            item.name,
            item.summary,
            item.category,
            ...item.platforms,
            ...item.tags,
        ].join(' ').toLocaleLowerCase('zh-CN').includes(needle));
    }

    const catalog = { getTemplate, listTemplates, searchTemplates };
    globalScope.ContentTemplates = catalog;
    if (typeof module !== 'undefined') {
        module.exports = catalog;
    }
}(globalThis));
```

- [ ] **Step 4: Add `templates.js` to the build manifest**

Add `'templates.js'` to `publicEntries` in `build.mjs` and to the exact sorted array in `build.test.js`.

- [ ] **Step 5: Run catalog and build tests**

Run:

```powershell
node --test apps/product-swap/tests/template-catalog.test.js apps/product-swap/tests/build.test.js
```

Expected: 3 tests pass and `dist/templates.js` exists.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/templates.js apps/product-swap/tests/template-catalog.test.js apps/product-swap/build.mjs apps/product-swap/tests/build.test.js
git commit -m "feat: add social content template catalog"
```

### Task 2: Add local shop and product persistence

**Files:**
- Create: `apps/product-swap/merchant-store.js`
- Create: `apps/product-swap/tests/merchant-store.test.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build.test.js`

- [ ] **Step 1: Write failing store tests**

```js
// apps/product-swap/tests/merchant-store.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createMerchantStore,
    normalizeShop,
    normalizeProduct,
} = require('../merchant-store');

function memoryStorage() {
    const values = new Map();
    return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, value),
    };
}

test('normalizes shop and product fields', () => {
    assert.deepEqual(normalizeShop({
        name: ' 山野咖啡 ',
        industry: ' 咖啡 ',
        slogan: ' 认真做咖啡 ',
    }), {
        name: '山野咖啡',
        industry: '咖啡',
        slogan: '认真做咖啡',
    });
    assert.deepEqual(normalizeProduct({
        id: 'p1',
        name: ' 冰拿铁 ',
        sellingPoint: ' 清爽 ',
        price: ' 18 ',
    }), {
        id: 'p1',
        name: '冰拿铁',
        sellingPoint: '清爽',
        price: '18',
    });
});

test('persists one shop and multiple reusable products', () => {
    const store = createMerchantStore(memoryStorage());
    store.saveShop({ name: '山野咖啡', industry: '咖啡', slogan: '' });
    store.saveProduct({ id: 'p1', name: '冰拿铁', sellingPoint: '', price: '18' });
    store.saveProduct({ id: 'p2', name: '巴斯克', sellingPoint: '', price: '28' });

    assert.equal(store.loadProfile().shop.name, '山野咖啡');
    assert.deepEqual(
        store.listProducts().map((item) => item.id),
        ['p2', 'p1'],
    );
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
node --test apps/product-swap/tests/merchant-store.test.js
```

Expected: FAIL with `Cannot find module '../merchant-store'`.

- [ ] **Step 3: Implement the local store**

```js
// apps/product-swap/merchant-store.js
(function exposeMerchantStore(globalScope) {
    const STORAGE_KEY = 'social_content_merchant_profile_v1';

    function text(value, maxLength = 120) {
        return String(value || '').trim().slice(0, maxLength);
    }

    function normalizeShop(value = {}) {
        return {
            name: text(value.name, 60),
            industry: text(value.industry, 40),
            slogan: text(value.slogan, 120),
        };
    }

    function normalizeProduct(value = {}) {
        return {
            id: text(value.id, 80),
            name: text(value.name, 80),
            sellingPoint: text(value.sellingPoint, 160),
            price: text(value.price, 40),
        };
    }

    function createMerchantStore(storage = globalScope.localStorage) {
        function read() {
            try {
                const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
                return {
                    shop: normalizeShop(parsed.shop),
                    products: Array.isArray(parsed.products)
                        ? parsed.products.map(normalizeProduct).filter((item) => item.id)
                        : [],
                };
            } catch {
                return { shop: normalizeShop(), products: [] };
            }
        }

        function write(profile) {
            storage.setItem(STORAGE_KEY, JSON.stringify(profile));
            return profile;
        }

        function saveShop(shop) {
            const profile = read();
            profile.shop = normalizeShop(shop);
            write(profile);
            return profile.shop;
        }

        function saveProduct(product) {
            const profile = read();
            const normalized = normalizeProduct(product);
            if (!normalized.id || !normalized.name) {
                throw new Error('产品名称不能为空');
            }
            profile.products = [
                normalized,
                ...profile.products.filter((item) => item.id !== normalized.id),
            ];
            write(profile);
            return normalized;
        }

        return {
            loadProfile: read,
            saveShop,
            saveProduct,
            listProducts: () => read().products,
        };
    }

    const merchantStore = {
        STORAGE_KEY,
        normalizeShop,
        normalizeProduct,
        createMerchantStore,
    };
    globalScope.MerchantStore = merchantStore;
    if (typeof module !== 'undefined') {
        module.exports = merchantStore;
    }
}(globalThis));
```

- [ ] **Step 4: Add the script to the build manifest and expected build output**

Add `'merchant-store.js'` to `publicEntries` and `build.test.js`.

- [ ] **Step 5: Run store and build tests**

Run:

```powershell
node --test apps/product-swap/tests/merchant-store.test.js apps/product-swap/tests/build.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/merchant-store.js apps/product-swap/tests/merchant-store.test.js apps/product-swap/build.mjs apps/product-swap/tests/build.test.js
git commit -m "feat: persist local merchant profiles"
```

### Task 3: Move the current generator to the unified creator route

**Files:**
- Create by moving: `apps/product-swap/create.html`
- Create: `apps/product-swap/creator-meta.js`
- Create: `apps/product-swap/tests/creator-contract.test.js`
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`
- Modify: `apps/product-swap/tests/history-contract.test.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build.test.js`

- [ ] **Step 1: Add the failing creator contract**

```js
// apps/product-swap/tests/creator-contract.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('creator keeps the proven generator controls and loads template metadata', () => {
    const html = fs.readFileSync(path.join(root, 'create.html'), 'utf8');
    for (const id of [
        'creatorTitle',
        'creatorSummary',
        'targetInput',
        'productInput',
        'sceneInput',
        'requirementsInput',
        'generateButton',
        'resultSection',
        'refineForm',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /templates\.js/);
    assert.match(html, /creator-meta\.js/);
    assert.match(html, /script\.js/);
});

test('creator rejects unknown and unavailable templates', () => {
    const {
        resolveCreatorTemplate,
    } = require('../creator-meta');
    assert.equal(resolveCreatorTemplate('?template=product-swap').id, 'product-swap');
    assert.equal(resolveCreatorTemplate('?template=missing'), null);
    assert.equal(resolveCreatorTemplate('?template=summer-seeding'), null);
});
```

- [ ] **Step 2: Run the contract and confirm `create.html` is missing**

Run:

```powershell
node --test apps/product-swap/tests/creator-contract.test.js
```

Expected: FAIL with `ENOENT` for `create.html`.

- [ ] **Step 3: Move the existing page without changing its generator controls**

Use `apply_patch` with `*** Update File` and `*** Move to` to move `apps/product-swap/index.html` to `apps/product-swap/create.html`.

Make these exact markup changes:

```html
<title>爆款场景同款图</title>
<link rel="stylesheet" href="/app.css">
<link rel="stylesheet" href="/style.css">
```

Change the intro heading and paragraph to:

```html
<h1 id="creatorTitle">爆款场景同款图</h1>
<p id="creatorSummary">
    保留参考图的构图，把画面主体替换成你的产品。
</p>
```

Append the shared navigation before `</body>`:

```html
<nav class="bottom-nav" aria-label="主要导航">
    <a href="/" data-nav="home">首页</a>
    <a class="active" href="/create.html?template=product-swap" data-nav="create">创作</a>
    <a href="/history.html" data-nav="works">作品</a>
    <a href="/profile.html" data-nav="profile">我的</a>
</nav>
```

Load scripts in this order:

```html
<script src="/templates.js"></script>
<script src="/creator-meta.js"></script>
<script src="/api-client.js"></script>
<script src="/local-history.js"></script>
<script src="/script.js"></script>
```

- [ ] **Step 4: Implement template-query validation and metadata hydration**

```js
// apps/product-swap/creator-meta.js
(function exposeCreatorMeta(globalScope) {
    function resolveCreatorTemplate(search = '') {
        const id = new URLSearchParams(search).get('template') || 'product-swap';
        const template = globalScope.ContentTemplates?.getTemplate(id);
        return template?.status === 'live' ? template : null;
    }

    function applyCreatorTemplate(search = globalScope.location?.search || '') {
        const template = resolveCreatorTemplate(search);
        if (!template || typeof document === 'undefined') {
            return template;
        }
        document.title = template.name;
        document.getElementById('creatorTitle').textContent = template.name;
        document.getElementById('creatorSummary').textContent = template.summary;
        document.getElementById('generateButton').textContent =
            `${template.outputLabel}（消耗 ${template.creditCost} 豆额度）`;
        document.body.dataset.templateId = template.id;
        return template;
    }

    const api = { resolveCreatorTemplate, applyCreatorTemplate };
    globalScope.CreatorMeta = api;
    if (typeof module !== 'undefined') {
        module.exports = api;
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            const template = applyCreatorTemplate();
            if (!template) {
                globalScope.location.replace('/');
            }
        });
    }
}(globalThis));
```

- [ ] **Step 5: Store template metadata with generated tasks**

In `script.js`, read the active template inside `boot()`:

```js
const activeTemplate = window.CreatorMeta
    .resolveCreatorTemplate(window.location.search);
```

Change `startLocalTask()` to use:

```js
taskType: activeTemplate?.taskType || 'product_swap',
title: activeTemplate?.name || '爆款场景同款图',
input: {
    ...historyInputFromPayload(payload, isRefinement),
    templateId: activeTemplate?.id || 'product-swap',
},
```

Keep the existing image roles and generation payload unchanged.

- [ ] **Step 6: Point existing contracts at `create.html`**

In `frontend-contract.test.js`, replace reads of `index.html` that assert generator controls with `create.html`.

In `history-contract.test.js`, replace the first test with:

```js
test('creator links to Works', () => {
    const html = fs.readFileSync(path.join(root, 'create.html'), 'utf8');
    assert.match(html, /id="historyLink"/);
    assert.match(html, /href="\/history\.html"/);
});
```

- [ ] **Step 7: Add creator files to the build**

Add `'create.html'` and `'creator-meta.js'` to `publicEntries` and `build.test.js`.

- [ ] **Step 8: Run creator regression tests**

Run:

```powershell
node --test apps/product-swap/tests/creator-contract.test.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/history-contract.test.js apps/product-swap/tests/build.test.js
```

Expected: all existing generator contracts and new creator contracts pass.

- [ ] **Step 9: Commit**

```powershell
git add apps/product-swap/create.html apps/product-swap/creator-meta.js apps/product-swap/script.js apps/product-swap/tests/creator-contract.test.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/history-contract.test.js apps/product-swap/build.mjs apps/product-swap/tests/build.test.js
git commit -m "feat: move generator into template creator"
```

### Task 4: Build the hotspot-template home

**Files:**
- Create: `apps/product-swap/index.html`
- Create: `apps/product-swap/home.js`
- Create: `apps/product-swap/app.css`
- Create: `apps/product-swap/tests/home-contract.test.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build.test.js`

- [ ] **Step 1: Write the failing home contract**

```js
// apps/product-swap/tests/home-contract.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('home exposes merchant summary, discovery, categories and navigation', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const id of [
        'shopSummary',
        'templateSearch',
        'quickTasks',
        'hotTemplates',
        'templateCategories',
        'templateGrid',
        'homeEmpty',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /templates\.js/);
    assert.match(html, /merchant-store\.js/);
    assert.match(html, /home\.js/);
    assert.match(html, /href="\/create\.html\?template=product-swap"/);
    assert.equal((html.match(/class="bottom-nav"/g) || []).length, 1);
});

test('home renderer keeps unavailable templates non-navigable', () => {
    const { templateCardModel } = require('../home');
    assert.equal(templateCardModel({
        id: 'live',
        name: 'Live',
        status: 'live',
        href: '/create.html?template=live',
        platforms: [],
        category: '分类',
        cover: '/cover.jpg',
    }).href, '/create.html?template=live');
    assert.equal(templateCardModel({
        id: 'soon',
        name: 'Soon',
        status: 'coming_soon',
        href: '',
        platforms: [],
        category: '分类',
        cover: '/cover.jpg',
    }).href, '');
});
```

- [ ] **Step 2: Run the contract and confirm the new home is absent**

Run:

```powershell
node --test apps/product-swap/tests/home-contract.test.js
```

Expected: FAIL because the moved root page does not contain `shopSummary`.

- [ ] **Step 3: Create the semantic home markup**

Create `index.html` with these exact structural elements:

```html
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>商家内容助手</title>
    <meta name="description" content="使用热点模板生成小红书和抖音图文内容。">
    <link rel="icon" href="data:,">
    <link rel="stylesheet" href="/app.css">
</head>
<body>
    <main class="app-shell home-shell">
        <header class="home-header">
            <div>
                <p class="eyebrow">商家内容助手</p>
                <h1>今天想发什么？</h1>
            </div>
            <a id="shopSummary" class="shop-summary" href="/profile.html">完善店铺</a>
        </header>
        <form class="search-card" role="search">
            <label for="templateSearch">输入产品、活动或推广需求</label>
            <div class="search-row">
                <input id="templateSearch" type="search" placeholder="例如：周末新品蛋糕">
                <button type="submit">找模板</button>
            </div>
        </form>
        <section aria-labelledby="quickTitle">
            <div class="section-heading">
                <h2 id="quickTitle">快捷创作</h2>
            </div>
            <div id="quickTasks" class="quick-grid">
                <a href="/create.html?template=product-swap">推广产品</a>
                <button type="button" data-query="门店">宣传门店</button>
                <button type="button" data-query="活动">做活动图</button>
                <button type="button" data-query="背景">改造已有图片</button>
            </div>
        </section>
        <section aria-labelledby="hotTitle">
            <div class="section-heading">
                <h2 id="hotTitle">今日热点</h2>
                <span>平台精选</span>
            </div>
            <div id="hotTemplates" class="hot-strip"></div>
        </section>
        <section aria-labelledby="templateTitle">
            <div class="section-heading">
                <h2 id="templateTitle">全部模板</h2>
            </div>
            <div id="templateCategories" class="category-strip"></div>
            <div id="templateGrid" class="template-grid"></div>
            <div id="homeEmpty" class="empty-card" hidden>
                <h2>暂时没有完全匹配的模板</h2>
                <p>试试“产品”“门店”“活动”或“背景”。</p>
            </div>
        </section>
    </main>
    <nav class="bottom-nav" aria-label="主要导航">
        <a class="active" href="/" data-nav="home">首页</a>
        <a href="/create.html?template=product-swap" data-nav="create">创作</a>
        <a href="/history.html" data-nav="works">作品</a>
        <a href="/profile.html" data-nav="profile">我的</a>
    </nav>
    <script src="/templates.js"></script>
    <script src="/merchant-store.js"></script>
    <script src="/home.js"></script>
</body>
</html>
```

- [ ] **Step 4: Implement home rendering and filtering**

Implement `home.js` completely:

```js
(function bootHome(globalScope) {
    function templateCardModel(template) {
        return {
            ...template,
            href: template.status === 'live' ? template.href : '',
            statusLabel: template.status === 'live' ? '立即套用' : '即将上线',
            platformLabel: template.platforms.join(' · '),
        };
    }

    function categoryNames(templates) {
        return ['全部', ...new Set(templates.map((item) => item.category))];
    }

    function createTemplateCard(template) {
        const model = templateCardModel(template);
        const card = document.createElement(model.href ? 'a' : 'article');
        card.className = 'template-card';
        if (model.href) {
            card.href = model.href;
        } else {
            card.classList.add('is-unavailable');
            card.setAttribute('aria-disabled', 'true');
        }

        const image = document.createElement('img');
        image.src = model.cover;
        image.alt = `${model.name}模板效果`;
        image.loading = 'lazy';

        const body = document.createElement('div');
        body.className = 'template-card-body';
        const category = document.createElement('span');
        category.className = 'template-category';
        category.textContent = model.category;
        const heading = document.createElement('h3');
        heading.textContent = model.name;
        const platform = document.createElement('p');
        platform.textContent = model.platformLabel || '图片内容';
        const status = document.createElement('strong');
        status.textContent = model.statusLabel;

        body.append(category, heading, platform, status);
        card.append(image, body);
        return card;
    }

    function boot() {
        const catalog = globalScope.ContentTemplates;
        const profile = globalScope.MerchantStore
            .createMerchantStore()
            .loadProfile();
        const allTemplates = catalog.listTemplates();
        const shopSummary = document.getElementById('shopSummary');
        const search = document.getElementById('templateSearch');
        const categories = document.getElementById('templateCategories');
        const grid = document.getElementById('templateGrid');
        const hot = document.getElementById('hotTemplates');
        const empty = document.getElementById('homeEmpty');
        let activeCategory = '全部';

        shopSummary.textContent = profile.shop.name || '完善店铺';

        function visibleTemplates() {
            const queryMatches = catalog.searchTemplates(search.value);
            return activeCategory === '全部'
                ? queryMatches
                : queryMatches.filter((item) => item.category === activeCategory);
        }

        function renderTemplates() {
            const items = visibleTemplates();
            grid.replaceChildren(...items.map(createTemplateCard));
            empty.hidden = items.length > 0;
        }

        for (const name of categoryNames(allTemplates)) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = name;
            button.classList.toggle('active', name === activeCategory);
            button.addEventListener('click', () => {
                activeCategory = name;
                for (const item of categories.querySelectorAll('button')) {
                    item.classList.toggle('active', item === button);
                }
                renderTemplates();
            });
            categories.append(button);
        }

        hot.replaceChildren(
            ...allTemplates.slice(0, 3).map(createTemplateCard),
        );
        document.querySelector('.search-card').addEventListener(
            'submit',
            (event) => {
                event.preventDefault();
                activeCategory = '全部';
                renderTemplates();
            },
        );
        document.getElementById('quickTasks').addEventListener(
            'click',
            (event) => {
                const button = event.target.closest('button[data-query]');
                if (!button) {
                    return;
                }
                search.value = button.dataset.query;
                activeCategory = '全部';
                renderTemplates();
            },
        );
        renderTemplates();
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', boot);
    }
    if (typeof module !== 'undefined') {
        module.exports = { templateCardModel, categoryNames };
    }
}(globalThis));
```

- [ ] **Step 5: Add the shared light shell styles**

Create `app.css` with:

```css
:root {
    --page: #f7f6f2;
    --surface: #ffffff;
    --surface-soft: #f0eee8;
    --text: #211f1d;
    --muted: #716d68;
    --line: #e4e0da;
    --accent: #f4515b;
    --accent-strong: #df3542;
    --shadow: 0 10px 28px rgb(44 38 32 / 8%);
    font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}

* { box-sizing: border-box; }
body {
    margin: 0;
    min-width: 320px;
    background: var(--page);
    color: var(--text);
}
button, input, textarea { font: inherit; }
button, a { -webkit-tap-highlight-color: transparent; }
.app-shell {
    width: min(100%, 520px);
    margin: 0 auto;
    padding: 22px 18px 104px;
}
.home-header, .section-heading, .search-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.eyebrow { margin: 0; color: var(--accent); font-size: 12px; font-weight: 700; }
h1 { margin: 5px 0 0; font-size: 26px; }
.shop-summary { color: var(--text); font-size: 13px; text-decoration: none; }
.search-card, .empty-card {
    margin-top: 22px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow);
}
.search-card label { display: block; margin-bottom: 10px; font-size: 13px; }
.search-row input { min-width: 0; flex: 1; min-height: 46px; border: 0; outline: 0; }
.search-row button, .quick-grid a, .quick-grid button {
    min-height: 44px;
    border: 0;
    border-radius: 12px;
}
.search-row button { padding: 0 16px; background: var(--accent); color: white; }
.section-heading { margin: 26px 0 12px; }
.section-heading h2 { margin: 0; font-size: 18px; }
.section-heading span { color: var(--muted); font-size: 12px; }
.quick-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.quick-grid a, .quick-grid button {
    display: grid;
    place-items: center;
    padding: 10px 6px;
    background: var(--surface);
    color: var(--text);
    font-size: 12px;
    text-align: center;
    text-decoration: none;
}
.hot-strip, .category-strip { display: flex; gap: 10px; overflow-x: auto; scrollbar-width: none; }
.template-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.template-card { overflow: hidden; border-radius: 14px; background: var(--surface); color: var(--text); text-decoration: none; }
.template-card img { display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover; }
.template-card-body { padding: 11px; }
.template-card h3 { margin: 0 0 5px; font-size: 15px; }
.template-card p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.bottom-nav {
    position: fixed;
    z-index: 20;
    left: 50%;
    bottom: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    width: min(100%, 520px);
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    border-top: 1px solid var(--line);
    background: rgb(255 255 255 / 94%);
    backdrop-filter: blur(16px);
}
.bottom-nav a { padding: 10px 4px; color: var(--muted); text-align: center; text-decoration: none; }
.bottom-nav a.active { color: var(--accent); font-weight: 700; }
@media (max-width: 370px) {
    .quick-grid { grid-template-columns: repeat(2, 1fr); }
}
```

Append these card states:

```css
.template-category {
    display: inline-block;
    margin-bottom: 6px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
}
.template-card strong {
    display: inline-block;
    margin-top: 9px;
    color: var(--accent);
    font-size: 12px;
}
.template-card.is-unavailable {
    opacity: 0.72;
}
.category-strip button {
    flex: 0 0 auto;
    min-height: 38px;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0 14px;
    background: var(--surface);
    color: var(--muted);
}
.category-strip button.active {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
}
.hot-strip .template-card {
    flex: 0 0 164px;
}
```

- [ ] **Step 6: Add home assets to build output**

Add `'home.js'` and `'app.css'` to `publicEntries` and `build.test.js`. `index.html` is already present.

- [ ] **Step 7: Run home, catalog, and build tests**

Run:

```powershell
node --test apps/product-swap/tests/home-contract.test.js apps/product-swap/tests/template-catalog.test.js apps/product-swap/tests/build.test.js
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add apps/product-swap/index.html apps/product-swap/home.js apps/product-swap/app.css apps/product-swap/tests/home-contract.test.js apps/product-swap/build.mjs apps/product-swap/tests/build.test.js
git commit -m "feat: add hotspot template home"
```

### Task 5: Add the Shop and Product profile page

**Files:**
- Create: `apps/product-swap/profile.html`
- Create: `apps/product-swap/profile.js`
- Create: `apps/product-swap/tests/profile-contract.test.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build.test.js`
- Modify: `apps/product-swap/app.css`

- [ ] **Step 1: Write the failing profile contract**

```js
// apps/product-swap/tests/profile-contract.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('profile exposes shop and reusable product forms', () => {
    const html = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
    for (const id of [
        'shopForm',
        'shopName',
        'shopIndustry',
        'shopSlogan',
        'productForm',
        'productName',
        'productSellingPoint',
        'productPrice',
        'productList',
        'profileNotice',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /merchant-store\.js/);
    assert.match(html, /profile\.js/);
    assert.match(html, /data-nav="profile"/);
});
```

- [ ] **Step 2: Run the test and confirm the page is missing**

Run:

```powershell
node --test apps/product-swap/tests/profile-contract.test.js
```

Expected: FAIL with `ENOENT` for `profile.html`.

- [ ] **Step 3: Create profile markup**

Create `profile.html`:

```html
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>我的店铺 · 商家内容助手</title>
    <link rel="icon" href="data:,">
    <link rel="stylesheet" href="/app.css">
</head>
<body>
    <main class="app-shell profile-shell">
        <header>
            <p class="eyebrow">资料会自动带入创作</p>
            <h1>我的店铺</h1>
        </header>
        <section aria-labelledby="shopHeading">
            <div class="section-heading"><h2 id="shopHeading">店铺资料</h2></div>
            <form id="shopForm" class="settings-card">
                <label for="shopName">店铺名称</label>
                <input id="shopName" maxlength="60" required>
                <label for="shopIndustry">所属行业</label>
                <input id="shopIndustry" maxlength="40">
                <label for="shopSlogan">常用宣传语</label>
                <textarea id="shopSlogan" maxlength="120"></textarea>
                <button type="submit">保存店铺资料</button>
            </form>
        </section>
        <section aria-labelledby="productHeading">
            <div class="section-heading"><h2 id="productHeading">产品素材</h2></div>
            <form id="productForm" class="settings-card">
                <label for="productName">产品名称</label>
                <input id="productName" maxlength="80" required>
                <label for="productSellingPoint">核心卖点</label>
                <textarea id="productSellingPoint" maxlength="160"></textarea>
                <label for="productPrice">价格</label>
                <input id="productPrice" maxlength="40" inputmode="decimal">
                <button type="submit">添加产品</button>
            </form>
            <p id="profileNotice" role="status" hidden></p>
            <div id="productList" class="product-list" aria-live="polite"></div>
        </section>
    </main>
    <nav class="bottom-nav" aria-label="主要导航">
        <a href="/" data-nav="home">首页</a>
        <a href="/create.html?template=product-swap" data-nav="create">创作</a>
        <a href="/history.html" data-nav="works">作品</a>
        <a class="active" href="/profile.html" data-nav="profile">我的</a>
    </nav>
    <script src="/merchant-store.js"></script>
    <script src="/profile.js"></script>
</body>
</html>
```

- [ ] **Step 4: Implement profile behavior**

Create `profile.js`:

```js
(function bootProfile(globalScope) {
    function boot() {
        const store = globalScope.MerchantStore.createMerchantStore();
        const shopForm = document.getElementById('shopForm');
        const productForm = document.getElementById('productForm');
        const notice = document.getElementById('profileNotice');
        const productList = document.getElementById('productList');
        const profile = store.loadProfile();

        document.getElementById('shopName').value = profile.shop.name;
        document.getElementById('shopIndustry').value = profile.shop.industry;
        document.getElementById('shopSlogan').value = profile.shop.slogan;

        function showNotice(message, isError = false) {
            notice.textContent = message;
            notice.hidden = !message;
            notice.classList.toggle('is-error', isError);
        }

        function renderProducts() {
            const products = store.listProducts();
            if (!products.length) {
                const empty = document.createElement('p');
                empty.className = 'empty-card';
                empty.textContent = '还没有产品素材';
                productList.replaceChildren(empty);
                return;
            }
            const rows = products.map((product) => {
                const row = document.createElement('article');
                row.className = 'product-row';
                const heading = document.createElement('h3');
                heading.textContent = product.name;
                const sellingPoint = document.createElement('p');
                sellingPoint.textContent = product.sellingPoint || '未填写卖点';
                const price = document.createElement('strong');
                price.textContent = product.price
                    ? `价格：${product.price}`
                    : '未填写价格';
                row.append(heading, sellingPoint, price);
                return row;
            });
            productList.replaceChildren(...rows);
        }

        shopForm.addEventListener('submit', (event) => {
            event.preventDefault();
            store.saveShop({
                name: document.getElementById('shopName').value,
                industry: document.getElementById('shopIndustry').value,
                slogan: document.getElementById('shopSlogan').value,
            });
            showNotice('店铺资料已保存');
        });

        productForm.addEventListener('submit', (event) => {
            event.preventDefault();
            try {
                store.saveProduct({
                    id: globalScope.crypto?.randomUUID
                        ? globalScope.crypto.randomUUID()
                        : `product_${Date.now()}`,
                    name: document.getElementById('productName').value,
                    sellingPoint: document.getElementById(
                        'productSellingPoint',
                    ).value,
                    price: document.getElementById('productPrice').value,
                });
                productForm.reset();
                showNotice('产品已添加');
                renderProducts();
            } catch (error) {
                showNotice(error.message, true);
            }
        });

        renderProducts();
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', boot);
    }
}(globalThis));
```

- [ ] **Step 5: Add profile card styles**

Append:

```css
.settings-card, .product-row {
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
}
.settings-card label {
    display: block;
    margin: 14px 0 7px;
    font-size: 13px;
    font-weight: 700;
}
.settings-card label:first-child { margin-top: 0; }
.settings-card input, .settings-card textarea {
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 12px;
    background: var(--surface);
    color: var(--text);
}
.settings-card textarea { min-height: 82px; resize: vertical; }
.settings-card button {
    width: 100%;
    min-height: 48px;
    margin-top: 16px;
    border: 0;
    border-radius: 12px;
    background: var(--accent);
    color: #fff;
    font-weight: 700;
}
.product-list { display: grid; gap: 10px; margin-top: 12px; }
.product-row h3 { margin: 0; font-size: 15px; }
.product-row p { margin: 7px 0; color: var(--muted); font-size: 13px; }
.product-row strong { font-size: 12px; }
#profileNotice.is-error { color: #c63d48; }
```

- [ ] **Step 6: Add profile files to the build**

Add `'profile.html'` and `'profile.js'` to `publicEntries` and `build.test.js`.

- [ ] **Step 7: Run profile and store tests**

Run:

```powershell
node --test apps/product-swap/tests/profile-contract.test.js apps/product-swap/tests/merchant-store.test.js apps/product-swap/tests/build.test.js
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add apps/product-swap/profile.html apps/product-swap/profile.js apps/product-swap/app.css apps/product-swap/tests/profile-contract.test.js apps/product-swap/build.mjs apps/product-swap/tests/build.test.js
git commit -m "feat: add merchant profile page"
```

### Task 6: Upgrade task history into Works

**Files:**
- Modify: `apps/product-swap/history.html`
- Modify: `apps/product-swap/history.js`
- Modify: `apps/product-swap/local-history.js`
- Modify: `apps/product-swap/style.css`
- Modify: `apps/product-swap/tests/history-contract.test.js`
- Modify: `apps/product-swap/tests/local-history.test.js`

- [ ] **Step 1: Write failing status-filter tests**

Add to `local-history.test.js`:

```js
test('filters Works by status before pagination', () => {
    const tasks = [
        { id: 'a', status: 'completed' },
        { id: 'b', status: 'processing' },
        { id: 'c', status: 'failed' },
    ];
    assert.deepEqual(
        filterTasks(tasks, { status: 'completed' }).map((item) => item.id),
        ['a'],
    );
});
```

Import `filterTasks` from `../local-history`.

Update `history-contract.test.js` to require:

```js
for (const id of [
    'workStatusFilters',
    'taskList',
    'historyLoading',
    'historyEmpty',
    'historyError',
    'historyRetry',
    'loadMoreButton',
    'taskDetailLayer',
    'taskDetailClose',
    'taskDetailContent',
]) {
    assert.match(html, new RegExp(`id="${id}"`));
}
assert.match(html, />作品</);
assert.match(html, /data-status="processing"/);
assert.match(html, /data-status="completed"/);
assert.match(html, /data-status="failed"/);
assert.match(html, /data-nav="works"/);
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```powershell
node --test apps/product-swap/tests/local-history.test.js apps/product-swap/tests/history-contract.test.js
```

Expected: FAIL because `filterTasks` and `workStatusFilters` do not exist.

- [ ] **Step 3: Add a pure task filter**

Add before `listTasks()` in `local-history.js`:

```js
function filterTasks(tasks, { taskType = '', status = '' } = {}) {
    return tasks.filter((task) =>
        (!taskType || task.taskType === taskType)
        && (!status || task.status === status));
}
```

Change the `listTasks` signature to:

```js
async function listTasks({
    taskType = '',
    status = '',
    cursor,
    limit = 30,
} = {}) {
```

Replace its current type-only filter with:

```js
const filtered = filterTasks(
    all.filter((task) => task.userId === userId),
    { taskType, status },
).sort((left, right) => right.createdAt - left.createdAt);
```

Export `filterTasks` through `localHistory`.

- [ ] **Step 4: Change history markup into Works**

Make these exact content changes:

- Document title: `作品 · 商家内容助手`
- Heading: `作品`
- Description: `查看生成中的任务、草稿和已经完成的发布内容。`
- Empty action link: `/`
- Empty action label: `去找模板`

Replace `taskTypeFilters` with:

```html
<div id="workStatusFilters" class="task-filters" aria-label="作品状态">
    <button class="active" type="button" data-status="">全部</button>
    <button type="button" data-status="processing">生成中</button>
    <button type="button" data-status="completed">已完成</button>
    <button type="button" data-status="failed">失败</button>
</div>
```

Add `app.css` before `style.css` and add the standard bottom navigation with Works active.

- [ ] **Step 5: Update Works filtering in `history.js`**

Replace the current task-type selection state with:

```js
let activeStatus = '';
```

Pass it when loading:

```js
const page = await history.listTasks({
    status: activeStatus,
    cursor: reset ? undefined : nextCursor,
});
```

Bind the filter:

```js
elements.filters.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-status]');
    if (!button) {
        return;
    }
    activeStatus = button.dataset.status || '';
    for (const item of elements.filters.querySelectorAll('button')) {
        item.classList.toggle('active', item === button);
    }
    loadTasks({ reset: true });
});
```

Point `elements.filters` at `workStatusFilters`.

- [ ] **Step 6: Run Works tests**

Run:

```powershell
node --test apps/product-swap/tests/local-history.test.js apps/product-swap/tests/history-contract.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/product-swap/history.html apps/product-swap/history.js apps/product-swap/local-history.js apps/product-swap/style.css apps/product-swap/tests/history-contract.test.js apps/product-swap/tests/local-history.test.js
git commit -m "feat: upgrade task history into Works"
```

### Task 7: Apply the light creator visual system and responsive constraints

**Files:**
- Modify: `apps/product-swap/style.css`
- Modify: `apps/product-swap/app.css`
- Create: `apps/product-swap/tests/responsive-contract.test.js`

- [ ] **Step 1: Write the failing visual contract**

```js
// apps/product-swap/tests/responsive-contract.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('platform styles keep mobile width, safe navigation and accessible controls', () => {
    const appCss = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
    const creatorCss = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
    assert.match(appCss, /width:\s*min\(100%,\s*520px\)/);
    assert.match(appCss, /env\(safe-area-inset-bottom\)/);
    assert.match(appCss, /min-height:\s*48px/);
    assert.match(creatorCss, /--page:\s*#f7f6f2/);
    assert.match(creatorCss, /--accent:\s*#f4515b/);
    assert.match(creatorCss, /@media\s*\(max-width:\s*360px\)/);
});
```

- [ ] **Step 2: Run the visual contract and confirm palette failure**

Run:

```powershell
node --test apps/product-swap/tests/responsive-contract.test.js
```

Expected: FAIL because `style.css` still uses the dark palette.

- [ ] **Step 3: Replace creator palette tokens**

Change the top of `style.css` to:

```css
:root {
    color-scheme: light;
    --page: #f7f6f2;
    --panel: #ffffff;
    --panel-soft: #f0eee8;
    --line: #e4e0da;
    --line-strong: #c9c3bb;
    --text: #211f1d;
    --muted: #716d68;
    --accent: #f4515b;
    --danger: #c63d48;
    font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}
```

Update hard-coded dark surfaces in `.upload-box`, `.example-card`, `.result-card`, `.refinement-panel`, and `.task-detail-panel` to use the shared tokens. Keep the result image frame dark with `background: #121212`.

Ensure:

- `.product-swap-shell` has bottom padding of at least `104px`.
- `.generate-button` has `min-height: 48px`.
- `.bottom-nav` from `app.css` remains visible above creator content.
- Existing `.product-swap-shell` maximum width remains `460px`.
- The existing `@media (max-width: 360px)` rule remains.

- [ ] **Step 4: Complete shared focus and reduced-motion rules**

Add to `app.css`:

```css
:focus-visible {
    outline: 3px solid rgb(244 81 91 / 35%);
    outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
```

- [ ] **Step 5: Run visual and frontend contracts**

Run:

```powershell
node --test apps/product-swap/tests/responsive-contract.test.js apps/product-swap/tests/home-contract.test.js apps/product-swap/tests/creator-contract.test.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/history-contract.test.js apps/product-swap/tests/profile-contract.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/style.css apps/product-swap/app.css apps/product-swap/tests/responsive-contract.test.js
git commit -m "style: apply merchant content platform visuals"
```

### Task 8: Update the browser journey and complete verification

**Files:**
- Modify: `apps/product-swap/tests/browser-smoke.js`
- Modify: `apps/product-swap/README.md`

- [ ] **Step 1: Update the browser smoke route**

After loading `/`, assert:

```js
await page.waitForSelector('#templateGrid .template-card');
const homeState = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent.trim(),
    liveHref: document.querySelector(
        'a[href="/create.html?template=product-swap"]',
    )?.getAttribute('href'),
    navItems: document.querySelectorAll('.bottom-nav a').length,
}));
```

Then navigate to the real creator:

```js
await page.goto(`${appUrl}/create.html?template=product-swap`, {
    waitUntil: 'networkidle0',
    timeout: 60000,
});
```

Keep the existing upload, refresh recovery, refinement, asset expiry, detail, and deletion steps.

Change expected headings to:

```js
homeState.title === '今天想发什么？'
homeState.liveHref === '/create.html?template=product-swap'
homeState.navItems === 4
state.title === '爆款场景同款图'
historyState.title === '作品'
```

Before opening Works, click `#historyLink` as the existing test already does.

- [ ] **Step 2: Run the browser smoke test**

Run:

```powershell
pnpm --filter product-swap test:browser
```

Expected:

- Home contains one live template link and four nav items.
- Creator uploads two images.
- The generation survives refresh.
- Refinement creates a second completed task.
- Works lists tasks, opens details, handles expiry, and deletes a task.
- `errors` is empty and the process exits with code 0.

- [ ] **Step 3: Update the app README**

Document these routes:

```markdown
## Pages

- `/` — hotspot template discovery
- `/create.html?template=product-swap` — first live template creator
- `/history.html` — Works and generation status
- `/profile.html` — local shop and product profile

Merchant profile data and task history are browser-local in the first phase.
```

Keep the existing development, test, build, and deployment commands.

- [ ] **Step 4: Run the complete app test suite**

Run:

```powershell
pnpm --filter product-swap test
pnpm --filter product-swap build
```

Expected: all Node tests pass and the build prints `Product Swap static assets built in dist/`.

- [ ] **Step 5: Inspect mobile screenshots**

Start the development server:

```powershell
pnpm --filter product-swap dev
```

Capture `/`, `/create.html?template=product-swap`, `/history.html`, and `/profile.html` at widths 360px, 390px, and 430px. Verify:

- No horizontal page overflow.
- Bottom navigation does not cover the final actionable control.
- Template cards remain legible at 360px.
- Creator upload previews remain within the 460px content column.
- Works filters scroll or wrap without clipping.
- Profile save buttons remain at least 48px high.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/tests/browser-smoke.js apps/product-swap/README.md
git commit -m "test: cover social content platform journey"
```

## Final acceptance checklist

- [ ] Root route is a hotspot-template home rather than the generator.
- [ ] The current real generator is available at `/create.html?template=product-swap`.
- [ ] Existing generation, service-worker recovery, download, refinement, and local history behavior still pass.
- [ ] Coming-soon templates cannot navigate into an unusable creator.
- [ ] Shop and product information persist locally and appear on reload.
- [ ] Works filters by generation status before pagination.
- [ ] All four pages share the mobile bottom navigation.
- [ ] 360px, 390px, and 430px layouts have no horizontal overflow.
- [ ] `pnpm --filter product-swap test` passes.
- [ ] `pnpm --filter product-swap test:browser` passes.
- [ ] `pnpm --filter product-swap build` succeeds.
