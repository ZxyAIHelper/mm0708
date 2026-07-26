'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    publicCatalog,
    validateManifest,
} = require('../server/template-registry');

function sampleManifest(fields) {
    return {
        id: 'sample',
        taskType: 'sample',
        name: '示例',
        summary: '示例模板',
        category: '测试',
        platforms: ['测试'],
        tags: ['测试'],
        status: 'coming_soon',
        href: '',
        cover: '/assets/example.jpg',
        outputLabel: '生成',
        creditCost: 0,
        fields,
    };
}

test('publishes the live dish ranking template', () => {
    const template = publicCatalog().find(
        (item) => item.id === 'dish-ranking-guide',
    );

    assert.ok(template);
    assert.equal(template.status, 'live');
    assert.equal(template.creditCost, 0);
    assert.deepEqual(template.quickPrompts, []);
    assert.deepEqual(template.fields[0], {
        key: 'dishes',
        type: 'dish-list',
        role: 'dish',
        label: '菜品图片',
        required: true,
        minItems: 1,
        maxItems: 12,
        minOwned: 1,
        accept: ['image/jpeg', 'image/png', 'image/webp'],
    });
    const layout = template.fields.find((field) => field.key === 'layout');
    assert.deepEqual(layout.options, [{
        value: 'tier',
        label: '从拉到夯',
    }]);
    assert.equal(
        template.fields.some((field) => field.key === 'requirements'),
        false,
    );
});

test('validates dish-list bounds', () => {
    assert.throws(() => validateManifest(sampleManifest([{
        key: 'dishes',
        type: 'dish-list',
        role: 'dish',
        label: '菜品图片',
        required: true,
        minItems: 3,
        maxItems: 2,
        minOwned: 1,
    }]), 'sample'), /dish-list bounds/);
});

