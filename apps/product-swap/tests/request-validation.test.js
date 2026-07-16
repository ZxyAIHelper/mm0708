const test = require('node:test');
const assert = require('node:assert/strict');

const {
    validateGenerateRequest,
    decodeImageDataUrl,
} = require('../server/dev-server');

const tinyPng = 'data:image/png;base64,iVBORw0KGgo=';

test('requires targetImage', () => {
    assert.throws(
        () => validateGenerateRequest({ requirements: '' }),
        (error) => error.code === 'INVALID_INPUT',
    );
});

test('accepts supported images and trims requirements', () => {
    const value = validateGenerateRequest({
        targetImage: tinyPng,
        productImage: '',
        sceneImage: '',
        requirements: '  保持三个托盘  ',
    });

    assert.equal(value.requirements, '保持三个托盘');
});

test('rejects requirements longer than 200 characters', () => {
    assert.throws(
        () =>
            validateGenerateRequest({
                targetImage: tinyPng,
                requirements: '菜'.repeat(201),
            }),
        (error) => error.code === 'INVALID_INPUT',
    );
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
