'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    fillerCount,
    fillDishList,
} = require('../dish-library-client');

const userDish = {
    image: 'data:image/png;base64,AA==',
    owned: true,
    source: 'user',
};

test('fills fewer than six user dishes to nine', async () => {
    const assets = Array.from({ length: 8 }, (_, index) => ({
        id: `asset-${index}`,
        url: `/assets/${index}.webp`,
    }));
    const result = await fillDishList([userDish], {
        fetchAssets: async () => assets,
        fetchImage: async (item) => `data:image/webp;base64,${item.id}`,
    });

    assert.equal(result.dishes.length, 9);
    assert.equal(result.dishes[0].source, 'user');
    assert.ok(result.dishes.slice(1).every(
        (item) => item.source === 'library' && item.owned === false,
    ));
    assert.equal(result.warning, '');
});

test('does not fetch fillers when six dishes are supplied', async () => {
    let calls = 0;
    const dishes = Array.from({ length: 6 }, () => ({ ...userDish }));
    const result = await fillDishList(dishes, {
        fetchAssets: async () => {
            calls += 1;
            return [];
        },
    });

    assert.equal(result.dishes.length, 6);
    assert.equal(calls, 0);
    assert.equal(fillerCount(dishes.length), 0);
});

test('keeps user dishes when the resource library is unavailable', async () => {
    const result = await fillDishList([userDish], {
        fetchAssets: async () => {
            throw new Error('offline');
        },
    });

    assert.deepEqual(result.dishes, [userDish]);
    assert.match(result.warning, /资源库补图失败/);
});

