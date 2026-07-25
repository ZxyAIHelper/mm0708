const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const {
    createProductSwapServer,
} = require('../server/dev-server');
const { publicCatalog } = require('../server/template-registry');

const tinyPng = 'data:image/png;base64,iVBORw0KGgo=';

test('serves the app and returns an injected generated image', async (t) => {
    const server = createProductSwapServer({
        provider: async () => ({
            imageBuffer: Buffer.from('result'),
            mimeType: 'image/png',
            provider: 'fake',
        }),
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());

    const { port } = server.address();
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /今天想发什么？/);

    const response = await fetch(
        `http://127.0.0.1:${port}/api/product-swap/generate`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetImage: tinyPng }),
        },
    );
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.provider, 'fake');
    assert.match(data.imageUrl, /^data:image\/png;base64,/);
});

test('passes through an injected provider image URL', async (t) => {
    const server = createProductSwapServer({
        provider: async () => ({
            imageUrl: 'https://example.com/result.png',
            imageBuffer: Buffer.from('unused'),
            mimeType: 'image/png',
            provider: 'fake-url',
        }),
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());
    const { port } = server.address();
    const response = await fetch(
        `http://127.0.0.1:${port}/api/product-swap/generate`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetImage: tinyPng }),
        },
    );
    const data = await response.json();

    assert.equal(data.imageUrl, 'https://example.com/result.png');
});

test('returns stable validation errors', async (t) => {
    const server = createProductSwapServer({
        provider: async () => null,
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());

    const { port } = server.address();
    const response = await fetch(
        `http://127.0.0.1:${port}/api/product-swap/generate`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        },
    );
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.error.code, 'INVALID_INPUT');
});

test('rejects a nested generation while the local agent is active', async (t) => {
    let releaseProvider;
    let markStarted;
    const started = new Promise((resolve) => {
        markStarted = resolve;
    });
    const server = createProductSwapServer({
        provider: async () => {
            markStarted();
            await new Promise((resolve) => {
                releaseProvider = resolve;
            });
            return {
                imageBuffer: Buffer.from('result'),
                mimeType: 'image/png',
                provider: 'fake',
            };
        },
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());

    const { port } = server.address();
    const firstRequest = fetch(
        `http://127.0.0.1:${port}/api/product-swap/generate`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetImage: tinyPng }),
        },
    );
    await started;

    const nestedResponse = await fetch(
        `http://127.0.0.1:${port}/api/product-swap/generate`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetImage: tinyPng }),
        },
    );
    const nestedData = await nestedResponse.json();

    assert.equal(nestedResponse.status, 409);
    assert.equal(nestedData.error.code, 'AGENT_LOOP_GUARD');

    releaseProvider();
    const firstResponse = await firstRequest;
    assert.equal(firstResponse.status, 200);
});

test('rejects private application files from static GET and HEAD', async (t) => {
    const server = createProductSwapServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());

    const { port } = server.address();
    const privatePaths = [
        '/template-packs/food-copy-layout/prompt.js',
        '/server/template-registry.js',
        '/package.json',
    ];

    for (const privatePath of privatePaths) {
        for (const method of ['GET', 'HEAD']) {
            const response = await fetch(
                `http://127.0.0.1:${port}${privatePath}`,
                { method },
            );
            assert.equal(
                [403, 404].includes(response.status),
                true,
            );
        }
    }
});

test('serves the public template catalog for GET and HEAD', async (t) => {
    const server = createProductSwapServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());

    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/template-catalog.js`;
    const response = await fetch(url);
    const source = await response.text();
    const prefix = 'globalThis.__TEMPLATE_CATALOG__ = ';
    const catalog = JSON.parse(source.slice(prefix.length, -2));

    assert.equal(response.status, 200);
    assert.equal(
        response.headers.get('content-type'),
        'text/javascript; charset=utf-8',
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(source.startsWith(prefix), true);
    assert.doesNotMatch(source, /"prompt"\s*:|buildPrompt/);
    assert.deepEqual(catalog, publicCatalog());

    const headResponse = await fetch(url, { method: 'HEAD' });
    assert.equal(headResponse.status, 200);
    assert.equal(
        headResponse.headers.get('content-type'),
        'text/javascript; charset=utf-8',
    );
    assert.equal(headResponse.headers.get('cache-control'), 'no-store');
    assert.equal(await headResponse.text(), '');
});

test('serves the schema-driven creator form helper', async (t) => {
    const server = createProductSwapServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());

    const { port } = server.address();
    const response = await fetch(
        `http://127.0.0.1:${port}/creator-form.js`,
    );

    assert.equal(response.status, 200);
    assert.match(await response.text(), /global\.CreatorForm/);
});

test('returns 500 when the public template catalog cannot serialize', async (t) => {
    const recursiveCatalog = {};
    recursiveCatalog.self = recursiveCatalog;
    const server = createProductSwapServer({
        catalogProvider() {
            return recursiveCatalog;
        },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());

    const { port } = server.address();
    const response = await fetch(
        `http://127.0.0.1:${port}/template-catalog.js`,
    );

    assert.equal(response.status, 500);
    assert.equal(await response.text(), 'Internal server error');
});
