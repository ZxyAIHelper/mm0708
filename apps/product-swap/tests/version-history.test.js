'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createVersionHistory,
} = require('../version-history');

test('adds versions and selects the newest version', () => {
    const history = createVersionHistory();

    const first = history.add({
        imageUrl: 'https://example.com/first.png',
        instruction: '首次生成',
    });
    const second = history.add({
        imageUrl: 'https://example.com/second.png',
        instruction: '换成白色背景',
    });

    assert.equal(typeof first.createdAt, 'number');
    assert.deepEqual(history.list(), [first, second]);
    assert.deepEqual(history.current(), second);
});

test('returns copies that cannot mutate internal versions', () => {
    const input = {
        imageUrl: 'https://example.com/original.png',
        instruction: '首次生成',
    };
    const history = createVersionHistory();
    const added = history.add(input);

    input.imageUrl = 'mutated input';
    added.imageUrl = 'mutated return';
    const listed = history.list();
    listed[0].instruction = 'mutated list';
    listed.push({ imageUrl: 'extra' });
    const current = history.current();
    current.createdAt = 0;

    assert.deepEqual(history.list(), [{
        imageUrl: 'https://example.com/original.png',
        instruction: '首次生成',
        createdAt: added.createdAt,
    }]);
});

test('selects by index and returns null for invalid selections', () => {
    const history = createVersionHistory();
    history.add({ imageUrl: 'first', instruction: 'first' });
    history.add({ imageUrl: 'second', instruction: 'second' });

    assert.deepEqual(history.select(0), history.list()[0]);
    assert.deepEqual(history.current(), history.list()[0]);
    assert.equal(history.select(-1), null);
    assert.equal(history.select(2), null);
    assert.equal(history.select(0.5), null);
    assert.deepEqual(history.current(), history.list()[0]);
});

test('restores a selected version as a new latest version', () => {
    const history = createVersionHistory();
    history.add({ imageUrl: 'first', instruction: '首次生成' });
    history.add({ imageUrl: 'second', instruction: '调整背景' });

    const restored = history.restore(0);

    assert.deepEqual(restored, {
        imageUrl: 'first',
        instruction: '恢复版本 1',
        createdAt: restored.createdAt,
    });
    assert.deepEqual(history.current(), restored);
    assert.equal(history.list().length, 3);
    assert.equal(history.restore(8), null);
});

test('keeps selection stable when timestamps collide', () => {
    const originalNow = Date.now;
    Date.now = () => 1234;
    try {
        const history = createVersionHistory();
        history.add({ imageUrl: 'first', instruction: 'first' });
        history.add({ imageUrl: 'second', instruction: 'second' });

        history.select(0);

        assert.equal(history.current().imageUrl, 'first');
        assert.equal(history.list()[0].createdAt, history.list()[1].createdAt);
    } finally {
        Date.now = originalNow;
    }
});
