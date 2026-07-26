'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    canvasSize,
    coverRect,
    layoutRanking,
    renderDishRankingDataUrl,
} = require('../dish-ranking-renderer');

const ranking = {
    version: 1,
    items: [
        {
            refId: 'dish-0',
            tier: 'top',
            order: 0,
            comment: '闭眼冲',
            owned: true,
            inputIndex: 0,
        },
        {
            refId: 'dish-1',
            tier: 'good',
            order: 0,
            comment: '挺稳的',
            owned: false,
            inputIndex: 1,
        },
    ],
};

function tierItems(count) {
    return Array.from({ length: count }, (_, index) => ({
        refId: `dish-${index}`,
        tier: 'top',
        order: index,
        comment: '闭眼冲',
        owned: index === 0,
        inputIndex: index,
    }));
}

function cardGroupCenter(cards) {
    const left = Math.min(...cards.map((card) => card.x));
    const right = Math.max(...cards.map(
        (card) => card.x + card.width,
    ));
    return (left + right) / 2;
}

function rectanglesOverlap(left, right) {
    return (
        left.x < right.x + right.width
        && left.x + left.width > right.x
        && left.y < right.y + right.height
        && left.y + left.height > right.y
    );
}

test('uses fixed pixel sizes for all supported ratios', () => {
    assert.deepEqual(canvasSize('3:4'), {
        width: 1080,
        height: 1440,
    });
    assert.deepEqual(canvasSize('1:1'), {
        width: 1080,
        height: 1080,
    });
    assert.deepEqual(canvasSize('9:16'), {
        width: 1080,
        height: 1920,
    });
    assert.deepEqual(canvasSize('unknown'), {
        width: 1080,
        height: 1440,
    });
});

test('computes centered cover cropping without distortion', () => {
    assert.deepEqual(coverRect(400, 200, 100, 100), {
        sx: 100,
        sy: 0,
        sw: 200,
        sh: 200,
    });
    assert.deepEqual(coverRect(200, 400, 100, 100), {
        sx: 0,
        sy: 100,
        sw: 200,
        sh: 200,
    });
});

test('lays out five fixed tiers with a bounded card area', () => {
    const layout = layoutRanking({ ratio: '3:4', items: ranking.items });

    assert.equal(layout.rows.length, 5);
    assert.equal(layout.labelWidth, Math.round(1080 * 0.18));
    assert.deepEqual(layout.rows.map((row) => row.label), [
        '夯',
        '顶级',
        '人上人',
        'NPC',
        '拉完了',
    ]);
    assert.deepEqual(
        layout.rows.flatMap((row) => row.cards)
            .map((card) => card.refId),
        ['dish-0', 'dish-1'],
    );
    for (const row of layout.rows) {
        for (const card of row.cards) {
            assert.ok(card.x >= layout.labelWidth);
            assert.ok(card.x + card.width <= layout.width);
            assert.ok(card.y >= row.y);
            assert.ok(card.y + card.height <= row.y + row.height);
            assert.ok(card.imageHeight < card.height);
        }
    }
});

test('keeps one to three tier cards fixed-size and centered', () => {
    const rows = [1, 2, 3].map((count) => {
        const layout = layoutRanking({
            ratio: '3:4',
            items: tierItems(count),
        });
        return { layout, row: layout.rows[0] };
    });

    assert.equal(rows[0].row.cards[0].width, rows[1].row.cards[0].width);
    assert.equal(rows[1].row.cards[0].width, rows[2].row.cards[0].width);
    assert.ok(rows[0].row.cards[0].width <= 240);
    for (const { layout, row } of rows) {
        const contentCenter = (
            layout.labelWidth + 18 + layout.width - 18
        ) / 2;
        assert.ok(
            Math.abs(cardGroupCenter(row.cards) - contentCenter) < 1,
        );
    }
});

test('wraps a dense tier into at most six columns', () => {
    for (const ratio of ['3:4', '1:1', '9:16']) {
        const row = layoutRanking({
            ratio,
            items: tierItems(12),
        }).rows[0];

        assert.equal(row.cards.length, 12);
        assert.equal(new Set(row.cards.map((card) => card.y)).size, 2);
        assert.equal(
            Math.max(...row.cards.map((card) => card.column)),
            5,
        );
        for (let left = 0; left < row.cards.length; left += 1) {
            for (
                let right = left + 1;
                right < row.cards.length;
                right += 1
            ) {
                assert.equal(
                    rectanglesOverlap(
                        row.cards[left],
                        row.cards[right],
                    ),
                    false,
                );
            }
        }
    }
});

test('draws original images and exports the same canvas as PNG', async () => {
    const calls = [];
    const context = {
        fillStyle: '',
        font: '',
        textAlign: '',
        textBaseline: '',
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        beginPath: () => calls.push(['beginPath']),
        rect: (...args) => calls.push(['rect', ...args]),
        clip: () => calls.push(['clip']),
        fillRect: (...args) => calls.push(['fillRect', ...args]),
        fillText: (...args) => calls.push([
            'fillText',
            context.font,
            ...args,
        ]),
        drawImage: (...args) => calls.push(['drawImage', ...args]),
    };
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        toDataURL: (type) => {
            assert.equal(type, 'image/png');
            return 'data:image/png;base64,rendered';
        },
    };
    const dishes = [
        { image: 'first', owned: true },
        { image: 'second', owned: false },
    ];
    const result = await renderDishRankingDataUrl({
        ratio: '3:4',
        dishes,
        ranking,
        canvas,
        imageLoader: async (source) => ({
            source,
            naturalWidth: 400,
            naturalHeight: 300,
        }),
    });

    assert.equal(result, 'data:image/png;base64,rendered');
    assert.equal(canvas.width, 1080);
    assert.equal(canvas.height, 1440);
    assert.equal(
        calls.filter((call) => call[0] === 'drawImage').length,
        2,
    );
    const labels = calls
        .filter((call) => call[0] === 'fillText')
        .map((call) => call[2]);
    assert.ok(labels.includes('夯'));
    assert.ok(labels.includes('拉完了'));
    assert.ok(labels.includes('闭眼冲'));
    assert.ok(labels.includes('自家'));
    const commentCall = calls.find((call) => (
        call[0] === 'fillText' && call[2] === '闭眼冲'
    ));
    assert.match(commentCall[1], /(?:2[6-9]|[3-9]\d)px/);
});
