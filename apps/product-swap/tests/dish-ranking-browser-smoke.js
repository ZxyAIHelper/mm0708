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

(async () => {
    const tempDir = await fs.mkdtemp(path.join(
        os.tmpdir(),
        `dish-ranking-smoke-${process.pid}-`,
    ));
    const uploadPath = path.join(tempDir, 'owned.png');
    const secondUploadPath = path.join(tempDir, 'other.png');
    await sharp({
        create: {
            width: 640,
            height: 640,
            channels: 3,
            background: '#c8653d',
        },
    }).png().toFile(uploadPath);
    await sharp({
        create: {
            width: 640,
            height: 640,
            channels: 3,
            background: '#4e8b65',
        },
    }).png().toFile(secondUploadPath);

    let imageGenerationRequests = 0;
    let rankingRequests = 0;
    const server = createProductSwapServer({
        provider: async () => {
            imageGenerationRequests += 1;
            throw new Error('image generation must not run');
        },
    });
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
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tempDir,
        });
        await page.evaluateOnNewDocument((apiBase) => {
            window.API_BASE_URL = apiBase;
        }, origin);
        await page.setViewport({
            width: 456,
            height: 980,
            deviceScaleFactor: 1,
        });
        await page.setRequestInterception(true);
        page.on('request', async (request) => {
            const url = new URL(request.url());
            if (
                url.pathname
                === '/api/product-swap/dish-ranking-draft'
            ) {
                rankingRequests += 1;
                const body = JSON.parse(request.postData() || '{}');
                const items = body.dishes.map((dish, index) => ({
                    refId: dish.id,
                    tier: dish.owned
                        ? 'poor'
                        : ['great', 'good', 'average', 'poor'][index % 4],
                    order: index,
                    comment: dish.owned ? '一般般' : '挺稳的',
                }));
                await request.respond({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        draft: { version: 1, items },
                        provider: 'mock',
                        requestId: 'dish_rank_smoke',
                    }),
                });
                return;
            }
            if (url.pathname === '/api/product-swap/generate') {
                imageGenerationRequests += 1;
                await request.respond({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: false,
                        error: { code: 'UNEXPECTED_IMAGE_GENERATION' },
                    }),
                });
                return;
            }
            await request.continue();
        });
        await page.goto(
            `${origin}/create.html?template=dish-ranking-guide`,
            { waitUntil: 'networkidle0' },
        );
        const input = await page.$(
            '[data-field-key="dishes"] input[type="file"]',
        );
        await input.uploadFile(uploadPath, secondUploadPath);
        await page.waitForFunction(() => (
            document.querySelectorAll('.dish-card').length === 2
        ));
        await page.click('.dish-owned-toggle');
        await page.evaluate(() => {
            document.getElementById('swapForm').requestSubmit();
        });
        await page.waitForFunction(() => (
            !document.getElementById('resultSection').hidden
            && document.getElementById('resultImage').complete
            && document.getElementById('resultImage').naturalWidth > 0
        ), { timeout: 12000 });

        const state = await page.evaluate(() => {
            const result = document.getElementById('resultImage');
            return {
                title: document.getElementById('creatorTitle').textContent,
                cards: document.querySelectorAll('.dish-card').length,
                owned: document.querySelectorAll('.dish-card.is-owned').length,
                status: document.querySelector(
                    '.dish-list-status',
                ).textContent,
                resultPrefix: result.src.slice(0, 22),
                resultWidth: result.naturalWidth,
                resultHeight: result.naturalHeight,
                refinementHidden: document.querySelector(
                    '.refinement-panel',
                ).hidden,
                error: document.getElementById('formError').textContent,
            };
        });
        assert.equal(state.title, '菜品测评攻略图');
        assert.equal(state.cards, 2);
        assert.equal(state.owned, 1);
        assert.match(state.status, /资源库补充 7 张/);
        assert.equal(state.resultPrefix, 'data:image/png;base64,');
        assert.equal(state.resultWidth, 1080);
        assert.equal(state.resultHeight, 1440);
        assert.equal(state.refinementHidden, true);
        assert.equal(state.error, '');
        assert.equal(rankingRequests, 1);
        assert.equal(imageGenerationRequests, 0);

        const reviewDir = process.env.DISH_RANKING_REVIEW_DIR;
        if (reviewDir) {
            await fs.mkdir(reviewDir, { recursive: true });
            await page.screenshot({
                path: path.join(reviewDir, 'dish-ranking-page.jpg'),
                type: 'jpeg',
                quality: 72,
                fullPage: true,
            });
            const resultDataUrl = await page.$eval(
                '#resultImage',
                (image) => image.src,
            );
            await sharp(Buffer.from(
                resultDataUrl.split(',')[1],
                'base64',
            ))
                .resize({ width: 540 })
                .jpeg({ quality: 76 })
                .toFile(path.join(
                    reviewDir,
                    'dish-ranking-result.jpg',
                ));
        }

        await page.click('#downloadButton');
        let pngPath = '';
        for (let attempt = 0; attempt < 40; attempt += 1) {
            const files = await fs.readdir(tempDir);
            pngPath = files
                .map((file) => path.join(tempDir, file))
                .find((file) => (
                    file.endsWith('.png')
                    && ![uploadPath, secondUploadPath].includes(file)
                )) || '';
            if (pngPath) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(pngPath, 'expected a downloaded ranking PNG');
        const signature = await fs.readFile(pngPath)
            .then((buffer) => [...buffer.subarray(0, 8)]);
        assert.deepEqual(signature, [
            0x89, 0x50, 0x4e, 0x47,
            0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        console.log(JSON.stringify(state, null, 2));
    } finally {
        await browser?.close();
        await new Promise((resolve) => server.close(resolve));
        await fs.rm(tempDir, { recursive: true, force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
