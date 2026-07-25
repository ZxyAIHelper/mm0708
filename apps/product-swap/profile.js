(function (globalScope) {
    const STORAGE_ERROR = '浏览器存储不可用，请检查隐私设置后重试';
    let productIdCounter = 0;

    function emptyProfile() {
        return {
            shop: { name: '', industry: '', slogan: '' },
            products: [],
        };
    }

    function loadProfileStore(merchantStore) {
        try {
            if (!merchantStore || typeof merchantStore.createMerchantStore !== 'function') {
                throw new Error('MerchantStore unavailable');
            }
            const store = merchantStore.createMerchantStore();
            const profile = store.loadProfile();
            return {
                available: true,
                store,
                profile,
                errorMessage: '',
            };
        } catch {
            return {
                available: false,
                store: null,
                profile: emptyProfile(),
                errorMessage: STORAGE_ERROR,
            };
        }
    }

    function createProductId(scope = globalScope) {
        if (typeof scope.crypto?.randomUUID === 'function') {
            return scope.crypto.randomUUID();
        }
        const clock = scope.Date && typeof scope.Date.now === 'function'
            ? scope.Date
            : Date;
        productIdCounter += 1;
        return `product_${clock.now()}_${productIdCounter}`;
    }

    function normalizeShopInput(shop = {}) {
        const normalized = {
            name: String(shop.name || '').trim(),
            industry: String(shop.industry || '').trim(),
            slogan: String(shop.slogan || '').trim(),
        };
        return {
            valid: Boolean(normalized.name),
            shop: normalized,
        };
    }

    function saveShopProfile(store, shop) {
        const normalized = normalizeShopInput(shop);
        if (!normalized.valid) {
            return {
                ok: false,
                validationError: true,
                message: '店铺名称不能为空',
            };
        }
        try {
            store.saveShop(normalized.shop);
            return {
                ok: true,
                validationError: false,
                message: '店铺资料已保存',
            };
        } catch {
            return {
                ok: false,
                validationError: false,
                message: STORAGE_ERROR,
            };
        }
    }

    function normalizeProductInput(product = {}) {
        const normalized = {
            name: String(product.name || '').trim(),
            sellingPoint: String(product.sellingPoint || '').trim(),
            price: String(product.price || '').trim(),
        };
        return {
            valid: Boolean(normalized.name),
            product: normalized,
        };
    }

    function saveProductProfile(store, product, scope = globalScope) {
        const normalized = normalizeProductInput(product);
        if (!normalized.valid) {
            return {
                ok: false,
                validationError: true,
                message: '产品名称不能为空',
                product: null,
            };
        }

        const productToSave = {
            id: createProductId(scope),
            ...normalized.product,
        };
        try {
            const saved = store.saveProduct(productToSave);
            return {
                ok: true,
                validationError: false,
                message: '产品已添加',
                product: saved || productToSave,
            };
        } catch {
            return {
                ok: false,
                validationError: false,
                message: STORAGE_ERROR,
                product: null,
            };
        }
    }

    function boot() {
        const shopForm = document.getElementById('shopForm');
        const productForm = document.getElementById('productForm');
        const shopName = document.getElementById('shopName');
        const shopIndustry = document.getElementById('shopIndustry');
        const shopSlogan = document.getElementById('shopSlogan');
        const productName = document.getElementById('productName');
        const productSellingPoint = document.getElementById('productSellingPoint');
        const productPrice = document.getElementById('productPrice');
        const productList = document.getElementById('productList');
        const profileNotice = document.getElementById('profileNotice');
        let merchantStore;

        try {
            merchantStore = globalScope.MerchantStore;
        } catch {
            merchantStore = null;
        }

        const loaded = loadProfileStore(merchantStore);
        const { profile, store } = loaded;

        function showNotice(message, isError = false) {
            profileNotice.textContent = message;
            profileNotice.hidden = !message;
            profileNotice.classList.toggle('is-error', isError);
        }

        function disableSaving() {
            shopForm.querySelector('[type="submit"]').disabled = true;
            productForm.querySelector('[type="submit"]').disabled = true;
        }

        function renderProducts(products) {
            productList.replaceChildren();

            if (!products.length) {
                const empty = document.createElement('p');
                empty.className = 'empty-card';
                empty.textContent = '还没有产品素材';
                productList.append(empty);
                return;
            }

            for (const product of products) {
                const row = document.createElement('article');
                const name = document.createElement('h3');
                const sellingPoint = document.createElement('p');
                const price = document.createElement('strong');

                row.className = 'product-row';
                name.textContent = product.name;
                sellingPoint.textContent = product.sellingPoint || '未填写卖点';
                price.textContent = product.price
                    ? `价格：${product.price}`
                    : '未填写价格';
                row.append(name, sellingPoint, price);
                productList.append(row);
            }
        }

        shopName.value = profile.shop.name;
        shopIndustry.value = profile.shop.industry;
        shopSlogan.value = profile.shop.slogan;
        let currentProducts = profile.products.slice();
        renderProducts(currentProducts);

        if (!loaded.available) {
            disableSaving();
            showNotice(loaded.errorMessage, true);
            return;
        }

        shopName.addEventListener('input', () => {
            if (shopName.value.trim()) {
                shopName.removeAttribute('aria-invalid');
            }
        });

        shopForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const result = saveShopProfile(store, {
                name: shopName.value,
                industry: shopIndustry.value,
                slogan: shopSlogan.value,
            });

            if (result.validationError) {
                shopName.setAttribute('aria-invalid', 'true');
            } else {
                shopName.removeAttribute('aria-invalid');
            }
            showNotice(result.message, !result.ok);
        });

        productName.addEventListener('input', () => {
            if (productName.value.trim()) {
                productName.removeAttribute('aria-invalid');
            }
        });

        productForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const result = saveProductProfile(store, {
                name: productName.value,
                sellingPoint: productSellingPoint.value,
                price: productPrice.value,
            }, globalScope);

            if (result.validationError) {
                productName.setAttribute('aria-invalid', 'true');
            } else {
                productName.removeAttribute('aria-invalid');
            }
            if (!result.ok) {
                showNotice(result.message, true);
                return;
            }

            currentProducts = [
                result.product,
                ...currentProducts.filter((product) => (
                    product.id !== result.product.id
                )),
            ];
            productForm.reset();
            showNotice(result.message);
            renderProducts(currentProducts);
        });
    }

    const ProfilePage = {
        STORAGE_ERROR,
        createProductId,
        loadProfileStore,
        normalizeProductInput,
        normalizeShopInput,
        saveProductProfile,
        saveShopProfile,
    };

    globalScope.ProfilePage = ProfilePage;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ProfilePage;
    }

    if (typeof globalScope.addEventListener === 'function') {
        globalScope.addEventListener('DOMContentLoaded', boot);
    }
}(globalThis));
