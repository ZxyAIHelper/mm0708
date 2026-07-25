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
    assert.match(html, /<label for=["']shopSlogan["']>常用宣传语<\/label>/);
    assert.match(html, /<label for=["']productSellingPoint["']>核心卖点<\/label>/);
    assert.match(html, /<label for=["']productPrice["']>价格<\/label>/);
});

test('profile styles keep form actions clear of the fixed navigation', () => {
    const css = fs.readFileSync(path.join(appRoot, 'app.css'), 'utf8');

    assert.match(
        css,
        /html\s*\{[\s\S]*?scroll-padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)[^;]*\);/,
    );
    assert.match(
        css,
        /\.profile-shell\s*\{[\s\S]*?padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)[^;]*\);/,
    );
    assert.match(
        css,
        /\.settings-card button\s*\{[\s\S]*?scroll-margin-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)[^;]*\);/,
    );
    assert.match(
        css,
        /\.product-row h3,[\s\S]*?\.product-row p,[\s\S]*?\.product-row strong\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/,
    );
    assert.match(
        css,
        /\.profile-shell \.profile-section\s*\{[\s\S]*?margin-top:\s*18px;[\s\S]*?gap:\s*10px;/,
    );
    assert.match(
        css,
        /\.profile-shell \.settings-card\s*\{[\s\S]*?gap:\s*7px;/,
    );
});
