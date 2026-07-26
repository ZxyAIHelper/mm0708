const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeChatMaterials,
    normalizeLocation,
    validateChatMaterials,
} = require('../chat-materials');

test('normalizes store text and optional material collections', () => {
    assert.deepEqual(normalizeChatMaterials({
        storeName: '  三山山  ',
        images: [],
        location: null,
        requirements: '  像朋友聊天  ',
    }), {
        storeName: '三山山',
        images: [],
        location: null,
        requirements: '像朋友聊天',
    });
});

test('preserves a strict fallback marker on normalized locations', () => {
    const location = normalizeLocation({
        id: 'store-location',
        name: '深圳湖贝里',
        address: '深圳市罗湖区湖贝路1068号',
        city: '深圳市',
        lat: 22.546394,
        lng: 114.128133,
        fallback: true,
    });

    assert.equal(location.fallback, true);
});

test('requires at least one store material', () => {
    assert.deepEqual(validateChatMaterials({
        storeName: '',
        images: [],
        location: null,
        requirements: '',
    }), {
        field: 'chatSource',
        message: '请至少填写店铺名称、上传图片或选择地点',
    });
});

test('accepts each supported source independently', () => {
    const values = [
        { storeName: '三山山' },
        {
            images: [{
                id: 'image-1',
                dataUrl: 'data:image/png;base64,AA==',
            }],
        },
        {
            location: {
                id: 'store-location',
                name: '颐和园',
                address: '北京市海淀区新建宫门路19号',
                city: '北京市',
                lat: 39.998766,
                lng: 116.273938,
            },
        },
    ];

    for (const value of values) {
        assert.equal(validateChatMaterials(value), null);
    }
});

test('limits text and image collection sizes', () => {
    assert.match(
        validateChatMaterials({
            storeName: '店'.repeat(61),
        }).message,
        /60/,
    );
    assert.match(
        validateChatMaterials({
            images: Array.from({ length: 4 }, (_, index) => ({
                id: `image-${index + 1}`,
                dataUrl: 'data:image/png;base64,AA==',
            })),
        }).message,
        /3/,
    );
    assert.match(
        validateChatMaterials({
            storeName: '店铺',
            requirements: '想'.repeat(201),
        }).message,
        /200/,
    );
});
