const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

test('portal links to the product swap custom domain', () => {
    const html = fs.readFileSync(
        path.join(workspaceRoot, 'apps', 'pages', 'index.html'),
        'utf8',
    );

    assert.match(
        html,
        /href="https:\/\/product-swap\.mm0708\.top"/,
    );
    assert.match(html, />一键换产品</);
});

test('product swap worker declares the custom domain', () => {
    const config = JSON.parse(fs.readFileSync(
        path.join(
            workspaceRoot,
            'apps',
            'product-swap',
            'wrangler.jsonc',
        ),
        'utf8',
    ));

    assert.deepEqual(config.routes, [{
        pattern: 'product-swap.mm0708.top',
        custom_domain: true,
    }]);
});
