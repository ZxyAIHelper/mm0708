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
        'swapForm',
        'templateFields',
        'formError',
        'generateButton',
        'resultSection',
        'refineForm',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }

    assert.doesNotMatch(html, /id="(?:target|product|scene)Input"/);
    const scripts = [
        '/template-catalog.js',
        '/templates.js',
        '/creator-form.js',
        '/creator-meta.js',
        '/api-client.js',
        '/local-history.js',
        '/script.js',
    ];
    let previousIndex = -1;
    for (const script of scripts) {
        const index = html.indexOf(`<script src="${script}"></script>`);
        assert.ok(index > previousIndex, `${script} is in dependency order`);
        previousIndex = index;
    }
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

test('restores the active template generation label after loading', () => {
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.match(source, /activeTemplate\?\.outputLabel/);
    assert.match(source, /activeTemplate\?\.creditCost/);
});

test('creator metadata renders all supported schema field types', () => {
    const meta = require('../creator-meta');
    const source = fs.readFileSync(
        path.join(root, 'creator-meta.js'),
        'utf8',
    );

    assert.equal(typeof meta.renderTemplateFields, 'function');
    assert.match(source, /template-field-\$\{field\.type\}/);
    assert.match(source, /hint\.textContent = '点击或拖拽上传'/);
    assert.match(source, /group\.className = 'choice-group'/);
    assert.match(source, /role', 'radiogroup'/);
    assert.match(source, /button\.className = 'switch-control'/);
    assert.match(source, /role', 'switch'/);
    assert.match(source, /button\.appendChild\(text\)/);
    assert.match(source, /field\.maxLength/);
});

test('schema field rerenders preserve creator metadata structure', () => {
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.match(source, /hint\.textContent = '点击或拖拽上传'/);
    assert.match(source, /button\.firstElementChild\.textContent/);
});
