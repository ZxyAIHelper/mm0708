const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

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
