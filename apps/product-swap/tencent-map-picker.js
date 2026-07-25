'use strict';

(function (global) {
    const PICKER_ORIGIN = 'https://apis.map.qq.com';
    const DEFAULT_API_BASE = 'https://api.mm0708.top';

    function cleanText(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function validCoordinates(lat, lng) {
        return Number.isFinite(lat)
            && Number.isFinite(lng)
            && lat >= 3.5
            && lat <= 53.6
            && lng >= 73.5
            && lng <= 135.1;
    }

    function normalizePickerMessage(event) {
        if (
            event?.origin !== PICKER_ORIGIN
            || event?.data?.module !== 'locationPicker'
        ) {
            return null;
        }
        const name = cleanText(event.data.poiname);
        const address = cleanText(event.data.poiaddress);
        const lat = Number(event.data.latlng?.lat);
        const lng = Number(event.data.latlng?.lng);
        if (!name || !address || !validCoordinates(lat, lng)) {
            return null;
        }
        return {
            id: 'store-location',
            name,
            address,
            city: cleanText(event.data.cityname),
            lat,
            lng,
        };
    }

    function buildPickerUrl(config) {
        const key = cleanText(config?.key);
        const referer = cleanText(config?.referer);
        if (!key || !referer) {
            throw new Error('腾讯地图配置无效');
        }
        const url = new URL('/tools/locpicker', PICKER_ORIGIN);
        url.searchParams.set('search', '1');
        url.searchParams.set('type', '1');
        url.searchParams.set('key', key);
        url.searchParams.set('referer', referer);
        return url.toString();
    }

    async function getMapConfig({
        apiJson = global.ProductSwapApi?.apiJson,
    } = {}) {
        if (typeof apiJson !== 'function') {
            throw new Error('地图配置接口不可用');
        }
        const data = await apiJson('/api/product-swap/map-config');
        const key = cleanText(data?.key);
        const referer = cleanText(data?.referer);
        if (!data?.success || !key || !referer) {
            throw new Error('腾讯地图配置无效');
        }
        return { key, referer };
    }

    function mapPreviewUrl(
        location,
        apiBase = global.API_BASE_URL || DEFAULT_API_BASE,
    ) {
        const lat = Number(location?.lat);
        const lng = Number(location?.lng);
        if (!validCoordinates(lat, lng)) {
            throw new Error('地图坐标无效');
        }
        const url = new URL(
            '/api/product-swap/map-preview',
            String(apiBase).replace(/\/+$/, ''),
        );
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lng', String(lng));
        url.searchParams.set('v', '2');
        return url.toString();
    }

    const api = {
        PICKER_ORIGIN,
        buildPickerUrl,
        getMapConfig,
        mapPreviewUrl,
        normalizePickerMessage,
        validCoordinates,
    };
    global.TencentMapPicker = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
