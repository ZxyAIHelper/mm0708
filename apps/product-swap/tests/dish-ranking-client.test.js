'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    fallbackRanking,
    normalizeRanking,
    requestDishRankingDraft,
    TIER_ORDER,
} = require('../dish-ranking-client');

const dishes = [
    {
        image: 'data:image/png;base64,AA==',
        owned: true,
        source: 'user',
    },
    {
        image: 'data:image/png;base64,AQ==',
        owned: false,
        source: 'user',
    },
    {
        image: 'data:image/png;base64,Ag==',
        owned: false,
        source: 'library',
    },
];

test('posts the dishes once to the ranking-only endpoint', async () => {
    const calls = [];
    const draft = {
        version: 1,
        items: [{
            refId: 'dish-0',
            tier: 'top',
            order: 0,
            comment: '闭眼冲',
        }],
    };
    const result = await requestDishRankingDraft(dishes, {
        apiJson: async (path, init) => {
            calls.push({ path, init });
            return { success: true, draft };
        },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, '/api/product-swap/dish-ranking-draft');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
        templateId: 'dish-ranking-guide',
        dishes: dishes.map((dish, index) => ({
            id: `dish-${index}`,
            image: dish.image,
            owned: dish.owned,
            source: dish.source,
        })),
    });
    assert.deepEqual(result, draft);
});

test('rejects a malformed ranking envelope', async () => {
    await assert.rejects(
        requestDishRankingDraft(dishes, {
            apiJson: async () => ({
                success: true,
                draft: { version: 2, items: [] },
            }),
        }),
        /评价结构无效/,
    );
});

test('forces every owned dish to the front of the top tier', () => {
    const input = [
        dishes[0],
        { ...dishes[1], owned: true },
        dishes[2],
    ];
    const result = normalizeRanking(input, {
        version: 1,
        items: [
            {
                refId: 'dish-0',
                tier: 'poor',
                order: 9,
                comment: '一般般',
            },
            {
                refId: 'dish-1',
                tier: 'average',
                order: 2,
                comment: '还可以',
            },
            {
                refId: 'dish-2',
                tier: 'top',
                order: 0,
                comment: '挺惊喜',
            },
        ],
    });

    assert.deepEqual(result.items.map((item) => item.refId), [
        'dish-0',
        'dish-1',
        'dish-2',
    ]);
    assert.deepEqual(result.items.map((item) => item.tier), [
        'top',
        'top',
        'top',
    ]);
});

test('ignores invalid AI items and completes every input exactly once', () => {
    const result = normalizeRanking(dishes, {
        version: 1,
        items: [
            {
                refId: 'dish-1',
                tier: 'poor',
                order: 1,
                comment: '一般般',
            },
            {
                refId: 'dish-1',
                tier: 'great',
                order: 0,
                comment: '重复项',
            },
            {
                refId: 'dish-9',
                tier: 'good',
                order: 0,
                comment: '不存在',
            },
            {
                refId: 'dish-2',
                tier: 'bad',
                order: 0,
                comment: '非法档',
            },
        ],
    });

    assert.equal(result.items.length, 3);
    assert.equal(new Set(result.items.map((item) => item.refId)).size, 3);
    assert.equal(result.items[0].refId, 'dish-0');
    assert.equal(result.items[0].tier, 'top');
    assert.equal(
        result.items.find((item) => item.refId === 'dish-1').tier,
        'poor',
    );
});

test('uses stable non-top distribution and comments without AI', () => {
    const first = fallbackRanking(dishes);
    const second = fallbackRanking(dishes);

    assert.deepEqual(first, second);
    assert.deepEqual(first.items.map((item) => item.refId), [
        'dish-0',
        'dish-1',
        'dish-2',
    ]);
    assert.equal(first.items[0].tier, 'top');
    assert.deepEqual(
        first.items.slice(1).map((item) => item.tier),
        ['great', 'good'],
    );
    assert.ok(first.items.every((item) => (
        /^[\p{Script=Han}]{2,6}$/u.test(item.comment)
    )));
});

test('exports the stable five-tier display order', () => {
    assert.deepEqual(TIER_ORDER, [
        'top',
        'great',
        'good',
        'average',
        'poor',
    ]);
});
