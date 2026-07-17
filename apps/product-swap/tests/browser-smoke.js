const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const puppeteer = require('puppeteer-core');
const {
    createProductSwapServer,
} = require('../server/dev-server');

const appRoot = path.resolve(__dirname, '..');
const targetPath = path.join(
    appRoot,
    'assets',
    'example-template.jpg',
);
const productPath = path.join(
    appRoot,
    'assets',
    'example-product.jpg',
);
const resultPath = path.join(
    appRoot,
    'assets',
    'example-result.jpg',
);
const resultDataUrl =
    `data:image/jpeg;base64,${
        fs.readFileSync(resultPath).toString('base64')
    }`;

(async () => {
    const server = createProductSwapServer({
        provider: async () => ({
            imageBuffer: Buffer.from('unused'),
            mimeType: 'image/png',
            provider: 'browser-smoke',
        }),
    });
    server.listen(8791, '127.0.0.1');
    await once(server, 'listening');
    const browser = await puppeteer.launch({
        executablePath:
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
        headless: 'new',
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    const errors = [];
    let generationCount = 0;

    try {
        await page.setViewport({
            width: 456,
            height: 980,
            deviceScaleFactor: 1,
        });
        page.on('pageerror', (error) => {
            errors.push(String(error));
        });
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (
                request.method() === 'POST'
                && request.url().endsWith(
                    '/api/product-swap/generate',
                )
            ) {
                generationCount += 1;
                request.respond({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        imageUrl: resultDataUrl,
                        provider: 'browser-smoke',
                        requestId: 'swap_browser_smoke',
                        conversationId: 'conversation_browser_smoke',
                        assistantMessage: generationCount === 1
                            ? '已完成第一版。'
                            : '已完成新一版修正。',
                    }),
                });
                return;
            }
            request.continue();
        });

        await page.goto('http://127.0.0.1:8791/', {
            waitUntil: 'networkidle0',
            timeout: 60000,
        });
        const targetInput = await page.$('#targetInput');
        await targetInput.uploadFile(targetPath);
        await page.waitForSelector(
            '[data-slot="target"].has-preview',
        );
        const productInput = await page.$('#productInput');
        await productInput.uploadFile(productPath);
        await page.waitForSelector(
            '[data-slot="product"].has-preview',
        );
        await page.type(
            '#requirementsInput',
            '保持三个托盘的排列方式',
        );
        await page.click('#generateButton');
        await page.waitForSelector(
            '#resultSection:not([hidden])',
        );
        await page.type('#refineInput', '盘子改成白色');
        await page.click('#refineButton');
        await page.waitForFunction(() =>
            document.querySelectorAll('.chat-message').length >= 4,
        );

        const state = await page.evaluate(() => ({
            title:
                document.querySelector('h1')?.textContent || '',
            button:
                document.querySelector('#generateButton')
                    ?.textContent || '',
            width:
                document.querySelector('.product-swap-shell')
                    ?.getBoundingClientRect().width || 0,
            targetPreview:
                document.querySelector(
                    '[data-slot="target"] img',
                )?.getAttribute('src')?.startsWith('data:image/')
                || false,
            productPreview:
                document.querySelector(
                    '[data-slot="product"] img',
                )?.getAttribute('src')?.startsWith('data:image/')
                || false,
            resultVisible:
                !document.getElementById('resultSection')?.hidden,
            resultSource:
                document.getElementById('resultImage')
                    ?.getAttribute('src')
                    ?.startsWith('data:image/')
                || false,
            chatMessages:
                document.querySelectorAll('.chat-message').length,
        }));

        await page.screenshot({
            path: path.join(
                appRoot,
                'product-swap-preview.png',
            ),
            fullPage: true,
        });

        console.log(JSON.stringify({ state, errors }, null, 2));

        if (
            errors.length
            || state.title !== '一键换产品'
            || state.button !== '生成（消耗 3 豆额度）'
            || state.width > 460
            || !state.targetPreview
            || !state.productPreview
            || !state.resultVisible
            || !state.resultSource
            || state.chatMessages < 4
            || generationCount !== 2
        ) {
            process.exitCode = 1;
        }
    } finally {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
})();
