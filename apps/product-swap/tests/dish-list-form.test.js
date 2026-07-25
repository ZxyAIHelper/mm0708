'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    buildTemplatePayload,
    initialValues,
    validateValues,
} = require('../creator-form');
const manifest = require('../template-packs/dish-ranking-guide/manifest');

test('initializes a dish list as an empty array', () => {
    assert.deepEqual(initialValues(manifest).dishes, []);
});

test('requires a dish and at least one owned user dish', () => {
    assert.equal(
        validateValues(manifest, { ...initialValues(manifest), dishes: [] })
            .message,
        '请上传菜品图片',
    );
    assert.equal(
        validateValues(manifest, {
            ...initialValues(manifest),
            dishes: [{
                image: 'data:image/png;base64,AA==',
                owned: false,
                source: 'user',
            }],
        }).message,
        '请至少标记一道自家菜品',
    );
});

test('builds an exact cloned dish payload', () => {
    const values = initialValues(manifest);
    values.dishes = [{
        image: ' data:image/png;base64,AA== ',
        owned: true,
        source: 'user',
        ignored: 'no',
    }];
    const payload = buildTemplatePayload(manifest, values);

    assert.deepEqual(payload.dishes, [{
        image: 'data:image/png;base64,AA==',
        owned: true,
        source: 'user',
    }]);
    assert.notEqual(payload.dishes, values.dishes);
});

test('creator renderer exposes a multiple dish upload contract', () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, '..', 'creator-meta.js'),
        'utf8',
    );
    assert.match(source, /renderDishListField/);
    assert.match(source, /input\.multiple = true/);
    assert.match(source, /dish-card-list/);
    assert.match(source, /dish-list-status/);
});

