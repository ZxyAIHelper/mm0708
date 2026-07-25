const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '..');

function loadProfileModule() {
    const module = { exports: {} };
    vm.runInNewContext(
        fs.readFileSync(path.join(appRoot, 'profile.js'), 'utf8'),
        {
            module,
            globalThis: {
                addEventListener() {},
            },
        },
    );
    return module.exports;
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

test('storage failures return a stable unavailable profile result', () => {
    const { loadProfileStore } = loadProfileModule();
    const factoryFailure = loadProfileStore({
        createMerchantStore() {
            throw new DOMException('Access denied', 'SecurityError');
        },
    });
    const readFailure = loadProfileStore({
        createMerchantStore() {
            return {
                loadProfile() {
                    throw new DOMException('Access denied', 'SecurityError');
                },
            };
        },
    });

    for (const result of [factoryFailure, readFailure]) {
        assert.equal(result.available, false);
        assert.equal(result.store, null);
        assert.equal(result.errorMessage, '浏览器存储不可用，请检查隐私设置后重试');
        assert.deepEqual(plain(result.profile), {
            shop: { name: '', industry: '', slogan: '' },
            products: [],
        });
    }
});

test('product IDs use randomUUID and keep fallback calls unique in one millisecond', () => {
    const { createProductId } = loadProfileModule();

    assert.equal(
        createProductId({
            crypto: { randomUUID: () => 'uuid-1' },
            Date: { now: () => 123 },
        }),
        'uuid-1',
    );

    const fixedClock = {
        crypto: {},
        Date: { now: () => 123 },
    };
    const first = createProductId(fixedClock);
    const second = createProductId(fixedClock);
    assert.notEqual(first, second);
    assert.match(first, /^product_123_/);
    assert.match(second, /^product_123_/);
});

test('shop input is trimmed and rejects a whitespace-only name', () => {
    const { normalizeShopInput } = loadProfileModule();

    assert.deepEqual(
        plain(normalizeShopInput({
            name: '   ',
            industry: ' 餐饮 ',
            slogan: ' 每天新鲜 ',
        })),
        {
            valid: false,
            shop: {
                name: '',
                industry: '餐饮',
                slogan: '每天新鲜',
            },
        },
    );
    assert.deepEqual(
        plain(normalizeShopInput({
            name: ' 山野咖啡 ',
            industry: ' 咖啡 ',
            slogan: ' 认真做好咖啡 ',
        })),
        {
            valid: true,
            shop: {
                name: '山野咖啡',
                industry: '咖啡',
                slogan: '认真做好咖啡',
            },
        },
    );
});

test('shop save rejects blank names without writing and stabilizes write errors', () => {
    const { saveShopProfile } = loadProfileModule();
    let saves = 0;
    const blank = saveShopProfile(
        {
            saveShop() {
                saves += 1;
            },
        },
        { name: '   ', industry: ' 餐饮 ', slogan: ' 每天新鲜 ' },
    );

    assert.equal(saves, 0);
    assert.deepEqual(plain(blank), {
        ok: false,
        validationError: true,
        message: '店铺名称不能为空',
    });

    const unavailable = saveShopProfile(
        {
            saveShop() {
                throw new DOMException('Access denied', 'SecurityError');
            },
        },
        { name: '山野咖啡' },
    );
    assert.deepEqual(plain(unavailable), {
        ok: false,
        validationError: false,
        message: '浏览器存储不可用，请检查隐私设置后重试',
    });
});

test('product save rejects blank names and trims valid products before writing', () => {
    const { saveProductProfile } = loadProfileModule();
    const saved = [];
    const store = {
        saveProduct(product) {
            saved.push(product);
            return product;
        },
    };
    const scope = {
        crypto: { randomUUID: () => 'product-1' },
    };

    const blank = saveProductProfile(
        store,
        { name: '   ', sellingPoint: ' 清爽 ', price: ' 18 ' },
        scope,
    );
    assert.equal(saved.length, 0);
    assert.deepEqual(plain(blank), {
        ok: false,
        validationError: true,
        message: '产品名称不能为空',
        product: null,
    });

    const valid = saveProductProfile(
        store,
        { name: ' 冰拿铁 ', sellingPoint: ' 清爽 ', price: ' 18 ' },
        scope,
    );
    assert.deepEqual(plain(saved), [{
        id: 'product-1',
        name: '冰拿铁',
        sellingPoint: '清爽',
        price: '18',
    }]);
    assert.deepEqual(plain(valid), {
        ok: true,
        validationError: false,
        message: '产品已添加',
        product: {
            id: 'product-1',
            name: '冰拿铁',
            sellingPoint: '清爽',
            price: '18',
        },
    });
});

test('product save maps storage write failures to the stable error', () => {
    const { saveProductProfile } = loadProfileModule();
    const result = saveProductProfile(
        {
            saveProduct() {
                throw new DOMException('Access denied', 'SecurityError');
            },
        },
        { name: '冰拿铁' },
        { crypto: { randomUUID: () => 'product-1' } },
    );

    assert.deepEqual(plain(result), {
        ok: false,
        validationError: false,
        message: '浏览器存储不可用，请检查隐私设置后重试',
        product: null,
    });
});
