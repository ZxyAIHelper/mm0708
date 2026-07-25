const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getTemplatePackage,
    listTemplatePackages,
    publicCatalog,
    validateManifest,
} = require('../server/template-registry');

function validManifest(overrides = {}) {
    return {
        id: 'sample',
        taskType: 'sample_task',
        name: 'Sample',
        summary: 'Sample summary',
        category: 'Sample category',
        platforms: ['小红书'],
        tags: ['示例'],
        status: 'coming_soon',
        href: '',
        cover: '/assets/sample.jpg',
        outputLabel: '生成示例',
        creditCost: 0,
        fields: [],
        ...overrides,
    };
}

test('discovers all template packages in stable id order', () => {
    assert.deepEqual(
        listTemplatePackages().map((templatePackage) => templatePackage.manifest.id),
        [
            'before-after',
            'food-copy-layout',
            'product-swap',
            'store-promotion',
            'summer-seeding',
        ],
    );
});

test('publishes the live food-copy-layout contract without its prompt builder', () => {
    const foodTemplate = publicCatalog().find(
        (template) => template.id === 'food-copy-layout',
    );

    assert.equal(foodTemplate.status, 'live');
    assert.equal(foodTemplate.taskType, 'food_copy_layout');
    assert.deepEqual(
        foodTemplate.fields.map((field) => field.key),
        ['targetImage', 'aspectRatio', 'showDateTime', 'requirements'],
    );
    assert.equal('prompt' in foodTemplate, false);
    assert.equal('buildPrompt' in foodTemplate, false);
});

test('loads the private prompt builder for a live template package', () => {
    assert.equal(
        typeof getTemplatePackage('food-copy-layout').buildPrompt,
        'function',
    );
});

test('requires the arrays and cover consumed by the public catalog UI', () => {
    for (const key of ['platforms', 'tags', 'cover', 'fields']) {
        const manifest = validManifest();
        delete manifest[key];

        assert.throws(
            () => validateManifest(manifest, 'sample'),
            new RegExp(`Template sample is missing ${key}`),
        );
    }
});

test('rejects malformed catalog arrays with clear registry errors', () => {
    for (const key of ['platforms', 'tags', 'fields']) {
        assert.throws(
            () => validateManifest(validManifest({ [key]: {} }), 'sample'),
            new RegExp(`Template sample ${key} must be an array`),
        );
    }
});

test('rejects malformed platform and tag entries', () => {
    for (const key of ['platforms', 'tags']) {
        assert.throws(
            () => validateManifest(
                validManifest({ [key]: ['valid', ' '] }),
                'sample',
            ),
            new RegExp(
                `Template sample ${key} entries must be non-empty strings`,
            ),
        );
    }
});

test('requires a non-empty cover and non-empty field keys', () => {
    assert.throws(
        () => validateManifest(validManifest({ cover: '' }), 'sample'),
        /Template sample cover must be a non-empty string/,
    );
    assert.throws(
        () => validateManifest(validManifest({ cover: 42 }), 'sample'),
        /Template sample cover must be a non-empty string/,
    );
    assert.throws(
        () => validateManifest(
            validManifest({ fields: [{ key: ' ' }] }),
            'sample',
        ),
        /Template sample field keys must be non-empty strings/,
    );
    assert.throws(
        () => validateManifest(validManifest({ fields: [null] }), 'sample'),
        /Template sample field keys must be non-empty strings/,
    );
});

test('rejects a non-object manifest with a clear registry error', () => {
    assert.throws(
        () => validateManifest(null, 'sample'),
        /Template sample manifest must be an object/,
    );
});

test('package manifests cannot be mutated through registry results', () => {
    const templatePackage = getTemplatePackage('food-copy-layout');
    const originalKey = templatePackage.manifest.fields[0].key;

    templatePackage.manifest.fields[0].key = 'polluted';

    assert.equal(
        getTemplatePackage('food-copy-layout').manifest.fields[0].key,
        originalKey,
    );
    assert.equal(
        publicCatalog().find(
            (template) => template.id === 'food-copy-layout',
        ).fields[0].key,
        originalKey,
    );
    assert.equal(typeof templatePackage.buildPrompt, 'function');
});
