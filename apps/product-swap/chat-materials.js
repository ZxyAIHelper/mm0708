'use strict';

(function (global) {
    const LIMITS = Object.freeze({
        storeName: 60,
        requirements: 200,
        images: 3,
    });

    function cleanText(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function normalizeImages(value) {
        if (!Array.isArray(value)) return [];
        return value.map((image, index) => ({
            id: cleanText(image?.id) || `image-${index + 1}`,
            dataUrl: cleanText(image?.dataUrl),
        })).filter((image) => image.dataUrl);
    }

    function normalizeLocation(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return null;
        }
        const lat = Number(value.lat);
        const lng = Number(value.lng);
        const name = cleanText(value.name);
        const address = cleanText(value.address);
        if (
            !name
            || !address
            || !Number.isFinite(lat)
            || !Number.isFinite(lng)
        ) {
            return null;
        }
        return {
            id: 'store-location',
            name,
            address,
            city: cleanText(value.city),
            lat,
            lng,
        };
    }

    function normalizeChatMaterials(value = {}) {
        return {
            storeName: cleanText(value?.storeName),
            images: normalizeImages(value?.images),
            location: normalizeLocation(value?.location),
            requirements: cleanText(value?.requirements),
        };
    }

    function validateChatMaterials(value) {
        const materials = normalizeChatMaterials(value);
        if (
            !materials.storeName
            && materials.images.length === 0
            && !materials.location
        ) {
            return {
                field: 'chatSource',
                message: '请至少填写店铺名称、上传图片或选择地点',
            };
        }
        if (materials.storeName.length > LIMITS.storeName) {
            return {
                field: 'chatSource',
                message: `店铺名称不能超过 ${LIMITS.storeName} 字`,
            };
        }
        if (materials.images.length > LIMITS.images) {
            return {
                field: 'chatSource',
                message: `店铺图片不能超过 ${LIMITS.images} 张`,
            };
        }
        if (materials.requirements.length > LIMITS.requirements) {
            return {
                field: 'chatSource',
                message: `补充要求不能超过 ${LIMITS.requirements} 字`,
            };
        }
        return null;
    }

    const api = {
        LIMITS,
        normalizeChatMaterials,
        normalizeImages,
        normalizeLocation,
        validateChatMaterials,
    };
    global.ChatMaterials = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
