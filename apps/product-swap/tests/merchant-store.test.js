const test = require('node:test');
const assert = require('node:assert/strict');
const { createMerchantStore, normalizeProduct, normalizeShop } = require('../merchant-store');

function memoryStorage() {
    const values = new Map();
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
    };
}

test('normalizes shop and product text', () => {
    assert.deepEqual(
        normalizeShop({
            name: ' 山野咖啡 ',
            industry: ' 咖啡 ',
            slogan: ' 认真做咖啡 ',
        }),
        { name: '山野咖啡', industry: '咖啡', slogan: '认真做咖啡' },
    );
    assert.deepEqual(
        normalizeProduct({
            id: ' p1 ',
            name: ' 冰拿铁 ',
            sellingPoint: ' 清爽 ',
            price: ' 18 ',
        }),
        { id: 'p1', name: '冰拿铁', sellingPoint: '清爽', price: '18' },
    );
});

test('saves a merchant profile and lists newest products first', () => {
    const store = createMerchantStore(memoryStorage());
    store.saveShop({
        name: ' 山野咖啡 ',
        industry: ' 咖啡 ',
        slogan: ' 认真做咖啡 ',
    });
    store.saveProduct({ id: 'p1', name: ' 冰拿铁 ', price: ' 18 ' });
    store.saveProduct({ id: 'p2', name: ' 巴斯克 ', price: ' 28 ' });

    assert.equal(store.loadProfile().shop.name, '山野咖啡');
    assert.deepEqual(store.listProducts().map((product) => product.id), ['p2', 'p1']);
});
