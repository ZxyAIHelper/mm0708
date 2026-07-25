(function (globalScope) {
    const STORAGE_KEY = 'social_content_merchant_profile_v1';

    function text(value, maxLength = 120) {
        return String(value || '').trim().slice(0, maxLength);
    }

    function normalizeShop(shop = {}) {
        return {
            name: text(shop.name, 60),
            industry: text(shop.industry, 40),
            slogan: text(shop.slogan, 120),
        };
    }

    function normalizeProduct(product = {}) {
        return {
            id: text(product.id, 80),
            name: text(product.name, 80),
            sellingPoint: text(product.sellingPoint, 160),
            price: text(product.price, 40),
        };
    }

    function createMerchantStore(storage = globalScope.localStorage) {
        function read() {
            try {
                const profile = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
                return {
                    shop: normalizeShop(profile.shop),
                    products: Array.isArray(profile.products)
                        ? profile.products.map(normalizeProduct).filter((product) => product.id)
                        : [],
                };
            } catch {
                return { shop: normalizeShop(), products: [] };
            }
        }

        function write(profile) {
            storage.setItem(STORAGE_KEY, JSON.stringify(profile));
        }

        function saveShop(shop) {
            const profile = read();
            profile.shop = normalizeShop(shop);
            write(profile);
            return profile.shop;
        }

        function saveProduct(product) {
            const profile = read();
            const normalized = normalizeProduct(product);
            if (!normalized.id || !normalized.name) {
                throw new Error('产品名称不能为空');
            }
            profile.products = [
                normalized,
                ...profile.products.filter((item) => item.id !== normalized.id),
            ];
            write(profile);
            return normalized;
        }

        return {
            read,
            loadProfile: read,
            saveShop,
            saveProduct,
            listProducts() {
                return read().products;
            },
        };
    }

    const MerchantStore = {
        STORAGE_KEY,
        text,
        normalizeShop,
        normalizeProduct,
        createMerchantStore,
    };

    globalScope.MerchantStore = MerchantStore;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MerchantStore;
    }
}(globalThis));
