const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getTemplatePackage,
    listTemplatePackages,
    publicCatalog,
} = require('../server/template-registry');

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
