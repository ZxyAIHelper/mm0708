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
    assert.match(html, /<script src=["']\/templates\.js["']/);
    assert.match(html, /<script src=["']\/merchant-store\.js["']/);
    assert.match(html, /<script src=["']\/home\.js["']/);
    assert.equal((html.match(/class=["'][^"']*\bbottom-nav\b[^"']*["']/g) || []).length, 1);
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
