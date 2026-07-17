const test = require('node:test');
const assert = require('node:assert/strict');

const {
    resolveApiBase,
    apiFetch,
    apiJson,
    ensureSession,
    assetUrl,
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
});

test('shares a stable browser session header from local storage', async () => {
    const values = new Map();
    const storage = {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
    };
    const headers = [];
    const fetchImpl = async (_url, init) => {
        headers.push(new Headers(init.headers).get('X-Browser-Session'));
        return new Response('{}');
    };

    await apiFetch('/first', {}, { fetchImpl, storage });
    await apiFetch('/second', {}, { fetchImpl, storage });

    assert.match(headers[0], /^[A-Za-z0-9_-]{43}$/);
    assert.equal(headers[1], headers[0]);
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

test('bootstraps a session and builds protected asset paths', async () => {
    let path;
    const session = await ensureSession('', {
        fetchImpl: async (url) => {
            path = url;
            return new Response(JSON.stringify({ userId: 'anon_1' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        },
    });

    assert.equal(path, '/api/tasks/session');
    assert.equal(session.userId, 'anon_1');
    assert.equal(
        assetUrl('', 'task_1', 'asset_1'),
        '/api/tasks/task_1/assets/asset_1',
    );
});
