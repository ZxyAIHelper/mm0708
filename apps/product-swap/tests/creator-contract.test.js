const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('creator page exposes the template-driven generator controls', () => {
    const html = fs.readFileSync(
        path.join(root, 'create.html'),
        'utf8',
    );

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

test('resolves only live creator templates', () => {
    const { resolveCreatorTemplate } = require('../creator-meta');

    assert.equal(
        resolveCreatorTemplate('?template=product-swap')?.id,
        'product-swap',
    );
    assert.equal(resolveCreatorTemplate('?template=missing'), null);
    assert.equal(resolveCreatorTemplate('?template=summer-seeding'), null);
});
