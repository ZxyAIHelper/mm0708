const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const history = require('../local-history');

test('filters works by status', () => {
    const tasks = [
        { id: 'a', status: 'completed' },
        { id: 'b', status: 'processing' },
        { id: 'c', status: 'failed' },
    ];

    assert.deepEqual(
        history.filterTasks(tasks, { status: 'completed' }).map(({ id }) => id),
        ['a'],
    );
});

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

test('creates a persisted asset directly from a Blob', () => {
    const source = new Blob(['page'], { type: 'image/png' });
    const asset = history.assetFromSource(
        'task_1',
        'output',
        source,
        100,
    );

    assert.equal(asset.blob, source);
    assert.equal(asset.sourceUrl, '');
    assert.equal(asset.contentType, 'image/png');
    assert.equal(asset.byteSize, 4);
});

test('normalizes explicit multi-page outputs and legacy imageUrl', () => {
    const one = new Blob(['one'], { type: 'image/png' });
    const two = new Blob(['two'], { type: 'image/png' });

    assert.deepEqual(history.outputSources(
        { imageUrl: 'https://example.com/legacy.png' },
    ), ['https://example.com/legacy.png']);
    assert.deepEqual(history.outputSources(
        { imageUrl: '' },
        [one, two],
    ), [one, two]);
});

test('keeps multi-page output assets in page order', () => {
    const assets = history.sortTaskAssets([
        { id: 'page-2', role: 'output', order: 1 },
        { id: 'page-1', role: 'output', order: 0 },
    ]);

    assert.deepEqual(assets.map(({ id }) => id), [
        'page-1',
        'page-2',
    ]);
});

test('keeps task-list previews free of image blobs', () => {
    const preview = history.previewAssetFromAsset({
        id: 'asset_1',
        taskId: 'task_1',
        role: 'output',
        blob: new Blob(['large image']),
        sourceUrl: 'https://example.com/result.png',
        expiresAt: 123,
        deletedAt: null,
    });

    assert.equal(preview.sourceUrl, 'https://example.com/result.png');
    assert.equal('blob' in preview, false);
});

test('recognizes interrupted processing tasks after the recovery window', () => {
    const now = 1_000_000;
    assert.equal(history.isStaleProcessingTask({
        status: 'processing',
        updatedAt: now - history.PROCESSING_STALE_MS,
    }, now), true);
    assert.equal(history.isStaleProcessingTask({
        status: 'completed',
        updatedAt: 0,
    }, now), false);
});

test('selects the newest processing task for the current user and tool', () => {
    const selected = history.selectLatestProcessingTask([
        { id: 'other', userId: 'u2', taskType: 'product_swap', status: 'processing', createdAt: 30 },
        { id: 'old', userId: 'u1', taskType: 'product_swap', status: 'processing', createdAt: 10 },
        { id: 'done', userId: 'u1', taskType: 'product_swap', status: 'completed', createdAt: 40 },
        { id: 'new', userId: 'u1', taskType: 'product_swap', status: 'processing', createdAt: 20 },
    ], 'u1', 'product_swap');

    assert.equal(selected.id, 'new');
});

test('exports local polling helpers', () => {
    assert.equal(typeof history.latestProcessingTask, 'function');
    assert.equal(typeof history.touchTask, 'function');
    assert.equal(typeof history.markTaskDispatched, 'function');
    assert.equal(typeof history.completeTaskMetadata, 'function');
    assert.equal(typeof history.storeGenerationReceipt, 'function');
    assert.equal(typeof history.getGenerationReceipt, 'function');
    assert.equal(typeof history.getAsset, 'function');
});

test('does not overwrite terminal success with an interruption failure', () => {
    const completed = { status: 'completed', result: { imageUrl: 'url' } };
    assert.equal(
        history.transitionTaskToFailed(
            completed,
            'GENERATION_INTERRUPTED',
            'interrupted',
            100,
        ),
        completed,
    );
});

test('allows provider success to recover an interruption race', () => {
    const task = history.transitionTaskToCompleted({
        status: 'failed',
        errorCode: 'GENERATION_INTERRUPTED',
    }, { imageUrl: 'url' }, null, 100);

    assert.equal(task.status, 'completed');
    assert.equal(task.result.imageUrl, 'url');
});

test('exposes the repository to window and service worker globals', () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, '..', 'local-history.js'),
        'utf8',
    );
    assert.match(source, /globalThis\.LocalTaskHistory = localHistory/);
});

test('avoids bulk asset reads and completes tasks atomically', () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, '..', 'local-history.js'),
        'utf8',
    );

    assert.doesNotMatch(source, /objectStore\('assets'\)\.getAll\(/);
    assert.match(
        source,
        /transaction\(\s*\[\s*'tasks',\s*'assets'\s*\],\s*'readwrite'/,
    );
    assert.match(source, /openKeyCursor/);
});
