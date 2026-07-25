(function (global) {
    'use strict';

    function fillerCount(count) {
        return count < 6 ? Math.max(0, 9 - count) : 0;
    }

    function blobAsDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(reader.result));
            reader.addEventListener('error', () => reject(
                new Error('资源图片读取失败'),
            ));
            reader.readAsDataURL(blob);
        });
    }

    async function fetchDishAssets(limit, fetchImpl = global.fetch) {
        const response = await fetchImpl(
            `/api/dish-assets?limit=${limit}&random=true`,
            { credentials: 'same-origin' },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success || !Array.isArray(body.items)) {
            throw new Error(body?.error?.message || '资源库不可用');
        }
        return body.items;
    }

    async function fetchImageAsDataUrl(
        item,
        fetchImpl = global.fetch,
    ) {
        const response = await fetchImpl(item.url, {
            credentials: 'same-origin',
        });
        if (!response.ok) throw new Error('资源图片下载失败');
        return blobAsDataUrl(await response.blob());
    }

    async function fillDishList(
        dishes,
        {
            fetchAssets = fetchDishAssets,
            fetchImage = fetchImageAsDataUrl,
        } = {},
    ) {
        const original = dishes.map((dish) => ({ ...dish }));
        const needed = fillerCount(original.length);
        if (!needed) return { dishes: original, warning: '' };
        try {
            const assets = await fetchAssets(needed);
            const fillers = [];
            for (const item of assets.slice(0, needed)) {
                fillers.push({
                    image: await fetchImage(item),
                    owned: false,
                    source: 'library',
                });
            }
            return {
                dishes: [...original, ...fillers],
                warning: '',
            };
        } catch {
            return {
                dishes: original,
                warning: '资源库补图失败，已使用当前上传菜品继续生成',
            };
        }
    }

    const api = {
        fetchDishAssets,
        fetchImageAsDataUrl,
        fillerCount,
        fillDishList,
    };
    global.DishLibraryClient = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
