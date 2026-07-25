const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const foodManifest = require(
    '../template-packs/food-copy-layout/manifest',
);
const productSwapManifest = require(
    '../template-packs/product-swap/manifest',
);

const root = path.resolve(__dirname, '..');
const {
    appendQuickPrompt,
    resolveApiBase,
    activeTaskStorageKey,
    taskMatchesTemplate,
    validateClientFileMeta,
    buildGeneratePayload,
    buildRefinePayload,
    historyInputFromPayload,
    createGenerationMessage,
    pollLocalTask,
    mapErrorCode,
} = require('../script');

test('page exposes the screenshot-matching controls', () => {
    const html = fs.readFileSync(
        path.join(root, 'create.html'),
        'utf8',
    );

    for (const id of [
        'templateFields',
        'formError',
        'generateButton',
        'resultImage',
        'chatTimeline',
        'refineInput',
        'refineButton',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }

    assert.match(html, /生成（消耗 3 豆额度）/);
    assert.match(html, /id="swapForm" novalidate/);
});

test('builds a bounded conversational refinement payload', () => {
    const payload = buildRefinePayload({
        target: 'target',
        product: 'product',
        scene: '',
        result: 'previous',
        conversationId: 'conversation_1',
        messages: Array.from({ length: 8 }, (_, index) => ({
            role: index % 2 ? 'assistant' : 'user',
            content: `message ${index}`,
        })),
    }, ' 盘子改成白色 ');

    assert.equal(payload.previousImage, 'previous');
    assert.equal(payload.conversationId, 'conversation_1');
    assert.equal(payload.requirements, '盘子改成白色');
    assert.equal(payload.messages.length, 6);
    assert.equal(payload.messages[0].content, 'message 2');
});

test('refinement preserves the initial template payload', () => {
    const payload = buildRefinePayload({
        templateId: 'food-copy-layout',
        targetImage: 'target',
        aspectRatio: '3:4',
        showDateTime: true,
        generatedAt: '2026-07-25T10:00:00.000Z',
        requirements: 'initial',
    }, {
        result: 'previous',
        conversationId: 'conversation_1',
        messages: [{ role: 'assistant', content: 'first result' }],
    }, ' move the text ');

    assert.deepEqual(payload, {
        templateId: 'food-copy-layout',
        targetImage: 'target',
        aspectRatio: '3:4',
        showDateTime: true,
        generatedAt: '2026-07-25T10:00:00.000Z',
        requirements: 'move the text',
        previousImage: 'previous',
        conversationId: 'conversation_1',
        messages: [{ role: 'assistant', content: 'first result' }],
    });
});

test('uses same-origin locally and the shared API in production', () => {
    assert.equal(resolveApiBase('', 'localhost'), '');
    assert.equal(resolveApiBase('', '127.0.0.1'), '');
    assert.equal(
        resolveApiBase('', 'swap.mm0708.top'),
        'https://api.mm0708.top',
    );
    assert.equal(
        resolveApiBase('https://custom.example', 'localhost'),
        'https://custom.example',
    );
});

test('validates upload metadata', () => {
    assert.equal(
        validateClientFileMeta({
            type: 'image/png',
            size: 1024,
        }),
        null,
    );
    assert.equal(
        validateClientFileMeta({
            type: 'image/gif',
            size: 1024,
        }).code,
        'UNSUPPORTED_IMAGE',
    );
    assert.equal(
        validateClientFileMeta({
            type: 'image/gif',
            size: 1024,
        }, ['image/gif']),
        null,
    );
    assert.equal(
        validateClientFileMeta({
            type: 'image/png',
            size: 1024,
        }, ['image/jpeg']).code,
        'UNSUPPORTED_IMAGE',
    );
});

test('scopes active task storage by creator template identity', () => {
    const foodKey = activeTaskStorageKey(foodManifest);
    const productKey = activeTaskStorageKey(productSwapManifest);

    assert.notEqual(foodKey, productKey);
    assert.match(foodKey, /food-copy-layout/);
    assert.match(foodKey, /food_copy_layout/);
});

test('matches restored tasks to the active template identity', () => {
    assert.equal(taskMatchesTemplate({
        taskType: 'food_copy_layout',
        input: { templateId: 'food-copy-layout' },
    }, foodManifest), true);
    assert.equal(taskMatchesTemplate({
        taskType: 'food_copy_layout',
        input: { templateId: 'other-food-template' },
    }, foodManifest), false);
    assert.equal(taskMatchesTemplate({
        taskType: 'food_copy_layout',
        input: {},
    }, foodManifest), false);
    assert.equal(taskMatchesTemplate({
        taskType: 'product_swap',
        input: {},
    }, productSwapManifest), true);
    assert.equal(taskMatchesTemplate({
        taskType: 'product_swap',
        input: { templateId: 'other-product-template' },
    }, productSwapManifest), false);
    assert.equal(taskMatchesTemplate({
        taskType: 'wrong_task',
        input: { templateId: 'food-copy-layout' },
    }, foodManifest), false);
});

test('builds the stable request and maps provider errors', () => {
    assert.deepEqual(
        buildGeneratePayload({
            target: 'target',
            product: '',
            scene: '',
            requirements: ' 保持排列 ',
        }),
        {
            targetImage: 'target',
            productImage: '',
            sceneImage: '',
            requirements: '保持排列',
        },
    );
    assert.equal(
        mapErrorCode('CODEX_TIMEOUT'),
        '生成超时，请稍后重试',
    );
});

test('generation does not initialize a remote task session', () => {
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.doesNotMatch(source, /apiClient\.ensureSession/);
    assert.doesNotMatch(source, /await sessionReady/);
});

test('root generator safely falls back without creator metadata', () => {
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.match(
        source,
        /window\.CreatorMeta\?\.resolveCreatorTemplate/,
    );
});

test('preserves the complete non-image refinement input in history', () => {
    const payload = {
        templateId: 'food-copy-layout',
        targetImage: 'data:image/png;base64,dGFyZ2V0',
        aspectRatio: '3:4',
        showDateTime: true,
        generatedAt: '2026-07-25T10:00:00.000Z',
        requirements: 'make it white',
        previousImage: 'https://example.com/previous.png',
        conversationId: 'conversation_1',
        messages: [{ role: 'user', content: 'first request' }],
    };
    const input = historyInputFromPayload(foodManifest, payload, true);

    assert.deepEqual(input, {
        templateId: 'food-copy-layout',
        aspectRatio: '3:4',
        showDateTime: true,
        generatedAt: '2026-07-25T10:00:00.000Z',
        requirements: 'make it white',
        isRefinement: true,
        conversationId: 'conversation_1',
        messages: [{ role: 'user', content: 'first request' }],
    });
    assert.equal('targetImage' in input, false);
    assert.equal('previousImage' in input, false);
});

test('history copies only safe manifest non-image primitives', () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user',
        content: `message ${index}`,
    }));
    const input = historyInputFromPayload(foodManifest, {
        templateId: foodManifest.id,
        targetImage: 'data:image/png;base64,food',
        aspectRatio: '9:16',
        showDateTime: false,
        generatedAt: '2026-07-25T10:00:00.000Z',
        requirements: 'more contrast',
        previousImage: 'https://example.com/previous.png',
        conversationId: 'conversation_2',
        messages,
        unknown: { unsafe: true },
    });

    assert.deepEqual(input, {
        templateId: 'food-copy-layout',
        aspectRatio: '9:16',
        showDateTime: false,
        requirements: 'more contrast',
        generatedAt: '2026-07-25T10:00:00.000Z',
        isRefinement: false,
        conversationId: 'conversation_2',
        messages: messages.slice(-6),
    });
    assert.equal('targetImage' in input, false);
    assert.equal('previousImage' in input, false);
    assert.equal('unknown' in input, false);
});

