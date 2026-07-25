const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');

test('profile page exposes the merchant profile contract', () => {
    const html = fs.readFileSync(path.join(appRoot, 'profile.html'), 'utf8');

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
        assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
    }

    const merchantScript = html.indexOf('<script src="/merchant-store.js"></script>');
    const profileScript = html.indexOf('<script src="/profile.js"></script>');
    assert.ok(merchantScript >= 0);
    assert.ok(merchantScript < profileScript);
    assert.match(html, /data-nav=["']profile["']/);
});
