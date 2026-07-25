const test = require('node:test');
const assert = require('node:assert/strict');

const {
    layoutChat,
    wrapMessageText,
} = require('../wechat-chat-renderer');

const messages = [
    { id: 'm1', side: 'right', type: 'image_ref', refId: 'image-1' },
    { id: 'm2', side: 'left', type: 'text', text: '看着就很好吃，环境也挺舒服。' },
    { id: 'm3', side: 'right', type: 'location_ref', refId: 'store-location' },
    { id: 'm4', side: 'left', type: 'text', text: '位置很好找，下次带我一起去。' },
    { id: 'm5', side: 'right', type: 'text', text: '可以呀，周末去。' },
    { id: 'm6', side: 'left', type: 'text', text: '说定了。' },
];

test('wraps Chinese and long latin words within the measured width', () => {
    const measure = (text) => Array.from(text).length * 10;
    assert.deepEqual(
        wrapMessageText('这是一段中文消息', 40, measure),
        ['这是一段', '中文消息'],
    );
    assert.deepEqual(
        wrapMessageText('abcdefghij', 40, measure),
        ['abcd', 'efgh', 'ij'],
    );
});

test('lays out text, image, and location messages inside the canvas', () => {
    const layout = layoutChat({
        width: 1080,
        height: 1920,
        contactName: '小林',
        messages,
        measureText: (text) => Array.from(text).length * 34,
        assets: {
            'image-1': { width: 1200, height: 900 },
            'store-location': { width: 720, height: 260 },
        },
    });

    assert.equal(layout.width, 1080);
    assert.equal(layout.height, 1920);
    assert.equal(layout.items.length, messages.length);
    assert.equal(layout.overflow, false);
    assert.ok(layout.items.every((item) => item.bottom <= 1760));
    assert.equal(layout.items[0].side, 'right');
    assert.equal(layout.items[1].side, 'left');
    assert.ok(layout.items[0].height > layout.items[1].height);
    assert.ok(layout.items[2].height > layout.items[3].height);
});

test('preserves image aspect ratio within safe bounds', () => {
    const portrait = layoutChat({
        width: 1080,
        height: 1920,
        messages: [{
            id: 'm1',
            side: 'right',
            type: 'image_ref',
            refId: 'image-1',
        }],
        measureText: () => 20,
        assets: {
            'image-1': { width: 600, height: 1200 },
        },
    }).items[0];

    assert.equal(portrait.width, 360);
    assert.equal(portrait.height, 520);
});

test('marks a long conversation as overflowing instead of shrinking text', () => {
    const layout = layoutChat({
        width: 1080,
        height: 1920,
        messages: Array.from({ length: 10 }, (_, index) => ({
            id: `m${index}`,
            side: index % 2 ? 'left' : 'right',
            type: 'text',
            text: '很长的聊天内容'.repeat(10),
        })),
        measureText: (text) => Array.from(text).length * 34,
        assets: {},
    });

    assert.equal(layout.overflow, true);
    assert.ok(layout.items.at(-1).bottom > 1760);
});
