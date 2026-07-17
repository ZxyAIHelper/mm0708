const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildCodexPrompt,
    buildCodexArgs,
    buildCodexSpawnOptions,
    createSerialQueue,
} = require('../server/codex-cli-provider');

test('prompt assigns each image a stable role', () => {
    const prompt = buildCodexPrompt({
        hasProductImage: true,
        hasSceneImage: true,
        requirements: '保持三个托盘',
    });

    assert.match(prompt, /第一张图是目标模板/);
    assert.match(prompt, /第二张图是需要换入的产品/);
    assert.match(prompt, /第三张图只作为场景参考/);
    assert.match(prompt, /保持三个托盘/);
    assert.match(prompt, /result\.png/);
    assert.match(prompt, /不要调用任何 HTTP/);
    assert.match(prompt, /product-swap-image[\\/]SKILL\.md/);
});

test('refinement prompt assigns the previous result first', () => {
    const prompt = buildCodexPrompt({
        hasProductImage: true,
        hasSceneImage: false,
        hasPreviousImage: true,
        requirements: '盘子改为白色',
    });

    assert.match(prompt, /第一张图是上一版结果/);
    assert.match(prompt, /第二张图是原始目标模板/);
    assert.match(prompt, /第三张图是产品图/);
});

test('child process receives a non-zero agent depth marker', () => {
    const options = buildCodexSpawnOptions('C:\\temp\\swap', {
        PATH: 'test-path',
    });

    assert.equal(options.env.PRODUCT_SWAP_AGENT_DEPTH, '1');
    assert.match(options.env.PRODUCT_SWAP_CALL_CHAIN, /^local_/);
    assert.equal(options.windowsHide, true);
});

test('CLI args use repeated image options without a shell', () => {
    const args = buildCodexArgs({
        taskDir: 'C:\\temp\\swap',
        imagePaths: [
            'C:\\temp\\target.jpg',
            'C:\\temp\\product.jpg',
        ],
        prompt: '生成图片',
    });

    assert.equal(args[0], 'exec');
    assert.ok(args.includes('--ephemeral'));
    assert.deepEqual(
        args.filter((value) => value === '-i'),
        ['-i', '-i'],
    );
    assert.equal(args.at(-1), '生成图片');
});

test('serial queue does not overlap jobs', async () => {
    const enqueue = createSerialQueue();
    const events = [];

    const first = enqueue(async () => {
        events.push('first:start');
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push('first:end');
    });
    const second = enqueue(async () => {
        events.push('second:start');
        events.push('second:end');
    });

    await Promise.all([first, second]);

    assert.deepEqual(events, [
        'first:start',
        'first:end',
        'second:start',
        'second:end',
    ]);
});
