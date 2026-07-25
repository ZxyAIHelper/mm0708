const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const pages = ['index.html', 'create.html', 'history.html', 'profile.html'];
const expectedItems = [
    { icon: '⌂', label: '首页' },
    { icon: '＋', label: '创作' },
    { icon: '▤', label: '作品' },
    { icon: '○', label: '我的' },
];

test('bottom navigation keeps the same icons on every page', () => {
    for (const page of pages) {
        const html = fs.readFileSync(path.join(appRoot, page), 'utf8');
        const nav = html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0];

        assert.ok(nav, `${page} is missing the bottom navigation`);

        const items = [...nav.matchAll(
            /<a\b[^>]*data-nav="[^"]+"[^>]*>\s*<span aria-hidden="true">([^<]+)<\/span>\s*([^<\s]+)\s*<\/a>/g,
        )].map((match) => ({
            icon: match[1],
            label: match[2],
        }));

        assert.deepEqual(items, expectedItems, `${page} has inconsistent nav items`);
    }
});