test('history excludes Data URLs even from non-image fields', () => {
    const input = historyInputFromPayload(foodManifest, {
        templateId: foodManifest.id,
        targetImage: 'data:image/png;base64,food',
        requirements: 'data:text/plain;base64,dGV4dA==',
    });

    assert.equal('targetImage' in input, false);
    assert.equal('requirements' in input, false);
});

test('generation binds schema fields and builds a template payload', () => {
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.match(source, /CreatorForm\.initialValues\(activeTemplate\)/);
    assert.match(source, /CreatorForm\.validateValues/);
    assert.match(source, /CreatorForm\.buildTemplatePayload/);
    assert.match(source, /activeTemplate\.fields/);
    assert.doesNotMatch(source, /getElementById\('productInput'\)/);
});

test('builds the versioned service worker generation message', () => {
    assert.deepEqual(createGenerationMessage(
        'task_local_1',
        { targetImage: 'target' },
        'https://api.mm0708.top',
        'https://product-swap.mm0708.top',
    ), {
        type: 'product-swap:start',
        version: 1,
        taskId: 'task_local_1',
        apiUrl: 'https://api.mm0708.top/api/product-swap/generate',
        payload: { targetImage: 'target' },
    });
});

test('polls one local task until it reaches a terminal state', async () => {
    const states = ['processing', 'processing', 'completed'];
    let reads = 0;
    const task = await pollLocalTask('task_local_1', {
        history: {
            getTask: async () => ({
                id: 'task_local_1',
                status: states[reads++],
            }),
        },
        intervalMs: 0,
    });

    assert.equal(task.status, 'completed');
    assert.equal(reads, 3);
});

