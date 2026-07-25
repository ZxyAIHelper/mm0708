const test = require('node:test');
const assert = require('node:assert/strict');

const manifest = require(
    '../template-packs/food-copy-layout/manifest',
);
const {
    initialValues,
    buildTemplatePayload,
    createOperationVersions,
    createUploadOperations,
    choiceTabIndex,
    nextChoiceIndex,
    validateImageDimensions,
    validateValues,
} = require('../creator-form');

test('separates per-field upload completion from global feedback ownership', () => {
    const uploads = createUploadOperations();
    const targetA = uploads.begin('targetImage');
    const productB = uploads.begin('productImage');

    assert.equal(
        uploads.isFieldCurrent('targetImage', targetA),
        true,
    );
    assert.equal(uploads.isLatestFeedback(targetA), false);
    assert.equal(
        uploads.isFieldCurrent('productImage', productB),
        true,
    );
    assert.equal(uploads.isLatestFeedback(productB), true);

    const targetC = uploads.begin('targetImage');
    assert.equal(
        uploads.isFieldCurrent('targetImage', targetA),
        false,
    );
    assert.equal(uploads.isLatestFeedback(productB), false);
    assert.equal(uploads.isLatestFeedback(targetC), true);
});

test('keeps exactly one choice reachable without a selected default', () => {
    assert.deepEqual(
        ['a', 'b', 'c'].map((value, index) => (
            choiceTabIndex(value, '', index)
        )),
        [0, -1, -1],
    );
    assert.deepEqual(
        ['a', 'b', 'c'].map((value, index) => (
            choiceTabIndex(value, 'b', index)
        )),
        [-1, 0, -1],
    );
});

test('only the latest operation version remains current per field', () => {
    const versions = createOperationVersions();
    const firstTarget = versions.next('targetImage');
    const product = versions.next('productImage');
    const secondTarget = versions.next('targetImage');

    assert.equal(versions.isCurrent('targetImage', firstTarget), false);
    assert.equal(versions.isCurrent('targetImage', secondTarget), true);
    assert.equal(versions.isCurrent('productImage', product), true);
    assert.equal(versions.next('targetImage'), secondTarget + 1);
});

test('maps choice navigation keys with wrapping and endpoints', () => {
    assert.equal(nextChoiceIndex(1, 3, 'ArrowRight'), 2);
    assert.equal(nextChoiceIndex(2, 3, 'ArrowDown'), 0);
    assert.equal(nextChoiceIndex(0, 3, 'ArrowLeft'), 2);
    assert.equal(nextChoiceIndex(1, 3, 'Home'), 0);
    assert.equal(nextChoiceIndex(1, 3, 'End'), 2);
    assert.equal(nextChoiceIndex(1, 3, 'Enter'), 1);
});

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
