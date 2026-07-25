const test = require('node:test');
const assert = require('node:assert/strict');

const manifest = require(
    '../template-packs/food-copy-layout/manifest',
);
const {
    initialValues,
    buildTemplatePayload,
    validateImageDimensions,
    validateValues,
} = require('../creator-form');

test('initializes values from the food template schema', () => {
    assert.deepEqual(initialValues(manifest), {
        targetImage: '',
        aspectRatio: '3:4',
        showDateTime: true,
        requirements: '',
    });
});

test('builds an exact food-template payload', () => {
    assert.deepEqual(buildTemplatePayload(
        manifest,
        {
            targetImage: 'data:image/png;base64,food',
            aspectRatio: '3:4',
            showDateTime: true,
            requirements: '  突出菜品分量  ',
        },
        '2026-07-25T10:00:00.000Z',
    ), {
        templateId: 'food-copy-layout',
        targetImage: 'data:image/png;base64,food',
        aspectRatio: '3:4',
        showDateTime: true,
        generatedAt: '2026-07-25T10:00:00.000Z',
        requirements: '突出菜品分量',
    });
});

test('omits generatedAt when the timestamp switch is off', () => {
    const payload = buildTemplatePayload(
        manifest,
        {
            ...initialValues(manifest),
            targetImage: 'data:image/png;base64,food',
            showDateTime: false,
        },
        '2026-07-25T10:00:00.000Z',
    );

    assert.equal('generatedAt' in payload, false);
});

test('reports the first missing required image field', () => {
    assert.deepEqual(validateValues(manifest, {
        ...initialValues(manifest),
        targetImage: '',
    }), {
        field: 'targetImage',
        message: '请上传菜品图片',
    });
});

test('rejects text longer than the schema maximum', () => {
    assert.deepEqual(validateValues(manifest, {
        ...initialValues(manifest),
        targetImage: 'data:image/png;base64,food',
        requirements: '菜'.repeat(201),
    }), {
        field: 'requirements',
        message: '补充想法不能超过 200 字',
    });
});

test('rejects images whose short edge is below 320 pixels', () => {
    assert.deepEqual(validateImageDimensions(1200, 319), {
        code: 'IMAGE_TOO_SMALL',
        message: '图片短边不能小于 320 像素',
    });
    assert.equal(validateImageDimensions(1200, 800), null);
});
