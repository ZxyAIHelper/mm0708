const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');

test('homepage exposes the hotspot template discovery contract', () => {
    const html = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');

    for (const id of [
        'shopSummary',
        'templateSearch',
        'quickTasks',
        'hotTemplates',
        'templateCategories',
        'templateGrid',
        'homeEmpty',
    ]) {
        assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
    }

    assert.match(html, /href=["']\/create\.html\?template=product-swap["']/);
    assert.match(html, /今日热点/);
    assert.match(html, /平台精选/);
    assert.match(html, /试试“产品”“门店”“活动”或“背景”。/);

    const catalogScript = html.indexOf(
        '<script src="/template-catalog.js"></script>',
    );
    const templateScript = html.indexOf('<script src="/templates.js"></script>');
    const merchantScript = html.indexOf('<script src="/merchant-store.js"></script>');
    const homeScript = html.indexOf('<script src="/home.js"></script>');
    assert.ok(catalogScript >= 0);
    assert.ok(templateScript >= 0);
    assert.ok(catalogScript < templateScript);
    assert.ok(templateScript < merchantScript);
    assert.ok(merchantScript < homeScript);

    assert.equal((html.match(/class=["'][^"']*\bbottom-nav\b[^"']*["']/g) || []).length, 1);

    const bottomNav = html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
    assert.deepEqual(
        [...bottomNav.matchAll(/data-nav="([^"]+)"/g)].map((match) => match[1]),
        ['home', 'create', 'history', 'profile'],
    );
    assert.match(
        bottomNav,
        /class="active"[^>]*data-nav="home"[^>]*aria-current="page"/,
    );
    assert.match(
        html,
        /id="templateCategories"[\s\S]*?class="category-strip"[\s\S]*?role="group"[\s\S]*?aria-label="模板分类"/,
    );
    assert.match(
        html,
        /id="homeEmpty"[^>]*role="status"[^>]*aria-live="polite"/,
    );

    const quickTasks = html.match(/<section id="quickTasks"[\s\S]*?<\/section>/)?.[0] || '';
    assert.equal(
        (quickTasks.match(/href="\/create\.html\?template=product-swap"/g) || []).length,
        1,
    );
    assert.deepEqual(
        [...quickTasks.matchAll(/<button[^>]*data-query="([^"]+)"/g)]
            .map((match) => match[1]),
        ['门店', '活动', '背景'],
    );
});

test('home card models preserve only live template links', () => {
    const { templateCardModel } = require('../home');
    const live = templateCardModel({
        name: '产品推广',
        status: 'live',
        href: '/create.html?template=product-swap',
        platforms: ['小红书', '抖音图文'],
    });
    const unavailable = templateCardModel({
        name: '门店活动',
        status: 'coming_soon',
        href: '/create.html?template=store',
        platforms: ['小红书'],
    });

    assert.equal(live.href, '/create.html?template=product-swap');
    assert.equal(live.statusLabel, '立即套用');
    assert.equal(live.platformLabel, '小红书 · 抖音图文');
    assert.equal(unavailable.href, '');
    assert.equal(unavailable.statusLabel, '即将上线');
});

test('home discovers the live food copy layout through the generic catalog', () => {
    const { templateCardModel } = require('../home');
    const { listTemplates, searchTemplates } = require('../templates');
    const food = listTemplates()
        .map(templateCardModel)
        .find((template) => template.id === 'food-copy-layout');

    assert.equal(food.status, 'live');
    assert.equal(food.href, '/create.html?template=food-copy-layout');
    assert.equal(food.outputLabel, '生成 1 张文案配图');
    for (const query of ['美食', '文案', '排版']) {
        assert.ok(
            searchTemplates(query)
                .map((template) => template.id)
                .includes('food-copy-layout'),
        );
    }

    const source = fs.readFileSync(path.join(appRoot, 'home.js'), 'utf8');
    assert.doesNotMatch(source, /food-copy-layout/);
});

test('unavailable templates render as disabled articles', () => {
    const source = fs.readFileSync(path.join(appRoot, 'home.js'), 'utf8');

    assert.match(source, /createElement\(model\.href \? 'a' : 'article'\)/);
    assert.match(source, /setAttribute\('aria-disabled', 'true'\)/);
});

test('shop summary falls back when merchant storage is unavailable', () => {
    const { readShopSummary } = require('../home');

    assert.equal(
        readShopSummary(() => {
            throw new DOMException('Blocked', 'SecurityError');
        }),
        '完善店铺',
    );
    assert.equal(
        readShopSummary(() => ({
            loadProfile() {
                return { shop: { name: '山野面包房' } };
            },
        })),
        '山野面包房',
    );
});

test('category buttons synchronize active and aria-pressed state', () => {
    const { syncCategoryButton } = require('../home');
    const states = new Set();
    const attributes = {};
    const button = {
        classList: {
            toggle(name, enabled) {
                if (enabled) states.add(name);
                else states.delete(name);
            },
        },
        setAttribute(name, value) {
            attributes[name] = value;
        },
    };

    syncCategoryButton(button, true);
    assert.equal(states.has('active'), true);
    assert.equal(attributes['aria-pressed'], 'true');

    syncCategoryButton(button, false);
    assert.equal(states.has('active'), false);
    assert.equal(attributes['aria-pressed'], 'false');
});

test('home styles expose the planned active selectors and local nav colors', () => {
    const css = fs.readFileSync(path.join(appRoot, 'app.css'), 'utf8');

    assert.match(css, /\.category-strip button\.active\s*\{/);
    assert.match(css, /\.bottom-nav a\.active\s*\{/);
    assert.match(css, /\.bottom-nav a\s*\{[\s\S]*?color:\s*#716d68;/);
    assert.match(css, /\.bottom-nav a\.active\s*\{[\s\S]*?color:\s*#c63d48;/);
});
