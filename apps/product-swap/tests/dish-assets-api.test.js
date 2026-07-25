'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createProductSwapServer } = require('../server/dev-server');

async function withServer(callback) {
    const server = createProductSwapServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
        await callback(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test('serves filtered dish assets from the local API', async () => {
    await withServer(async (origin) => {
        const response = await fetch(
            `${origin}/api/dish-assets?limit=3&tags=${encodeURIComponent('甜品')}&random=true`,
        );
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.ok(body.items.length <= 3);
        assert.equal(body.total, body.items.length);
        assert.ok(body.items.every((item) => item.tags.includes('甜品')));
    });
});

test('rejects invalid resource api parameters', async () => {
    await withServer(async (origin) => {
        const response = await fetch(`${origin}/api/dish-assets?limit=nope`);
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.success, false);
        assert.equal(body.error.code, 'INVALID_INPUT');
    });
});

