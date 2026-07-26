const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildPickerUrl,
    getMapConfig,
    mapPreviewUrl,
    normalizePickerMessage,
    normalizeSearchResults,
    searchLocations,
} = require('../tencent-map-picker');

const pickerEvent = {
    origin: 'https://apis.map.qq.com',
    data: {
        module: 'locationPicker',
        poiname: '颐和园',
        poiaddress: '北京市海淀区新建宫门路19号',
        cityname: '北京市',
        latlng: { lat: 39.998766, lng: 116.273938 },
    },
};

test('normalizes a trusted Tencent location picker message', () => {
    assert.deepEqual(normalizePickerMessage(pickerEvent), {
        id: 'store-location',
        name: '颐和园',
        address: '北京市海淀区新建宫门路19号',
        city: '北京市',
        lat: 39.998766,
        lng: 116.273938,
    });
});

test('rejects untrusted picker origins and malformed locations', () => {
    assert.equal(normalizePickerMessage({
        ...pickerEvent,
        origin: 'https://example.com',
    }), null);
    assert.equal(normalizePickerMessage({
        ...pickerEvent,
        data: { ...pickerEvent.data, module: 'other' },
    }), null);
    assert.equal(normalizePickerMessage({
        ...pickerEvent,
        data: { ...pickerEvent.data, poiname: '' },
    }), null);
    assert.equal(normalizePickerMessage({
        ...pickerEvent,
        data: {
            ...pickerEvent.data,
            latlng: { lat: 90, lng: 116 },
        },
    }), null);
});

test('builds encoded picker and preview urls', () => {
    const picker = new URL(buildPickerUrl({
        key: 'map key',
        referer: 'product swap',
    }));
    assert.equal(picker.origin, 'https://apis.map.qq.com');
    assert.equal(picker.searchParams.get('search'), '1');
    assert.equal(picker.searchParams.get('type'), '1');
    assert.equal(picker.searchParams.get('key'), 'map key');
    assert.equal(picker.searchParams.get('referer'), 'product swap');

    const preview = new URL(mapPreviewUrl(
        normalizePickerMessage(pickerEvent),
        'https://api.mm0708.top',
    ));
    assert.equal(
        preview.pathname,
        '/api/product-swap/map-preview',
    );
    assert.equal(preview.searchParams.get('lat'), '39.998766');
    assert.equal(preview.searchParams.get('lng'), '116.273938');
    assert.equal(preview.searchParams.get('v'), '2');
});

test('loads picker configuration through the shared api client', async () => {
    const calls = [];
    const config = await getMapConfig({
        apiJson: async (path) => {
            calls.push(path);
            return {
                success: true,
                key: 'map-key',
                referer: 'product-swap',
            };
        },
    });
    assert.deepEqual(calls, ['/api/product-swap/map-config']);
    assert.deepEqual(config, {
        key: 'map-key',
        referer: 'product-swap',
    });
});

test('searches and normalizes real Tencent locations through the shared api', async () => {
    const calls = [];
    const locations = await searchLocations({
        region: ' 北京 ',
        keyword: ' 颐和园 ',
        apiJson: async (path) => {
            calls.push(path);
            return {
                success: true,
                locations: [{
                    id: 'poi-1',
                    name: '颐和园',
                    address: '新建宫门路19号',
                    city: '北京市',
                    lat: 39.998766,
                    lng: 116.273938,
                    tel: 'must-be-removed',
                }, {
                    id: 'bad',
                    name: '无效',
                    address: '无效',
                    city: '',
                    lat: 90,
                    lng: 116,
                }],
            };
        },
    });

    assert.equal(calls.length, 1);
    const request = new URL(calls[0], 'https://api.mm0708.top');
    assert.equal(request.pathname, '/api/product-swap/location-search');
    assert.equal(request.searchParams.get('region'), '北京');
    assert.equal(request.searchParams.get('keyword'), '颐和园');
    assert.deepEqual(locations, [{
        id: 'store-location',
        sourceId: 'poi-1',
        name: '颐和园',
        address: '新建宫门路19号',
        city: '北京市',
        lat: 39.998766,
        lng: 116.273938,
    }]);
});

test('rejects empty search terms and malformed search responses', async () => {
    await assert.rejects(
        searchLocations({
            region: '',
            keyword: '颐和园',
            apiJson: async () => ({ success: true, locations: [] }),
        }),
        /城市|区域/,
    );
    assert.throws(
        () => normalizeSearchResults({ success: true, locations: null }),
        /地点/,
    );
});
