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
    const uploadPath = path.join(
        os.tmpdir(),
        `dish-ranking-smoke-${process.pid}.png`,
    );
    const secondUploadPath = path.join(
        os.tmpdir(),
        `dish-ranking-smoke-${process.pid}-2.png`,
    );
    await sharp({
        create: {
            width: 640,
            height: 640,
            channels: 3,
            background: '#c8653d',
        },
    }).png().toFile(uploadPath);
    await fs.copyFile(uploadPath, secondUploadPath);

    let providerInput = null;
    const server = createProductSwapServer({
        provider: async (input) => {
            providerInput = input;
            return {
                imageBuffer: await sharp({
                    create: {
                        width: 600,
                        height: 800,
                        channels: 3,
                        background: '#8f3029',
                    },
                }).png().toBuffer(),
                mimeType: 'image/png',
                provider: 'dish-ranking-smoke',
                assistantMessage: '测评攻略图已完成。',
            };
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
        await page.evaluateOnNewDocument((apiBase) => {
            window.API_BASE_URL = apiBase;
        }, origin);
        await page.setViewport({
            width: 456,
            height: 980,
            deviceScaleFactor: 1,
        });
        await page.goto(
            `${origin}/create.html?template=dish-ranking-guide`,
            { waitUntil: 'networkidle0' },
        );
        const input = await page.$(
            '[data-field-key="dishes"] input[type="file"]',
        );
        await input.uploadFile(uploadPath, secondUploadPath);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const uploadState = await page.evaluate(() => ({
            files: document.querySelector(
                '[data-field-key="dishes"] input[type="file"]',
            ).files.length,
            cards: document.querySelectorAll('.dish-card').length,
            error: document.getElementById('formError').textContent,
        }));
        assert.deepEqual(uploadState, {
            files: 0,
            cards: 2,
            error: '',
        });
        await page.click('.dish-owned-toggle');
        const beforeSubmit = await page.evaluate(() => ({
            url: location.href,
            hasGenerate: Boolean(document.getElementById('generateButton')),
            owned: document.querySelectorAll('.dish-card.is-owned').length,
        }));
        assert.equal(beforeSubmit.hasGenerate, true);
        assert.equal(beforeSubmit.owned, 1);
        await page.evaluate(() => {
            document.getElementById('swapForm').requestSubmit();
        });
        try {
            await page.waitForFunction(() => (
                !document.getElementById('resultSection').hidden
            ), { timeout: 12000 });
        } catch (error) {
            const failureState = await page.evaluate(() => ({
                error: document.getElementById('formError').textContent,
                archive: document.getElementById('archiveNotice').textContent,
                button: document.getElementById('generateButton').textContent,
            }));
            throw new Error(
                `ranking generation timed out: ${JSON.stringify(
                    failureState,
                )}; provider=${Boolean(providerInput)}; ${error.message}`,
            );
        }

        const state = await page.evaluate(() => ({
            title: document.getElementById('creatorTitle').textContent,
            cards: document.querySelectorAll('.dish-card').length,
            owned: document.querySelectorAll('.dish-card.is-owned').length,
            status: document.querySelector('.dish-list-status').textContent,
            result: Boolean(document.getElementById('resultImage').src),
            error: document.getElementById('formError').textContent,
        }));
        assert.equal(state.title, '菜品测评攻略图');
        assert.equal(state.cards, 2);
        assert.equal(state.owned, 1);
        assert.match(state.status, /资源库补充 7 张/);
        assert.equal(state.result, true);
        assert.equal(state.error, '');
        assert.equal(providerInput.imagePaths.length, 9);
        assert.match(providerInput.prompt, /全部自家菜品放入“夯”档/);
        console.log(JSON.stringify(state, null, 2));
    } finally {
        await browser?.close();
        await new Promise((resolve) => server.close(resolve));
        await fs.rm(uploadPath, { force: true });
        await fs.rm(secondUploadPath, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
