const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
    getTemplate,
    listTemplates,
    searchTemplates,
} = require('../templates');
const {
    publicCatalog,
} = require('../server/template-registry');

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

    assert.equal(templates.length, 7);
    assert.equal(
        templates.filter((template) => template.status === 'live').length,
        4,
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
        ['dish-ranking-guide', 'food-copy-layout'],
    );
    assert.equal(getTemplate('unknown-template'), null);
});

test('browser catalog stays safe without CommonJS require or metadata arrays', () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, '..', 'templates.js'),
        'utf8',
    );
    const context = {
        __TEMPLATE_CATALOG__: [{
            id: 'minimal',
            name: '最小模板',
            summary: '可搜索',
            category: '示例',
        }],
        module: {},
    };
    context.globalThis = context;

    vm.runInNewContext(source, context);

    assert.deepEqual(
        Array.from(
            context.ContentTemplates.searchTemplates('示例'),
            (template) => template.id,
        ),
        ['minimal'],
    );
});

test('browser catalog does not assume a partial module global has require', () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, '..', 'templates.js'),
        'utf8',
    );
    const context = { module: {} };
    context.globalThis = context;

    vm.runInNewContext(source, context);

    assert.deepEqual(
        Array.from(context.ContentTemplates.listTemplates()),
        [],
    );
});

test('public catalog exposes only the manifest DTO contract', () => {
    const allowedManifestKeys = [
        'category',
        'cover',
        'creditCost',
        'fields',
        'href',
        'id',
        'name',
        'outputLabel',
        'platforms',
        'quickPrompts',
        'status',
        'summary',
        'tags',
        'taskType',
    ];
    const allowedFieldKeys = {
        image: ['accept', 'key', 'label', 'required', 'role', 'type'],
        'dish-list': [
            'accept',
            'key',
            'label',
            'maxItems',
            'minItems',
            'minOwned',
            'required',
            'role',
            'type',
        ],
        'chat-materials': [
            'accept',
            'key',
            'label',
            'maxImages',
            'minSources',
            'required',
            'type',
        ],
        choice: [
            'default',
            'key',
            'label',
            'options',
            'required',
            'type',
        ],
        boolean: ['default', 'key', 'label', 'required', 'type'],
        text: [
            'key',
            'label',
            'maxLength',
            'placeholder',
            'required',
            'type',
        ],
    };

    for (const template of publicCatalog()) {
        assert.deepEqual(
            Object.keys(template).sort(),
            allowedManifestKeys,
        );
        for (const field of template.fields) {
            assert.deepEqual(
                Object.keys(field).sort(),
                allowedFieldKeys[field.type].filter(
                    (key) => Object.hasOwn(field, key),
                ),
            );
        }
    }
});
