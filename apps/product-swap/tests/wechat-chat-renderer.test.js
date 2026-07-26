const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    DEFAULT_HEIGHT,
    DEFAULT_WIDTH,
    containSize,
    layoutChat,
    loadAvatarResources,
    loadChromeResources,
    loadLocationMap,
    paginateChat,
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
        contactName: '小林',
        messages,
        measureText: (text) => Array.from(text).length * 34,
        assets: {
            'image-1': { width: 1200, height: 900 },
            'store-location': { width: 720, height: 260 },
        },
    });

    assert.equal(layout.width, 1179);
    assert.equal(layout.height, 2556);
    assert.equal(layout.items.length, messages.length);
    assert.equal(layout.overflow, false);
    assert.ok(layout.items.every((item) => (
        item.bottom <= layout.safeBottom
    )));
    assert.equal(layout.items[0].side, 'right');
    assert.equal(layout.items[1].side, 'left');
    assert.ok(layout.items[0].height > layout.items[1].height);
    assert.ok(layout.items[2].height > layout.items[3].height);
});

test('uses the exact reference screenshot aspect ratio', () => {
    assert.equal(DEFAULT_WIDTH, 1179);
    assert.equal(DEFAULT_HEIGHT, 2556);
    assert.equal(DEFAULT_WIDTH / DEFAULT_HEIGHT, 1179 / 2556);
});

test('uses reference-sized chat geometry without stretching content', () => {
    const layout = layoutChat({
        messages: messages.slice(0, 2),
        measureText: (text) => Array.from(text).length * 42,
        assets: {
            'image-1': { width: 1200, height: 900 },
        },
    });

    assert.equal(layout.items[0].width, 650);
    assert.equal(layout.items[0].x, 335);
    assert.equal(layout.items[1].x, 194);
    assert.equal(
        layout.items[1].y,
        layout.items[0].bottom + 38,
    );
});

test('fits cropped chrome without changing its source ratio', () => {
    const fitted = containSize(115, 108, 82, 86);

    assert.ok(fitted.width <= 82);
    assert.ok(fitted.height <= 86);
    assert.equal(fitted.width / fitted.height, 115 / 108);
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

    assert.equal(portrait.width, 450);
    assert.equal(portrait.height, 650);
});

test('paginates a long conversation without splitting or reordering messages', () => {
    const longMessages = Array.from({ length: 10 }, (_, index) => ({
        id: `m${index}`,
        side: index % 2 ? 'left' : 'right',
        type: 'text',
        text: '很长的聊天内容'.repeat(10),
    }));
    const pages = paginateChat({
        width: 1080,
        height: 1920,
        messages: longMessages,
        measureText: (text) => Array.from(text).length * 34,
        assets: {},
    });

    assert.ok(pages.length > 1);
    assert.deepEqual(
        pages.flatMap((page) => page.items.map((item) => item.id)),
        longMessages.map((message) => message.id),
    );
    assert.ok(pages.every((page) => page.overflow === false));
    assert.ok(pages.every((page) => (
        page.items.every((item) => item.bottom <= page.safeBottom)
    )));
    assert.deepEqual(
        pages.map((page) => page.pageNumber),
        pages.map((_, index) => index + 1),
    );
    assert.ok(pages.every((page) => page.pageCount === pages.length));
});

test('keeps a short conversation on one page', () => {
    const pages = paginateChat({
        messages: messages.slice(-3),
        measureText: (text) => Array.from(text).length * 34,
        assets: {},
    });

    assert.equal(pages.length, 1);
    assert.equal(pages[0].pageNumber, 1);
    assert.equal(pages[0].pageCount, 1);
});

test('reserves phone status and composer chrome outside messages', () => {
    const layout = layoutChat({
        messages: messages.slice(-3),
        measureText: (text) => Array.from(text).length * 34,
        assets: {},
    });

    assert.deepEqual(layout.chrome.statusBar, {
        top: 0,
        height: 130,
    });
    assert.deepEqual(layout.chrome.header, {
        top: 0,
        height: 294,
    });
    assert.equal(layout.chrome.composer.height, 268);
    assert.equal(
        layout.chrome.composer.top,
        layout.height - layout.chrome.composer.height,
    );
    assert.ok(layout.safeBottom <= layout.chrome.composer.top - 24);
});

test('loads independent avatars and keeps a fallback when one fails', async () => {
    const calls = [];
    const resources = await loadAvatarResources({
        left: '/avatars/cat.svg',
        right: '/avatars/missing.svg',
    }, async (source) => {
        calls.push(source);
        if (source.includes('missing')) throw new Error('missing');
        return { src: source, width: 88, height: 88 };
    });

    assert.deepEqual(calls, [
        '/avatars/cat.svg',
        '/avatars/missing.svg',
    ]);
    assert.equal(resources.left.src, '/avatars/cat.svg');
    assert.equal(resources.right, undefined);
});

test('loads the cropped reference chrome assets', async () => {
    const calls = [];
    const resources = await loadChromeResources(async (source) => {
        calls.push(source);
        return { src: source };
    });

    assert.deepEqual(Object.keys(resources), [
        'status',
        'back',
        'more',
        'voice',
        'mic',
        'emoji',
        'plus',
    ]);
    assert.ok(calls.every((source) => (
        source.startsWith('/assets/chat-chrome/')
        && source.endsWith('.png')
    )));
});

test('loads a selected location through the shared map image loader', async () => {
    const image = { width: 640, height: 260 };
    let calls = 0;
    const loaded = await loadLocationMap(
        {
            location: {
                id: 'store-location',
                name: '深圳湖贝里',
                address: '深圳市罗湖区湖贝路1068号',
                city: '深圳市',
                lat: 22.546394,
                lng: 114.128133,
            },
        },
        async () => {
            calls += 1;
            return image;
        },
    );

    assert.strictEqual(loaded, image);
    assert.equal(calls, 1);
});

test('uses an honest unavailable map placeholder', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'wechat-chat-renderer.js'),
        'utf8',
    );

    assert.match(source, /地图暂不可用/);
    assert.match(
        source,
        /mapPreviewImage = global\.TencentMapPicker\?\.loadMapPreviewImage/,
    );
    assert.doesNotMatch(
        source,
        /ctx\.arc\(\s*item\.x \+ item\.width \/ 2/,
    );
});
