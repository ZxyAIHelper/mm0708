'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    parseDishAssetQuery,
    queryDishAssets,
    validateCatalog,
} = require('../dish-assets/library');

const appRoot = path.resolve(__dirname, '..');

test('validates the checked-in dish catalog and asset files', () => {
    const catalog = validateCatalog(require('../dish-assets/catalog.json'));
    assert.ok(catalog.length >= 18);
    for (const item of catalog) {
        const file = path.join(appRoot, item.url.replace(/^\//, ''));
        assert.ok(fs.statSync(file).size < 120 * 1024);
    }
});

test('filters by any tag and caps results at twelve', () => {
    const catalog = validateCatalog([
        {
            id: 'sweet',
            name: '甜品',
            tags: ['甜品'],
            width: 480,
            height: 480,
            url: '/assets/dish-library/sweet.webp',
        },
        {
            id: 'staple',
            name: '主食',
            tags: ['主食'],
            width: 480,
            height: 480,
            url: '/assets/dish-library/staple.webp',
        },
    ]);
    const items = queryDishAssets(catalog, {
        tags: ['甜品'],
        limit: 99,
        random: false,
    });
    assert.deepEqual(items.map((item) => item.id), ['sweet']);
});

test('parses bounded query parameters and rejects invalid limits', () => {
    assert.deepEqual(
        parseDishAssetQuery(new URL('https://x.test/?limit=3&tags=甜品,主食&random=true')),
        { limit: 3, tags: ['甜品', '主食'], random: true },
    );
    assert.throws(
        () => parseDishAssetQuery(new URL('https://x.test/?limit=nope')),
        /limit/,
    );
});

test('rejects unsafe catalog urls', () => {
    assert.throws(() => validateCatalog([{
        id: 'bad',
        name: 'bad',
        tags: ['菜品'],
        width: 480,
        height: 480,
        url: 'https://evil.example/a.webp',
    }]), /dish-library/);
});

