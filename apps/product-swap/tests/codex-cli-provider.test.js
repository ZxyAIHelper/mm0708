'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const {
    buildCodexArgs,
    buildCodexSpawnOptions,
    createSerialQueue,
    generateWithCodex,
} = require('../server/codex-cli-provider');

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

test('generateWithCodex passes the exact template prompt as the final CLI argument', async (t) => {
    const taskDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'codex-provider-test-'),
    );
    t.after(() => fs.rm(taskDir, { recursive: true, force: true }));
    await fs.writeFile(path.join(taskDir, 'result.png'), 'png');

    let receivedArgs;
    const spawnImpl = (_command, args) => {
        receivedArgs = args;
        const child = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {};
        queueMicrotask(() => child.emit('close', 0));
        return child;
    };
    const prompt = '模板策略给出的完整提示词';

    await generateWithCodex({
        taskDir,
        imagePaths: [],
        prompt,
        spawnImpl,
    });

    assert.equal(receivedArgs.at(-1), prompt);
});

test('generateWithCodex rejects an empty template prompt', async () => {
    await assert.rejects(
        () => generateWithCodex({
            taskDir: os.tmpdir(),
            imagePaths: [],
            prompt: '   ',
        }),
        (error) => error.code === 'INVALID_TEMPLATE',
    );
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
