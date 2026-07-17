const test = require('node:test');
const assert = require('node:assert/strict');

const history = require('../local-history');

test('defines stable local task history helpers', () => {
    assert.equal(
        history.ASSET_TTL_MS,
        30 * 24 * 60 * 60 * 1000,
    );
    assert.equal(history.taskTitle('product_swap'), '一键换产品');
    assert.equal(history.taskTitle('future_tool'), 'AI 生成任务');
    assert.equal(history.isExpired({ expiresAt: 100 }, 100), true);
    assert.equal(history.isExpired({ expiresAt: 101 }, 100), false);
});

test('converts image data urls to compact blobs', async () => {
    const blob = history.dataUrlToBlob(
        'data:image/png;base64,aW1hZ2U=',
    );

    assert.equal(blob.type, 'image/png');
    assert.equal(await blob.text(), 'image');
});
