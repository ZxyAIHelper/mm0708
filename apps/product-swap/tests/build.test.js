const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');

test('build emits only deployable public assets', async () => {
    const { build } = await import('../build.mjs');
    await build();

    const entries = await fs.readdir(
        path.join(appRoot, 'dist'),
    );
    assert.deepEqual(entries.sort(), [
        'api-client.js',
        'app.css',
        'assets',
        'create.html',
        'creator-meta.js',
        'generation-worker.js',
        'history.html',
        'history.js',
        'home.js',
        'index.html',
        'local-history.js',
        'merchant-store.js',
        'script.js',
        'style.css',
        'templates.js',
    ]);
    assert.equal(
        await fs.stat(
            path.join(appRoot, 'dist', 'assets', 'example-result.jpg'),
        ).then((stat) => stat.isFile()),
        true,
    );
});
