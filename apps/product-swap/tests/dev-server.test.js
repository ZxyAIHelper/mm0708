const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { PassThrough } = require('node:stream');

const {
    createProductSwapServer,
    readJsonBody,
} = require('../server/dev-server');
const { publicCatalog } = require('../server/template-registry');
const { createZeroIdatPng } = require('./image-fixtures');

const tinyPng = [
    'data:image/png;base64,',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC',
    'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
].join('');

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

test('rejects an undecodable upload before invoking the provider', async (t) => {
    let providerCalls = 0;
    const server = createProductSwapServer({
        provider: async () => {
            providerCalls += 1;
        },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());
    const { port } = server.address();
    const invalidPng = createZeroIdatPng();

    const response = await fetch(
        `http://127.0.0.1:${port}/api/product-swap/generate`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetImage:
                    `data:image/png;base64,${invalidPng.toString('base64')}`,
            }),
        },
    );
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.error.code, 'INVALID_IMAGE');
    assert.equal(providerCalls, 0);
});

test('rejects a concurrent generation with SERVER_BUSY', async (t) => {
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
    assert.equal(nestedData.error.code, 'SERVER_BUSY');

    releaseProvider();
    const firstResponse = await firstRequest;
    assert.equal(firstResponse.status, 200);
});

test('rejects an explicitly nested agent generation', async (t) => {
    const server = createProductSwapServer({
        provider: async () => {
            throw new Error('provider must not run');
        },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());

    const { port } = server.address();
    const response = await fetch(
        `http://127.0.0.1:${port}/api/product-swap/generate`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Product-Swap-Agent-Depth': '1',
            },
            body: JSON.stringify({ targetImage: tinyPng }),
        },
    );
    const data = await response.json();

    assert.equal(response.status, 409);
    assert.equal(data.error.code, 'AGENT_LOOP_GUARD');
});

test('rejects foreign API origins before generation and preflight', async (t) => {
    let providerCalls = 0;
    const server = createProductSwapServer({
        provider: async () => {
            providerCalls += 1;
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
    const url = `http://127.0.0.1:${port}/api/product-swap/generate`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: 'https://evil.example',
        },
        body: JSON.stringify({ targetImage: tinyPng }),
    });
    const preflight = await fetch(url, {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'FORBIDDEN_ORIGIN');
    assert.equal(preflight.status, 403);
    assert.equal(providerCalls, 0);
    assert.notEqual(
        response.headers.get('access-control-allow-origin'),
        '*',
    );
});

test('allows same-origin browser generation without wildcard CORS', async (t) => {
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
    const origin = `http://127.0.0.1:${port}`;
    const response = await fetch(
        `${origin}/api/product-swap/generate`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: origin,
            },
            body: JSON.stringify({ targetImage: tinyPng }),
        },
    );

    assert.equal(response.status, 200);
    assert.equal(
        response.headers.get('access-control-allow-origin'),
        origin,
    );
});

test('readJsonBody reports request timeout and abort with stable codes', async () => {
    const timedOut = new PassThrough();
    await assert.rejects(
        () => readJsonBody(timedOut, { timeoutMs: 5 }),
        (error) => error.code === 'REQUEST_TIMEOUT',
    );

    const aborted = new PassThrough();
    const reading = readJsonBody(aborted, { timeoutMs: 100 });
    aborted.destroy(new Error('client disconnected'));
    await assert.rejects(
        () => reading,
        (error) => error.code === 'REQUEST_ABORTED',
    );
});

test('returns a flushed 408 JSON response to a real slow client', async (t) => {
    let providerCalls = 0;
    const server = createProductSwapServer({
        bodyTimeoutMs: 25,
        provider: async () => {
            providerCalls += 1;
        },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());
    const { port } = server.address();

    const result = await new Promise((resolve, reject) => {
        const request = http.request({
            host: '127.0.0.1',
            port,
            path: '/api/product-swap/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': '100',
            },
        });
        const guard = setTimeout(() => {
            request.destroy();
            reject(new Error('slow request did not receive a response'));
        }, 500);
        request.once('error', reject);
        request.once('response', (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.once('end', () => {
                clearTimeout(guard);
                resolve({
                    status: response.statusCode,
                    headers: response.headers,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            });
        });
        request.write('{');
    });

    assert.equal(result.status, 408);
    assert.equal(result.headers.connection, 'close');
    assert.equal(
        JSON.parse(result.body).error.code,
        'REQUEST_TIMEOUT',
    );
    assert.equal(providerCalls, 0);
});

test('returns a flushed 413 JSON response to a real oversized client', async (t) => {
    let providerCalls = 0;
    const server = createProductSwapServer({
        maxRequestBytes: 64,
        provider: async () => {
            providerCalls += 1;
        },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());
    const { port } = server.address();

    const result = await new Promise((resolve, reject) => {
        const request = http.request({
            host: '127.0.0.1',
            port,
            path: '/api/product-swap/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.once('end', () => resolve({
                status: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks).toString('utf8'),
            }));
        });
        request.once('error', reject);
        request.end('x'.repeat(65));
    });

    assert.equal(result.status, 413);
    assert.equal(result.headers.connection, 'close');
    assert.equal(
        JSON.parse(result.body).error.code,
        'FILE_TOO_LARGE',
    );
    assert.equal(providerCalls, 0);
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
