'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const {
    createProductSwapServer,
} = require('../server/dev-server');
const { listenOnSafePort } = require('./safe-port');

function respondJson(request, body, allowedOrigin, status = 200) {
    return request.respond({
        status,
        contentType: 'application/json',
        headers: {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify(body),
    });
}

function draftFor(input) {
    const references = [
        ...(input.images || []).map((image) => ({
            type: 'image_ref',
            refId: image.id,
        })),
        ...(input.location ? [{
            type: 'location_ref',
            refId: input.location.id,
        }] : []),
    ];
    const messages = [
        { type: 'text', text: `刚去了${input.storeName || '这家店'}。` },
        ...references,
        { type: 'text', text: '看着很舒服，感觉氛围也不错。' },
        { type: 'text', text: '位置挺好找的，下次一起去。' },
        { type: 'text', text: '可以呀，周末约。' },
        { type: 'text', text: '说定了。' },
    ].slice(0, 10).map((message, index) => ({
        id: `smoke-${index + 1}`,
        side: index % 2 === 0 ? 'right' : 'left',
        ...message,
    }));
    while (messages.length < 6) {
        const index = messages.length;
        messages.push({
            id: `smoke-${index + 1}`,
            side: index % 2 === 0 ? 'right' : 'left',
            type: 'text',
            text: index % 2 ? '真的不错。' : '下次再去。',
        });
    }
    return {
        version: 1,
        contactName: '小林',
        messages,
    };
}

(async () => {
    const tempDir = await fs.mkdtemp(path.join(
        os.tmpdir(),
        'wechat-chat-smoke-',
    ));
    const uploadPath = path.join(tempDir, 'store.png');
    const mapBuffer = await sharp({
        create: {
            width: 720,
            height: 260,
            channels: 3,
            background: '#d9e8dc',
        },
    }).png().toBuffer();
    await sharp({
        create: {
            width: 720,
            height: 540,
            channels: 3,
            background: '#d77852',
        },
    }).png().toFile(uploadPath);

    const server = createProductSwapServer();
    let browser;
    try {
        const address = await listenOnSafePort(server);
        const origin = `http://127.0.0.1:${address.port}`;
        browser = await puppeteer.launch({
            executablePath:
                'C:/Program Files/Google/Chrome/Application/chrome.exe',
            headless: 'new',
            args: ['--no-sandbox'],
        });
        const page = await browser.newPage();
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(String(error)));
        page.on('console', (message) => {
            if (message.type() === 'error') {
                pageErrors.push(message.text());
            }
        });
        await page.evaluateOnNewDocument((apiBase) => {
            window.API_BASE_URL = apiBase;
        }, 'https://api.mm0708.top');
        await page.setViewport({
            width: 1280,
            height: 980,
            deviceScaleFactor: 1,
        });
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const url = new URL(request.url());
            if (url.pathname === '/api/product-swap/map-config') {
                respondJson(request, {
                    success: true,
                    key: 'browser-map-key',
                    referer: 'product-swap',
                }, origin);
                return;
            }
            if (url.pathname === '/api/product-swap/map-preview') {
                request.respond({
                    status: 200,
                    contentType: 'image/png',
                    headers: {
                        'Access-Control-Allow-Origin': origin,
                    },
                    body: mapBuffer,
                });
                return;
            }
            if (
                request.method() === 'POST'
                && url.pathname === '/api/product-swap/chat-draft'
            ) {
                const input = JSON.parse(request.postData());
                respondJson(request, {
                    success: true,
                    draft: draftFor(input),
                    provider: 'browser-smoke',
                    requestId: 'chat_browser_smoke',
                }, origin);
                return;
            }
            request.continue();
        });

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tempDir,
        });
        await page.goto(
            `${origin}/create.html?template=wechat-chat-screenshot`,
            { waitUntil: 'networkidle0' },
        );
        await page.type('.chat-store-name', '三山山');
        await page.evaluate(() => {
            window.dispatchEvent(new MessageEvent('message', {
                origin: 'https://apis.map.qq.com',
                data: {
                    module: 'locationPicker',
                    poiname: '颐和园',
                    poiaddress: '北京市海淀区新建宫门路19号',
                    cityname: '北京市',
                    latlng: {
                        lat: 39.998766,
                        lng: 116.273938,
                    },
                },
            }));
        });
        const input = await page.$('.chat-image-input');
        await input.uploadFile(uploadPath);
        await page.waitForFunction(() => (
            document.querySelectorAll('.chat-image-card').length === 1
        ));
        await page.click('.chat-generate-button');
        await page.waitForFunction(() => (
            document.querySelectorAll('.chat-edit-message').length >= 6
            && !document.querySelector('.chat-generate-button').disabled
        ), { timeout: 10000 });

        const firstText = await page.$('.chat-edit-text');
        await firstText.click({ clickCount: 3 });
        await firstText.type('这家真的挺舒服。');
        await firstText.evaluate((node) => node.dispatchEvent(
            new Event('change', { bubbles: true }),
        ));
        await page.click('.chat-edit-controls button');
        const messageCount = await page.$$eval(
            '.chat-edit-message',
            (items) => items.length,
        );
        await page.click(
            `.chat-edit-message:nth-child(${messageCount}) `
            + '.chat-edit-controls button:last-child',
        );
        await page.waitForFunction((count) => (
            document.querySelectorAll('.chat-edit-message').length
                === count - 1
        ), {}, messageCount);

        await page.screenshot({
            path: path.join(tempDir, 'creator.png'),
            fullPage: true,
        });
        await page.click('.chat-download-button');
        let pngPath = '';
        for (let attempt = 0; attempt < 50; attempt += 1) {
            const files = await fs.readdir(tempDir);
            pngPath = files
                .map((file) => path.join(tempDir, file))
                .find((file) => (
                    path.basename(file).startsWith('微信聊天截图-')
                    && file.endsWith('.png')
                    && !file.endsWith('.crdownload')
                )) || '';
            if (pngPath) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(pngPath, 'PNG download completes');
        const signature = await fs.readFile(pngPath)
            .then((buffer) => [...buffer.subarray(0, 8)]);
        assert.deepEqual(signature, [
            0x89, 0x50, 0x4e, 0x47,
            0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        const stableExportPath = path.join(tempDir, 'exported.png');
        await fs.copyFile(pngPath, stableExportPath);
        const state = await page.evaluate(() => ({
            title: document.getElementById('creatorTitle').textContent,
            location: document.querySelector(
                '.chat-location-summary strong',
            )?.textContent,
            images: document.querySelectorAll('.chat-image-card').length,
            messages: document.querySelectorAll(
                '.chat-edit-message',
            ).length,
            oldGenerateHidden: getComputedStyle(
                document.getElementById('generateButton'),
            ).display === 'none',
            canvas: {
                width: document.querySelector(
                    '.chat-preview-canvas',
                ).width,
                height: document.querySelector(
                    '.chat-preview-canvas',
                ).height,
            },
        }));
        assert.deepEqual(state, {
            title: '微信聊天截图',
            location: '颐和园',
            images: 1,
            messages: messageCount - 1,
            oldGenerateHidden: true,
            canvas: { width: 1080, height: 1920 },
        });
        assert.deepEqual(pageErrors, []);
        console.log(JSON.stringify({
            state,
            screenshot: path.join(tempDir, 'creator.png'),
            png: stableExportPath,
        }, null, 2));
    } finally {
        await browser?.close();
        await new Promise((resolve) => server.close(resolve));
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