test('turns a stale processing task into an interrupted terminal state', async () => {
    const failures = [];
    const task = await pollLocalTask('task_local_1', {
        history: {
            getTask: async () => failures.length
                ? { id: 'task_local_1', status: 'failed' }
                : { id: 'task_local_1', status: 'processing' },
            isStaleProcessingTask: () => true,
            failTask: async (taskId, code) => failures.push([taskId, code]),
        },
        intervalMs: 0,
        delay: async () => {
            throw new Error('stale task was not recovered');
        },
    });

    assert.equal(task.status, 'failed');
    assert.deepEqual(failures, [[
        'task_local_1',
        'GENERATION_INTERRUPTED',
    ]]);
});

test('prefers a local success receipt over stale interruption', async () => {
    let failures = 0;
    let completions = 0;
    const task = await pollLocalTask('task_local_1', {
        history: {
            getTask: async () => ({
                id: 'task_local_1',
                status: 'failed',
                errorCode: 'GENERATION_INTERRUPTED',
            }),
            getGenerationReceipt: async () => ({
                imageUrl: 'https://example.com/result.png',
            }),
            completeTask: async () => { completions += 1; },
            isStaleProcessingTask: () => true,
            failTask: async () => { failures += 1; },
        },
        intervalMs: 0,
        delay: async () => assert.fail('should not wait'),
    });

    assert.equal(task.status, 'completed');
    assert.equal(task.result.imageUrl, 'https://example.com/result.png');
    assert.equal(failures, 0);
    assert.equal(completions, 1);
});

