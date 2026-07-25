(function (globalScope) {
    function boot() {
        const store = globalScope.MerchantStore.createMerchantStore();
        const profile = store.loadProfile();
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

        shopName.value = profile.shop.name;
        shopIndustry.value = profile.shop.industry;
        shopSlogan.value = profile.shop.slogan;

        function showNotice(message, isError = false) {
            profileNotice.textContent = message;
            profileNotice.hidden = !message;
            profileNotice.classList.toggle('is-error', isError);
        }

        function renderProducts() {
            const products = store.listProducts();
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

        shopForm.addEventListener('submit', (event) => {
            event.preventDefault();
            try {
                store.saveShop({
                    name: shopName.value,
                    industry: shopIndustry.value,
                    slogan: shopSlogan.value,
                });
                showNotice('店铺资料已保存');
            } catch (error) {
                showNotice(error.message, true);
            }
        });

        productForm.addEventListener('submit', (event) => {
            event.preventDefault();
            try {
                store.saveProduct({
                    id: globalScope.crypto?.randomUUID
                        ? globalScope.crypto.randomUUID()
                        : `product_${Date.now()}`,
                    name: productName.value,
                    sellingPoint: productSellingPoint.value,
                    price: productPrice.value,
                });
                productForm.reset();
                showNotice('产品已添加');
                renderProducts();
            } catch (error) {
                showNotice(error.message, true);
            }
        });

        renderProducts();
    }

    globalScope.addEventListener('DOMContentLoaded', boot);
}(globalThis));
