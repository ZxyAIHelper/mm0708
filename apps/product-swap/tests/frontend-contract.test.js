const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const {
    resolveApiBase,
    validateClientFileMeta,
    buildGeneratePayload,
    mapErrorCode,
} = require('../script');

test('page exposes the screenshot-matching controls', () => {
    const html = fs.readFileSync(
        path.join(root, 'index.html'),
        'utf8',
    );

    for (const id of [
        'targetInput',
        'productInput',
        'sceneInput',
        'requirementsInput',
        'generateButton',
        'resultImage',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }

    assert.match(html, /生成（消耗 3 豆额度）/);
    assert.match(html, /最多200字/);
});

test('uses same-origin locally and the shared API in production', () => {
    assert.equal(resolveApiBase('', 'localhost'), '');
    assert.equal(resolveApiBase('', '127.0.0.1'), '');
    assert.equal(
        resolveApiBase('', 'swap.mm0708.top'),
        'https://api.mm0708.top',
    );
    assert.equal(
        resolveApiBase('https://custom.example', 'localhost'),
        'https://custom.example',
    );
});

test('validates upload metadata', () => {
    assert.equal(
        validateClientFileMeta({
            type: 'image/png',
            size: 1024,
        }),
        null,
    );
    assert.equal(
        validateClientFileMeta({
            type: 'image/gif',
            size: 1024,
        }).code,
        'UNSUPPORTED_IMAGE',
    );
});

test('builds the stable request and maps provider errors', () => {
    assert.deepEqual(
        buildGeneratePayload({
            target: 'target',
            product: '',
            scene: '',
            requirements: ' 保持排列 ',
        }),
        {
            targetImage: 'target',
            productImage: '',
            sceneImage: '',
            requirements: '保持排列',
        },
    );
    assert.equal(
        mapErrorCode('CODEX_TIMEOUT'),
        '生成超时，请稍后重试',
    );
});
