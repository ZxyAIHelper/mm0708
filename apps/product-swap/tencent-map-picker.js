'use strict';

(function (global) {
    const PICKER_ORIGIN = 'https://apis.map.qq.com';
    const DEFAULT_API_BASE = 'https://api.mm0708.top';
    const mapPreviewImageCache = new Map();

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

    function normalizeSearchResults(value) {
        if (!value?.success || !Array.isArray(value.locations)) {
            throw new Error('腾讯地点搜索结果无效');
        }
        return value.locations.slice(0, 12).flatMap((item) => {
            const sourceId = cleanText(item?.id);
            const name = cleanText(item?.name);
            const address = cleanText(item?.address);
            const city = cleanText(item?.city);
            const lat = Number(item?.lat);
            const lng = Number(item?.lng);
            if (
                !sourceId
                || !name
                || !address
                || !validCoordinates(lat, lng)
            ) {
                return [];
            }
            return [{
                id: 'store-location',
                sourceId,
                name,
                address,
                city,
                lat,
                lng,
                fallback: item?.fallback === true,
            }];
        });
    }

    async function searchLocations({
        region,
        keyword,
        apiJson = global.ProductSwapApi?.apiJson,
    } = {}) {
        const cleanRegion = cleanText(region);
        const cleanKeyword = cleanText(keyword);
        if (!cleanRegion || cleanRegion.length > 40) {
            throw new Error('请填写有效的城市或区域');
        }
        if (!cleanKeyword || cleanKeyword.length > 40) {
            throw new Error('请填写有效的店铺或地点名称');
        }
        if (typeof apiJson !== 'function') {
            throw new Error('地点搜索接口不可用');
        }
        const query = new URLSearchParams({
            region: cleanRegion,
            keyword: cleanKeyword,
        });
        const data = await apiJson(
            `/api/product-swap/location-search?${query.toString()}`,
        );
        return normalizeSearchResults(data);
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

    function loadMapPreviewImage(
        location,
        {
            apiBase = global.API_BASE_URL || DEFAULT_API_BASE,
            imageFactory = () => new Image(),
        } = {},
    ) {
        const source = mapPreviewUrl(location, apiBase);
        if (mapPreviewImageCache.has(source)) {
            return mapPreviewImageCache.get(source);
        }
        const promise = new Promise((resolve) => {
            const image = imageFactory();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.crossOrigin = 'anonymous';
            image.src = source;
        });
        mapPreviewImageCache.set(source, promise);
        return promise;
    }

    const api = {
        PICKER_ORIGIN,
        buildPickerUrl,
        getMapConfig,
        loadMapPreviewImage,
        mapPreviewUrl,
        normalizePickerMessage,
        normalizeSearchResults,
        searchLocations,
        validCoordinates,
    };
    global.TencentMapPicker = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
