'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    validateGenerateRequest,
    decodeImageDataUrl,
} = require('../server/dev-server');

const tinyPng = 'data:image/png;base64,iVBORw0KGgo=';

test('requires the default product-swap target image', () => {
    assert.throws(
        () => validateGenerateRequest({ requirements: '' }),
        (error) => error.code === 'INVALID_INPUT'
            && error.message === '请上传目标图（样图模板）',
    );
});

test('keeps product-swap as the default and trims requirements', () => {
    const value = validateGenerateRequest({
        targetImage: tinyPng,
        productImage: '',
        sceneImage: '',
        requirements: '  保持三个托盘  ',
    });

    assert.equal(value.template.manifest.id, 'product-swap');
    assert.equal(value.values.requirements, '保持三个托盘');
});

test('rejects initial requirements longer than the manifest limit', () => {
    assert.throws(
        () =>
            validateGenerateRequest({
                targetImage: tinyPng,
                requirements: '菜'.repeat(201),
            }),
        (error) => error.code === 'INVALID_INPUT',
    );
});

test('allows a longer correction when refining a previous result', () => {
    const value = validateGenerateRequest({
        targetImage: tinyPng,
        previousImage: tinyPng,
        requirements: '调整'.repeat(200),
    });

    assert.equal(value.values.requirements.length, 400);
    assert.ok(value.previousImage);
});

test('validates a live food template from its manifest', () => {
    const value = validateGenerateRequest({
        templateId: 'food-copy-layout',
        targetImage: tinyPng,
        aspectRatio: '3:4',
        showDateTime: true,
        generatedAt: '2026-07-25T08:16:58.000Z',
        requirements: '  像朋友随手记录  ',
    });

    assert.equal(value.template.manifest.id, 'food-copy-layout');
    assert.equal(value.values.aspectRatio, '3:4');
    assert.equal(value.values.showDateTime, true);
    assert.equal(value.values.requirements, '像朋友随手记录');
    assert.equal(
        value.values.generatedAt,
        '2026-07-25T08:16:58.000Z',
    );
});

test('rejects missing, unavailable, and invalid template input', () => {
    assert.throws(
        () => validateGenerateRequest({ templateId: 'missing' }),
        (error) => error.code === 'INVALID_TEMPLATE'
            && error.message === '模板不可用',
    );
    assert.throws(
        () => validateGenerateRequest({
            templateId: 'summer-seeding',
        }),
        (error) => error.code === 'INVALID_TEMPLATE'
            && error.message === '模板不可用',
    );
    assert.throws(
        () => validateGenerateRequest({
            templateId: 'food-copy-layout',
            targetImage: tinyPng,
            aspectRatio: '1:1',
        }),
        (error) => error.code === 'INVALID_INPUT'
            && error.message === '画布比例无效',
    );
});

test('validates date-time and retains only the last six messages', () => {
    assert.throws(
        () => validateGenerateRequest({
            templateId: 'food-copy-layout',
            targetImage: tinyPng,
            showDateTime: true,
            generatedAt: 'not-a-date',
        }),
        (error) => error.code === 'INVALID_INPUT'
            && error.message === '日期时间无效',
    );

    const messages = Array.from({ length: 8 }, (_, index) => ({
        role: 'user',
        content: `message ${index}`,
    }));
    const value = validateGenerateRequest({
        targetImage: tinyPng,
        messages,
    });

    assert.deepEqual(value.messages, messages.slice(-6));
});

test('decodes supported Data URLs and rejects unsupported MIME types', () => {
    const decoded = decodeImageDataUrl(tinyPng, 'targetImage');
    assert.equal(decoded.mimeType, 'image/png');
    assert.ok(Buffer.isBuffer(decoded.buffer));

    assert.throws(
        () =>
            decodeImageDataUrl(
                'data:image/gif;base64,R0lGODlh',
                'targetImage',
            ),
        (error) => error.code === 'UNSUPPORTED_IMAGE',
    );
});
