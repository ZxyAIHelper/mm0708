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
const resultBuffer = fs.readFileSync(path.join(
    appRoot,
    'assets',
    'example-result.jpg',
));
function jsonResponse(request, body, status = 200) {
    request.respond({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
}

function attachPageErrorListeners(page, errors, label) {
    page.on('pageerror', (error) => {
        errors.push(`${label} pageerror: ${String(error)}`);
    });
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(`${label} console.error: ${message.text()}`);
        }
    });
    page.on('requestfailed', (request) => {
        const requestUrl = request.url();
        if (
            requestUrl.startsWith('data:')
            || requestUrl.startsWith('blob:')
        ) {
            return;
        }
        errors.push(
            `${label} request failed: ${request.method()} ${requestUrl}`
            + ` (${request.failure()?.errorText || 'unknown'})`,
        );
    });
    page.on('response', (response) => {
        if (response.status() >= 400) {
            errors.push(
                `${label} unexpected HTTP ${response.status()}: `
                + `${response.request().method()} ${response.url()}`,
            );
        }
    });
}

(async () => {
    let appUrl = '';
    let generationCount = 0;
    const server = createProductSwapServer({
        provider: async () => {
            generationCount += 1;
            if (generationCount === 1) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
            return {
                imageBuffer: resultBuffer,
                mimeType: 'image/jpeg',
                provider: 'browser-smoke',
                assistantMessage: generationCount === 1
                    ? '已完成第一版。'
                    : '已完成新一版修正。',
            };
        },
    });
    let browser;
    let page;
    let restrictedPage;
    const errors = [];

    try {
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const address = server.address();
        appUrl = `http://127.0.0.1:${address.port}`;
        browser = await puppeteer.launch({
            executablePath:
                'C:/Program Files/Google/Chrome/Application/chrome.exe',
            headless: 'new',
            args: ['--no-sandbox'],
        });
        page = await browser.newPage();
        await page.setViewport({
            width: 456,
            height: 980,
            deviceScaleFactor: 1,
        });
        attachPageErrorListeners(page, errors, 'main');
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
        await page.waitForSelector('#templateGrid .template-card');
        const liveTemplateSelector =
            'a[href="/create.html?template=product-swap"]';
        const homeState = await page.evaluate(() => ({
            title: document.querySelector('h1')?.textContent || '',
            liveHref: document.querySelector(
                'a[href="/create.html?template=product-swap"]',
            )?.getAttribute('href') || '',
            navItems: document.querySelectorAll('.bottom-nav a').length,
            comingSoon: document.querySelectorAll(
                '#templateGrid article.template-card[aria-disabled="true"]',
            ).length,
            comingSoonCreatorHrefs: Array.from(document.querySelectorAll(
                '#templateGrid article.template-card[aria-disabled="true"]',
            )).filter((card) => (
                card.hasAttribute('href')
                || card.querySelector('a[href*="/create.html"]')
            )).length,
            creatorHrefs: document.querySelectorAll(
                '#templateGrid a[href*="/create.html"]',
            ).length,
        }));
        await Promise.all([
            page.waitForNavigation({
                waitUntil: 'networkidle0',
                timeout: 60000,
            }),
            page.click(liveTemplateSelector),
        ]);
        homeState.creatorUrl = page.url();
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
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.click('#generateButton');
        await page.waitForFunction(() =>
            Boolean(sessionStorage.getItem('product_swap_active_task_id')),
        );
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() =>
            document.getElementById('generateButton')?.disabled
            || !document.getElementById('resultSection')?.hidden,
        );
        await page.waitForSelector('#resultSection:not([hidden])');
        const initialGenerationCount = generationCount;
        const refinementBefore = await page.evaluate(async () => {
            const { tasks } = await window.LocalTaskHistory.listTasks();
            return {
                chatMessages: document.querySelectorAll('.chat-message').length,
                taskCount: tasks.length,
                completedTasks: tasks.filter(
                    (task) => task.status === 'completed',
                ).length,
            };
        });
        await page.type('#refineInput', '盘子改成白色');
        await page.click('#refineButton');
        await page.waitForFunction(async (before) => {
            const { tasks } = await window.LocalTaskHistory.listTasks();
            const completedTasks = tasks.filter(
                (task) => task.status === 'completed',
            ).length;
            return (
                !sessionStorage.getItem('product_swap_active_task_id')
                && document.querySelectorAll('.chat-message').length
                    > before.chatMessages
                && tasks.length > before.taskCount
                && completedTasks > before.completedTasks
            );
        }, { timeout: 60000 }, refinementBefore);

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
                ?.getAttribute('src')?.startsWith('data:image/jpeg') || false,
            chatMessages: document.querySelectorAll('.chat-message').length,
            formError: document.getElementById('formError')?.textContent || '',
            activeTaskCleared: !sessionStorage.getItem(
                'product_swap_active_task_id',
            ),
        }));
        state.taskStatuses = await page.evaluate(async () => {
            const { tasks } = await window.LocalTaskHistory.listTasks();
            return tasks.map((task) => ({
                status: task.status,
                errorCode: task.errorCode,
                errorMessage: task.errorMessage,
            }));
        });
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
        historyState.outputUrlAfterCleanup = await page.evaluate(async () => {
            const { tasks } = await window.LocalTaskHistory.listTasks();
            const completed = tasks.find((task) => task.status === 'completed');
            const detail = await window.LocalTaskHistory.getTask(completed.id);
            return detail.result.imageUrl;
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForFunction(() =>
            document.querySelectorAll('.task-card .asset-expired')
                .length === 2,
        );
        historyState.expiredAfterCleanup = await page.evaluate(() =>
            document.querySelectorAll('.task-card .asset-expired').length,
        );
        historyState.deletedTaskId = await page.$eval(
            '.task-card .danger-button',
            (button) => button.closest('.task-card')?.dataset.taskId || '',
        );
        await page.click('.task-card .danger-button');
        await page.waitForFunction(() =>
            document.querySelectorAll('.task-card').length === 1,
        );
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForFunction(() =>
            document.querySelectorAll('.task-card').length === 1,
        );
        historyState.persistedDelete = await page.evaluate(
            async (deletedTaskId) => {
                const { tasks } = await window.LocalTaskHistory.listTasks();
                return {
                    cards: document.querySelectorAll('.task-card').length,
                    tasks: tasks.length,
                    deletedAbsent: !tasks.some(
                        (task) => task.id === deletedTaskId,
                    ),
                };
            },
            historyState.deletedTaskId,
        );
        historyState.recoveredTask = await page.evaluate(async () => {
            const task = await window.LocalTaskHistory.startTask({
                taskType: 'product_swap',
                input: { requirements: 'interrupted test' },
            });
            await window.LocalTaskHistory.recoverInterruptedTasks(
                Date.now() + window.LocalTaskHistory.PROCESSING_STALE_MS,
            );
            const recovered = await window.LocalTaskHistory.getTask(task.id);
            return {
                status: recovered.status,
                errorCode: recovered.errorCode,
            };
        });
        historyState.filterTaskIds = await page.evaluate(async () => {
            const processing = await window.LocalTaskHistory.startTask({
                taskType: 'product_swap',
                input: { requirements: 'processing filter test' },
            });
            const failed = await window.LocalTaskHistory.startTask({
                taskType: 'product_swap',
                input: { requirements: 'failed filter test' },
            });
            await window.LocalTaskHistory.failTask(
                failed.id,
                'SMOKE_FILTER_FAILED',
                'filter test failure',
            );
            return {
                processing: processing.id,
                failed: failed.id,
            };
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForFunction(() =>
            document.querySelectorAll('.task-card').length === 4,
        );
        historyState.statusFilters = [];
        for (const status of ['processing', 'completed', 'failed']) {
            const expectedIds = await page.evaluate(async (filterStatus) => {
                const { tasks } = await window.LocalTaskHistory.listTasks({
                    status: filterStatus,
                    limit: 30,
                });
                return tasks.map((task) => task.id).sort();
            }, status);
            await page.click(
                `#workStatusFilters button[data-status="${status}"]`,
            );
            await page.waitForFunction(
                ({ filterStatus, ids }) => {
                    const cards = Array.from(
                        document.querySelectorAll('.task-card'),
                    );
                    const active = document.querySelector(
                        `#workStatusFilters button[data-status="${filterStatus}"]`,
                    );
                    return (
                        cards.length === ids.length
                        && active?.classList.contains('active')
                        && active?.getAttribute('aria-pressed') === 'true'
                        && cards.every((card) => (
                            ids.includes(card.dataset.taskId)
                            && card.querySelector('.task-status')
                                ?.classList.contains(`status-${filterStatus}`)
                        ))
                    );
                },
                { timeout: 60000 },
                { filterStatus: status, ids: expectedIds },
            );
            historyState.statusFilters.push(await page.evaluate(
                async ({ filterStatus, ids }) => {
                    const { tasks } = await window.LocalTaskHistory.listTasks({
                        status: filterStatus,
                        limit: 30,
                    });
                    const repoIds = tasks.map((task) => task.id).sort();
                    const cards = Array.from(
                        document.querySelectorAll('.task-card'),
                    );
                    const cardIds = cards.map(
                        (card) => card.dataset.taskId,
                    ).sort();
                    return {
                        status: filterStatus,
                        repoCount: tasks.length,
                        cardCount: cards.length,
                        repoOnlyStatus: tasks.every(
                            (task) => task.status === filterStatus,
                        ),
                        cardsOnlyStatus: cards.every((card) => (
                            card.querySelector('.task-status')
                                ?.classList.contains(`status-${filterStatus}`)
                        )),
                        idsMatch:
                            JSON.stringify(repoIds) === JSON.stringify(ids)
                            && JSON.stringify(cardIds)
                                === JSON.stringify(repoIds),
                    };
                },
                { filterStatus: status, ids: expectedIds },
            ));
        }
        const allTaskCount = await page.evaluate(async () => {
            const { tasks } = await window.LocalTaskHistory.listTasks({
                limit: 30,
            });
            return tasks.length;
        });
        await page.click('#workStatusFilters button[data-status=""]');
        await page.waitForFunction(
            (expectedCount) =>
                document.querySelectorAll('.task-card').length
                    === expectedCount,
            { timeout: 60000 },
            allTaskCount,
        );
        historyState.restoredCards = await page.evaluate(() =>
            document.querySelectorAll('.task-card').length,
        );
        await page.evaluate(
            (taskId) => window.LocalTaskHistory.failTask(
                taskId,
                'SMOKE_FILTER_CLEANUP',
                'processing filter test complete',
            ),
            historyState.filterTaskIds.processing,
        );

        await Promise.all([
            page.waitForNavigation({
                waitUntil: 'networkidle0',
                timeout: 60000,
            }),
            page.click('.bottom-nav a[href="/profile.html"]'),
        ]);
        await page.type('#shopName', '山野咖啡');
        await page.type('#shopIndustry', '咖啡');
        await page.type('#shopSlogan', '认真做咖啡');
        await page.click('#shopForm button[type="submit"]');
        await page.waitForFunction(() =>
            document.getElementById('profileNotice')?.textContent
                === '店铺资料已保存',
        );
        await page.type('#productName', '冰拿铁');
        await page.type('#productSellingPoint', '清爽');
        await page.type('#productPrice', '18');
        await page.click('#productForm button[type="submit"]');
        await page.waitForFunction(() => (
            document.getElementById('profileNotice')?.textContent
                === '产品已添加'
            && document.querySelectorAll('.product-row').length === 1
        ));
        await page.reload({ waitUntil: 'networkidle0' });
        const profileState = await page.evaluate(() => ({
            title: document.querySelector('h1')?.textContent || '',
            shopName: document.getElementById('shopName')?.value || '',
            shopIndustry:
                document.getElementById('shopIndustry')?.value || '',
            shopSlogan: document.getElementById('shopSlogan')?.value || '',
            products: Array.from(document.querySelectorAll('.product-row'))
                .map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
        }));

        const restrictedErrorStart = errors.length;
        restrictedPage = await browser.newPage();
        attachPageErrorListeners(
            restrictedPage,
            errors,
            'restricted-profile',
        );
        await restrictedPage.evaluateOnNewDocument(() => {
            Object.defineProperty(window, 'localStorage', {
                configurable: true,
                get() {
                    throw new DOMException(
                        'Storage access is blocked',
                        'SecurityError',
                    );
                },
            });
        });
        await restrictedPage.goto(`${appUrl}/profile.html`, {
            waitUntil: 'networkidle0',
            timeout: 60000,
        });
        await restrictedPage.waitForFunction(() =>
            !document.getElementById('profileNotice')?.hidden,
        );
        const restrictedProfileState = await restrictedPage.evaluate(() => ({
            notice:
                document.getElementById('profileNotice')?.textContent || '',
            disabledSubmits: document.querySelectorAll(
                'form button[type="submit"]:disabled',
            ).length,
        }));
        restrictedProfileState.errorDelta =
            errors.length - restrictedErrorStart;
        await restrictedPage.close();
        restrictedPage = null;

        const responsiveState = [];
        const responsivePages = [
            {
                name: 'home',
                path: '/',
                action:
                    '#templateGrid '
                    + 'a[href="/create.html?template=product-swap"]',
            },
            {
                name: 'creator',
                path: '/create.html?template=product-swap',
                action: '#generateButton',
            },
            {
                name: 'history',
                path: '/history.html',
                action: '.task-card .task-card-actions button',
            },
            {
                name: 'profile',
                path: '/profile.html',
                action: '#productForm button[type="submit"]',
            },
        ];
        for (const width of [360, 390, 430]) {
            await page.setViewport({
                width,
                height: 980,
                deviceScaleFactor: 1,
            });
            for (const responsivePage of responsivePages) {
                await page.goto(`${appUrl}${responsivePage.path}`, {
                    waitUntil: 'networkidle0',
                    timeout: 60000,
                });
                if (responsivePage.name === 'home') {
                    await page.waitForSelector(
                        '#templateGrid .template-card',
                    );
                }
                if (responsivePage.name === 'creator') {
                    const responsiveTarget = await page.$('#targetInput');
                    await responsiveTarget.uploadFile(targetPath);
                    await page.waitForSelector(
                        '[data-slot="target"].has-preview',
                    );
                }
                if (responsivePage.name === 'history') {
                    await page.waitForSelector('.task-card');
                }
                responsiveState.push(await page.evaluate(
                    async ({ name, actionSelector, viewportWidth }) => {
                        const action = document.querySelector(actionSelector);
                        action.scrollIntoView({
                            block: 'end',
                            inline: 'nearest',
                        });
                        await new Promise((resolve) =>
                            requestAnimationFrame(() =>
                                requestAnimationFrame(resolve),
                            ),
                        );
                        const documentElement = document.documentElement;
                        const nav = document.querySelector('.bottom-nav');
                        const actionRect = action.getBoundingClientRect();
                        const navRect = nav.getBoundingClientRect();
                        const pointX = Math.min(
                            window.innerWidth - 1,
                            Math.max(
                                0,
                                actionRect.left + actionRect.width / 2,
                            ),
                        );
                        const pointY = Math.min(
                            window.innerHeight - 1,
                            Math.max(
                                0,
                                actionRect.top + actionRect.height / 2,
                            ),
                        );
                        const hit = document.elementFromPoint(pointX, pointY);
                        const shell = document.querySelector(
                            '.product-swap-shell',
                        );
                        const preview = document.querySelector(
                            '[data-slot="target"] img',
                        );
                        const previewSlot = document.querySelector(
                            '[data-slot="target"]',
                        );
                        const filters = document.querySelector(
                            '#workStatusFilters',
                        );
                        const saveButtons = Array.from(
                            document.querySelectorAll(
                                '.settings-card button[type="submit"]',
                            ),
                        );
                        const shellRect = shell?.getBoundingClientRect();
                        const previewRect = preview?.getBoundingClientRect();
                        const previewSlotRect =
                            previewSlot?.getBoundingClientRect();
                        const filterStyle = filters
                            ? getComputedStyle(filters)
                            : null;
                        return {
                            name,
                            width: viewportWidth,
                            noPageOverflow:
                                documentElement.scrollWidth
                                    <= documentElement.clientWidth + 1,
                            actionAboveNav:
                                actionRect.bottom <= navRect.top + 1,
                            actionHit:
                                hit === action || action.contains(hit),
                            creatorShellFits: !shellRect
                                || shellRect.width <= 460,
                            previewFits: !previewRect || (
                                previewRect.left
                                    >= previewSlotRect.left - 1
                                && previewRect.right
                                    <= previewSlotRect.right + 1
                                && previewRect.right
                                    <= documentElement.clientWidth + 1
                            ),
                            filtersFit: !filters || (
                                filters.scrollWidth
                                    <= filters.clientWidth + 1
                                || ['auto', 'scroll'].includes(
                                    filterStyle.overflowX,
                                )
                            ),
                            profileButtonsFit: !saveButtons.length
                                || saveButtons.every(
                                    (button) =>
                                        button.getBoundingClientRect().height
                                            >= 48,
                                ),
                        };
                    },
                    {
                        name: responsivePage.name,
                        actionSelector: responsivePage.action,
                        viewportWidth: width,
                    },
                ));
            }
        }

        console.log(JSON.stringify({
            homeState,
            state,
            historyState,
            profileState,
            restrictedProfileState,
            responsiveState,
            errors,
        }, null, 2));

        if (
            errors.length
            || homeState.title !== '今天想发什么？'
            || homeState.liveHref
                !== '/create.html?template=product-swap'
            || homeState.navItems !== 4
            || homeState.comingSoon !== 3
            || homeState.comingSoonCreatorHrefs !== 0
            || homeState.creatorHrefs !== 1
            || homeState.creatorUrl
                !== `${appUrl}/create.html?template=product-swap`
            || state.title !== '爆款场景同款图'
            || state.button !== '生成 1 张场景图（消耗 3 豆额度）'
            || state.width > 460
            || !state.targetPreview
            || !state.productPreview
            || !state.resultVisible
            || !state.resultSource
            || state.chatMessages < 4
            || state.chatMessages <= refinementBefore.chatMessages
            || state.formError.trim() !== ''
            || !state.activeTaskCleared
            || state.taskStatuses.length <= refinementBefore.taskCount
            || state.taskStatuses.some((task) => task.status !== 'completed')
            || initialGenerationCount !== 1
            || generationCount !== initialGenerationCount + 1
            || historyState.title !== '作品'
            || historyState.cards !== 2
            || historyState.expired !== 2
            || historyState.expiredAfterCleanup !== 2
            || historyState.detailAssets !== 4
            || historyState.outputUrlAfterCleanup !== ''
            || !historyState.deletedTaskId
            || historyState.persistedDelete.cards !== 1
            || historyState.persistedDelete.tasks !== 1
            || !historyState.persistedDelete.deletedAbsent
            || historyState.recoveredTask.status !== 'failed'
            || historyState.recoveredTask.errorCode
                !== 'GENERATION_INTERRUPTED'
            || !historyState.filterTaskIds.processing
            || !historyState.filterTaskIds.failed
            || historyState.statusFilters.length !== 3
            || historyState.statusFilters.some((filter) => (
                filter.repoCount < 1
                || filter.cardCount !== filter.repoCount
                || !filter.repoOnlyStatus
                || !filter.cardsOnlyStatus
                || !filter.idsMatch
            ))
            || historyState.restoredCards !== allTaskCount
            || profileState.title !== '我的店铺'
            || profileState.shopName !== '山野咖啡'
            || profileState.shopIndustry !== '咖啡'
            || profileState.shopSlogan !== '认真做咖啡'
            || profileState.products.length !== 1
            || !profileState.products[0].includes('冰拿铁')
            || !profileState.products[0].includes('清爽')
            || !profileState.products[0].includes('18')
            || restrictedProfileState.notice
                !== '浏览器存储不可用，请检查隐私设置后重试'
            || restrictedProfileState.disabledSubmits !== 2
            || restrictedProfileState.errorDelta !== 0
            || responsiveState.length !== 12
            || responsiveState.some((responsive) => (
                !responsive.noPageOverflow
                || !responsive.actionAboveNav
                || !responsive.actionHit
                || !responsive.creatorShellFits
                || !responsive.previewFits
                || !responsive.filtersFit
                || !responsive.profileButtonsFit
            ))
        ) {
            process.exitCode = 1;
        }
    } finally {
        if (restrictedPage && !restrictedPage.isClosed()) {
            await restrictedPage.close();
        }
        if (browser) {
            await browser.close();
        }
        if (server.listening) {
            await new Promise((resolve) => server.close(resolve));
        }
    }
})();
