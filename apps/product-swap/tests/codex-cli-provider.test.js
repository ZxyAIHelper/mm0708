const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildCodexPrompt,
    buildCodexArgs,
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
