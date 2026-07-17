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
const resultBuffer = fs.readFileSync(resultPath);
const resultDataUrl =
    `data:image/jpeg;base64,${resultBuffer.toString('base64')}`;

function jsonResponse(request, body, status = 200) {
    request.respond({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
}

(async () => {
    const server = createProductSwapServer({
        provider: async () => ({
            imageBuffer: Buffer.from('unused'),
            mimeType: 'image/png',
            provider: 'browser-smoke',
        }),
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    const appUrl = `http://127.0.0.1:${address.port}`;
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
        page.on('dialog', (dialog) => dialog.accept());
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const requestUrl = new URL(request.url());

            if (requestUrl.pathname.startsWith('/api/tasks')) {
                errors.push(`unexpected remote task request: ${requestUrl}`);
                jsonResponse(request, { error: 'not available' }, 404);
                return;
            }

            if (
                request.method() === 'POST'
                && requestUrl.pathname === '/api/tasks/session'
            ) {
                jsonResponse(request, { userId: 'anon_browser_smoke' });
                return;
            }
            if (
                request.method() === 'POST'
                && requestUrl.pathname === '/api/product-swap/generate'
            ) {
                generationCount += 1;
                jsonResponse(request, {
                    success: true,
                    imageUrl: resultDataUrl,
                    provider: 'browser-smoke',
                    requestId: 'swap_browser_smoke',
                    conversationId: 'conversation_browser_smoke',
                    assistantMessage: generationCount === 1
                        ? '已完成第一版。'
                        : '已完成新一版修正。',
                    taskId: generationCount === 1
                        ? 'task_smoke'
                        : 'task_refine',
                    archiveWarning: null,
                });
                return;
            }
            if (
                request.method() === 'GET'
                && requestUrl.pathname === '/api/tasks'
            ) {
                const now = Date.now();
                jsonResponse(request, {
                    success: true,
                    nextCursor: null,
                    tasks: [
                        {
                            id: 'task_smoke',
                            taskType: 'product_swap',
                            title: '一键换产品',
                            status: 'completed',
                            input: { requirements: '保持三个托盘的排列方式' },
                            result: {},
                            errorCode: null,
                            errorMessage: null,
                            createdAt: now,
                            completedAt: now,
                            previewAsset: {
                                id: 'asset_output',
                                role: 'output',
                                expiresAt: now + 86400000,
                                deletedAt: null,
                            },
                        },
                        {
                            id: 'task_expired',
                            taskType: 'product_swap',
                            title: '一键换产品',
                            status: 'completed',
                            input: { requirements: '旧任务' },
                            result: {},
                            errorCode: null,
                            errorMessage: null,
                            createdAt: now - 86400000,
                            completedAt: now - 86400000,
                            previewAsset: {
                                id: 'asset_expired',
                                role: 'output',
                                expiresAt: now - 1,
                                deletedAt: now,
                            },
                        },
                    ],
                });
                return;
            }
            if (
                request.method() === 'GET'
                && requestUrl.pathname === '/api/tasks/task_smoke'
            ) {
                const now = Date.now();
                jsonResponse(request, {
                    success: true,
                    task: {
                        id: 'task_smoke',
                        taskType: 'product_swap',
                        title: '一键换产品',
                        status: 'completed',
                        input: { requirements: '保持三个托盘的排列方式' },
                        result: {},
                        errorCode: null,
                        errorMessage: null,
                        createdAt: now,
                        completedAt: now,
                        assets: [
                            {
                                id: 'asset_target',
                                role: 'target',
                                expiresAt: now + 86400000,
                                deletedAt: null,
                            },
                            {
                                id: 'asset_product',
                                role: 'product',
                                expiresAt: now + 86400000,
                                deletedAt: null,
                            },
                            {
                                id: 'asset_output',
                                role: 'output',
                                expiresAt: now + 86400000,
                                deletedAt: null,
                            },
                        ],
                    },
                });
                return;
            }
            if (
                request.method() === 'GET'
                && /\/api\/tasks\/task_smoke\/assets\//.test(
                    requestUrl.pathname,
                )
            ) {
                request.respond({
                    status: 200,
                    contentType: 'image/jpeg',
                    body: resultBuffer,
                });
                return;
            }
            if (
                request.method() === 'DELETE'
                && requestUrl.pathname === '/api/tasks/task_expired'
            ) {
                jsonResponse(request, { success: true });
                return;
            }
            request.continue();
        });

        await page.goto(`${appUrl}/`, {
            waitUntil: 'networkidle0',
            timeout: 60000,
        });
        const targetInput = await page.$('#targetInput');
        await targetInput.uploadFile(targetPath);
        await page.waitForSelector('[data-slot="target"].has-preview');
        const productInput = await page.$('#productInput');
        await productInput.uploadFile(productPath);
        await page.waitForSelector('[data-slot="product"].has-preview');
        await page.type(
            '#requirementsInput',
            '保持三个托盘的排列方式',
        );
        await page.click('#generateButton');
        await page.waitForSelector('#resultSection:not([hidden])');
        await page.type('#refineInput', '盘子改成白色');
        await page.click('#refineButton');
        await page.waitForFunction(() =>
            document.querySelectorAll('.chat-message').length >= 4,
        );

        const state = await page.evaluate(() => ({
            title: document.querySelector('h1')?.textContent || '',
            button: document.querySelector('#generateButton')
                ?.textContent || '',
            width: document.querySelector('.product-swap-shell')
                ?.getBoundingClientRect().width || 0,
            targetPreview: document.querySelector(
                '[data-slot="target"] img',
            )?.getAttribute('src')?.startsWith('data:image/') || false,
            productPreview: document.querySelector(
                '[data-slot="product"] img',
            )?.getAttribute('src')?.startsWith('data:image/') || false,
            resultVisible: !document.getElementById('resultSection')?.hidden,
            resultSource: document.getElementById('resultImage')
                ?.getAttribute('src')?.startsWith('data:image/') || false,
            chatMessages: document.querySelectorAll('.chat-message').length,
        }));

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.click('#historyLink'),
        ]);
        await page.waitForFunction(() =>
            document.querySelectorAll('.task-card').length === 2,
        );
        await page.click('.task-card .task-card-actions button');
        await page.waitForSelector('#taskDetailLayer:not([hidden])');
        await page.waitForFunction(() =>
            document.querySelectorAll(
                '#taskDetailContent .detail-asset img:not([hidden])',
            ).length === 4,
        );
        const historyState = await page.evaluate(() => ({
            title: document.querySelector('.history-heading h1')
                ?.textContent || '',
            cards: document.querySelectorAll('.task-card').length,
            expired: document.querySelectorAll(
                '.task-card .asset-expired',
            ).length,
            detailAssets: document.querySelectorAll(
                '#taskDetailContent .detail-asset',
            ).length,
        }));
        await page.click('#taskDetailClose');
        await page.evaluate(() => window.LocalTaskHistory
            .cleanupExpiredAssets(
                Date.now() + 31 * 24 * 60 * 60 * 1000,
            ));
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForFunction(() =>
            document.querySelectorAll('.task-card .asset-expired')
                .length === 2,
        );
        historyState.expiredAfterCleanup = await page.evaluate(() =>
            document.querySelectorAll('.task-card .asset-expired').length,
        );
        await page.click('.task-card .danger-button');
        await page.waitForFunction(() =>
            document.querySelectorAll('.task-card').length === 1,
        );

        console.log(JSON.stringify({ state, historyState, errors }, null, 2));

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
            || historyState.title !== '所有任务'
            || historyState.cards !== 2
            || historyState.expired !== 0
            || historyState.expiredAfterCleanup !== 2
            || historyState.detailAssets !== 4
        ) {
            process.exitCode = 1;
        }
    } finally {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
})();
