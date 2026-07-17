const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    resolveApiBase,
    apiFetch,
    apiJson,
} = require('../api-client');

test('resolves local and production API bases', () => {
    assert.equal(resolveApiBase('', 'localhost'), '');
    assert.equal(
        resolveApiBase('', 'product-swap.mm0708.top'),
        'https://api.mm0708.top',
    );
});

test('always includes browser credentials', async () => {
    let captured;
    await apiFetch('/api/tasks', { method: 'GET' }, {
        apiBase: 'https://api.example',
        fetchImpl: async (url, init) => {
            captured = { url, init };
            return new Response('{}');
        },
    });

    assert.equal(captured.url, 'https://api.example/api/tasks');
    assert.equal(captured.init.credentials, 'include');
    assert.equal(
        new Headers(captured.init.headers).get('X-Browser-Session'),
        null,
    );
});

test('does not send a remote browser identity header', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'api-client.js'),
        'utf8',
    );
    assert.doesNotMatch(source, /X-Browser-Session/);
    assert.doesNotMatch(source, /ensureSession/);
});

test('maps JSON API failures to a stable error', async () => {
    await assert.rejects(
        apiJson('/api/tasks', {}, {
            apiBase: '',
            fetchImpl: async () => new Response(JSON.stringify({
                error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            }),
        }),
        (error) => error.code === 'TASK_NOT_FOUND'
            && error.status === 404
            && error.message === '任务不存在',
    );
});

