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

    const templateScript = html.indexOf('<script src="/templates.js"></script>');
    const merchantScript = html.indexOf('<script src="/merchant-store.js"></script>');
    const homeScript = html.indexOf('<script src="/home.js"></script>');
    assert.ok(templateScript >= 0);
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
        /class="is-active"[^>]*data-nav="home"[^>]*aria-current="page"/,
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

test('unavailable templates render as disabled articles', () => {
    const source = fs.readFileSync(path.join(appRoot, 'home.js'), 'utf8');

    assert.match(source, /createElement\(model\.href \? 'a' : 'article'\)/);
    assert.match(source, /setAttribute\('aria-disabled', 'true'\)/);
});
