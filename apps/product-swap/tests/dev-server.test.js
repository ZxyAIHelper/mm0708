const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const {
    createProductSwapServer,
} = require('../server/dev-server');

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
    assert.match(await page.text(), /一键换产品/);

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
