const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getTemplate,
    listTemplates,
    searchTemplates,
} = require('../templates');

test('exposes the live product-swap template with its creation details', () => {
    const template = getTemplate('product-swap');

    assert.equal(template.status, 'live');
    assert.equal(template.taskType, 'product_swap');
    assert.equal(template.href, '/create.html?template=product-swap');
    assert.deepEqual(template.platforms, ['小红书', '抖音图文']);
    assert.deepEqual(
        template.fields.map((field) => field.key),
        ['targetImage', 'productImage', 'sceneImage', 'requirements'],
    );
});

test('lists, filters, and searches the catalog', () => {
    const templates = listTemplates();
    const imageRemakes = listTemplates({ category: '改造图片' });

    assert.equal(templates.length, 5);
    assert.equal(
        templates.filter((template) => template.status === 'live').length,
        2,
    );
    assert.ok(templates.some((template) => template.status === 'coming_soon'));
    assert.ok(imageRemakes.length > 0);
    assert.ok(imageRemakes.every((template) => template.category === '改造图片'));
    assert.deepEqual(
        searchTemplates('背景').map((template) => template.id),
        ['product-swap'],
    );
    assert.deepEqual(
        searchTemplates('美食').map((template) => template.id),
        ['food-copy-layout'],
    );
    assert.equal(getTemplate('unknown-template'), null);
});