test('generation page registers the background worker and restores active tasks', () => {
    const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    assert.match(source, /serviceWorker\.register\('\/generation-worker\.js'/);
    assert.match(source, /sessionStorage/);
    assert.match(source, /latestProcessingTask/);
    assert.match(source, /postMessage/);
});

test('generation records task lifecycle in local history', () => {
    const html = fs.readFileSync(
        path.join(root, 'create.html'),
        'utf8',
    );
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.ok(
        html.indexOf('/local-history.js') < html.indexOf('/script.js'),
    );
    assert.match(source, /localHistory\.startTask/);
    assert.match(source, /localHistory\.completeTask/);
    assert.match(source, /localHistory\.failTask/);
});

test('generation page exposes version history and quick refinement prompts', () => {
    const html = fs.readFileSync(
        path.join(root, 'create.html'),
        'utf8',
    );

    assert.match(
        html,
        /id="versionRail"[\s\S]*aria-label="生成版本"/,
    );
    assert.match(
        html,
        /id="quickPrompts"[\s\S]*aria-label="快捷修改"/,
    );
    assert.ok(
        html.indexOf('/version-history.js') < html.indexOf('/script.js'),
    );
});

test('quick prompts only fill and focus the refinement input', () => {
    const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

    assert.match(source, /activeTemplate\?\.quickPrompts/);
    assert.match(source, /appendQuickPrompt\(/);
    assert.match(source, /refineInput\.maxLength/);
    assert.match(source, /refineInput\.focus\(\)/);
    assert.doesNotMatch(source, /quickPrompt[\s\S]{0,300}requestSubmit/);
});

test('quick prompts avoid duplicate tails and respect the input limit', () => {
    assert.equal(
        appendQuickPrompt('背景更亮', '背景更亮', 500),
        '背景更亮',
    );
    assert.equal(
        appendQuickPrompt('背景更亮，字号更大', '字号更大', 500),
        '背景更亮，字号更大',
    );
    assert.equal(
        appendQuickPrompt('背景更亮', '字号更大', 500),
        '背景更亮，字号更大',
    );
    assert.equal(
        appendQuickPrompt('12345', 'abcdef', 8),
        '12345，ab',
    );
});

test('restored and refined versions become the current image source', () => {
    const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

    assert.match(source, /VersionHistory\.createVersionHistory\(\)/);
    assert.match(source, /versions\.restore\(index\)/);
    assert.match(source, /showVersion\(restored\)/);
    assert.match(source, /state\.conversationId\s*=\s*version\.conversationId/);
    assert.match(source, /state\.messages\s*=\s*version\.messages/);
    assert.match(
        source,
        /result:\s*baseVersion\.imageUrl/,
    );
    assert.doesNotMatch(source, /versions\.list\(\)\.at\(-1\)/);
});

test('downloads the current version through a checked blob response', () => {
    const source = [
        fs.readFileSync(path.join(root, 'script.js'), 'utf8'),
        fs.readFileSync(path.join(root, 'version-history.js'), 'utf8'),
    ].join('\n');

    assert.match(source, /async function downloadCurrentVersion\(\)/);
    assert.match(source, /versions\.current\(\)/);
    assert.match(source, /VersionHistory\.createDownloadRequest/);
    assert.match(
        source,
        /fetch\(\s*request\.url,\s*request\.fetchOptions/,
    );
    assert.match(source, /credentials:\s*'omit'/);
    assert.match(source, /redirect:\s*'error'/);
    assert.match(source, /referrerPolicy:\s*'no-referrer'/);
    assert.match(source, /VersionHistory\.validateDownloadResponse/);
    assert.match(source, /await response\.blob\(\)/);
    assert.match(source, /URL\.createObjectURL/);
    assert.match(
        source,
        /`\$\{activeTemplate\.id\}-\$\{Date\.now\(\)\}\.png`/,
    );
    assert.match(source, /link\.remove\(\)/);
    assert.match(
        source,
        /setTimeout\([\s\S]*?URL\.revokeObjectURL\(objectUrl\)[\s\S]*?,\s*0\)/,
    );
    assert.match(source, /URL\.revokeObjectURL/);
    assert.match(source, /下载失败，请保留当前页面后重试/);
});

test('generation versions retain context and hydrate by task identity', () => {
    const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

    assert.match(source, /const baseVersion = versions\.current\(\)/);
    assert.match(source, /baseVersionId:\s*baseVersion\.id/);
    assert.match(
        source,
        /startLocalTask\(payload,\s*true,\s*\{[\s\S]*?baseVersionId:\s*baseVersion\.id/,
    );
    assert.match(
        source,
        /baseVersionId:\s*task\.input\?\.baseVersionId/,
    );
    assert.match(source, /conversationId:\s*state\.conversationId/);
    assert.match(source, /messages:\s*state\.messages/);
    assert.match(
        source,
        /VersionHistory\.findVersionIndexByIdentity/,
    );
    assert.match(
        source,
        /sourceTaskId:[\s\S]{0,120}\?\s*task\.id\s*:\s*null/,
    );
    assert.doesNotMatch(
        source,
        /current\.imageUrl\s*!==\s*state\.result/,
    );
});

test('restore controls describe the exact version and instruction', () => {
    const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

    assert.match(
        source,
        /`恢复版本 \$\{index \+ 1\}：\$\{version\.instruction\}`/,
    );
});

test('version and quick prompt controls have bounded scrolling styles', () => {
    const source = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

    assert.match(
        source,
        /\.version-rail\s*\{[\s\S]*?display:\s*flex;[\s\S]*?gap:[\s\S]*?overflow-x:\s*auto;/,
    );
    assert.match(
        source,
        /\.quick-prompts\s*\{[\s\S]*?display:\s*flex;[\s\S]*?gap:[\s\S]*?overflow-x:\s*auto;/,
    );
    assert.match(
        source,
        /\.version-select\s*\{[\s\S]*?width:\s*72px;[\s\S]*?height:\s*96px;/,
    );
    assert.match(
        source,
        /\.version-select\[aria-current="true"\][\s\S]*?border-color:/,
    );
    assert.match(
        source,
        /\.version-select img\s*\{[\s\S]*?object-fit:\s*cover;/,
    );
    assert.doesNotMatch(
        source,
        /\.version-item button\s*\{[\s\S]*?width:\s*72px;/,
    );
});
