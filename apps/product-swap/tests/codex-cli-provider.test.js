'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createZeroIdatPng } = require('./image-fixtures');

const {
    buildCodexArgs,
    buildCodexSpawnOptions,
    createSerialQueue,
    generateWithCodex,
    readResultImage,
    runCodexProcess,
} = require('../server/codex-cli-provider');

const pngMagic = Buffer.from('89504e470d0a1a0a', 'hex');
const validPngBuffer = Buffer.from(
    [
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC',
        'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    ].join(''),
    'base64',
);

function createSuccessfulChild() {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => child.emit('close', 0));
    return child;
}

test('child process receives a non-zero agent depth marker', () => {
    const options = buildCodexSpawnOptions('C:\\temp\\swap', {
        PATH: 'test-path',
    });

    assert.equal(options.env.PRODUCT_SWAP_AGENT_DEPTH, '1');
    assert.match(options.env.PRODUCT_SWAP_CALL_CHAIN, /^local_/);
    assert.equal(options.windowsHide, true);
});

test('POSIX child starts in a detached process group', () => {
    const options = buildCodexSpawnOptions(
        '/tmp/swap',
        { PATH: 'test-path' },
        'linux',
    );

    assert.equal(options.detached, true);
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
    await fs.writeFile(
        path.join(taskDir, 'result.png'),
        validPngBuffer,
    );

    let receivedArgs;
    const spawnImpl = (_command, args) => {
        receivedArgs = args;
        return createSuccessfulChild();
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

test('generateWithCodex rejects a non-PNG result', async (t) => {
    const taskDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'codex-provider-test-'),
    );
    t.after(() => fs.rm(taskDir, { recursive: true, force: true }));
    await fs.writeFile(path.join(taskDir, 'result.png'), 'not png');

    await assert.rejects(
        () => generateWithCodex({
            taskDir,
            imagePaths: [],
            prompt: '生成图片',
            spawnImpl: createSuccessfulChild,
        }),
        (error) => error.code === 'INVALID_RESULT_IMAGE',
    );
});

test('generateWithCodex rejects header-only PNG results', async (t) => {
    const taskDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'codex-provider-test-'),
    );
    t.after(() => fs.rm(taskDir, { recursive: true, force: true }));
    const resultPath = path.join(taskDir, 'result.png');

    for (const buffer of [
        pngMagic,
        validPngBuffer.subarray(0, 24),
    ]) {
        await fs.writeFile(resultPath, buffer);
        await assert.rejects(
            () => generateWithCodex({
                taskDir,
                imagePaths: [],
                prompt: '生成图片',
                spawnImpl: createSuccessfulChild,
            }),
            (error) => error.code === 'INVALID_RESULT_IMAGE',
        );
    }
});

test('generateWithCodex rejects a structurally valid undecodable result', async (t) => {
    const taskDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'codex-provider-test-'),
    );
    t.after(() => fs.rm(taskDir, { recursive: true, force: true }));
    await fs.writeFile(
        path.join(taskDir, 'result.png'),
        createZeroIdatPng(),
    );

    await assert.rejects(
        () => generateWithCodex({
            taskDir,
            imagePaths: [],
            prompt: '生成图片',
            spawnImpl: createSuccessfulChild,
        }),
        (error) => error.code === 'INVALID_RESULT_IMAGE',
    );
});

test('generateWithCodex rejects a symlink result', async (t) => {
    const taskDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'codex-provider-test-'),
    );
    t.after(() => fs.rm(taskDir, { recursive: true, force: true }));
    const targetPath = path.join(taskDir, 'target');
    const resultPath = path.join(taskDir, 'result.png');
    await fs.mkdir(targetPath);
    await fs.symlink(targetPath, resultPath, 'junction');

    await assert.rejects(
        () => generateWithCodex({
            taskDir,
            imagePaths: [],
            prompt: '生成图片',
            spawnImpl: createSuccessfulChild,
        }),
        (error) => error.code === 'INVALID_RESULT_IMAGE',
    );
});

test('readResultImage does not read an oversized open handle', async () => {
    let readCalled = false;
    let closeCalled = false;
    const fileHandle = {
        async stat() {
            return {
                isFile: () => true,
                size: 10 * 1024 * 1024 + 1,
            };
        },
        async read() {
            readCalled = true;
            return { bytesRead: 0 };
        },
        async close() {
            closeCalled = true;
        },
    };
    const fsImpl = {
        async lstat() {
            return {
                isFile: () => true,
                isSymbolicLink: () => false,
            };
        },
        async open() {
            return fileHandle;
        },
    };

    await assert.rejects(
        () => readResultImage('result.png', { fsImpl }),
        (error) => error.code === 'INVALID_RESULT_IMAGE',
    );
    assert.equal(readCalled, false);
    assert.equal(closeCalled, true);
});

test('generateWithCodex rejects an oversized PNG result', async (t) => {
    const taskDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'codex-provider-test-'),
    );
    t.after(() => fs.rm(taskDir, { recursive: true, force: true }));
    const resultPath = path.join(taskDir, 'result.png');
    await fs.writeFile(resultPath, validPngBuffer);
    await fs.truncate(resultPath, 10 * 1024 * 1024 + 1);

    await assert.rejects(
        () => generateWithCodex({
            taskDir,
            imagePaths: [],
            prompt: '生成图片',
            spawnImpl: createSuccessfulChild,
        }),
        (error) => error.code === 'INVALID_RESULT_IMAGE',
    );
});

test('Windows timeout kills the exact process tree before rejecting', async () => {
    const events = [];
    const child = new EventEmitter();
    child.pid = 4321;
    child.stderr = new EventEmitter();
    child.kill = () => {
        events.push('fallback-kill');
    };
    const spawnImpl = () => child;
    const treeKillSpawnImpl = (command, args, options) => {
        assert.equal(command, 'taskkill');
        assert.deepEqual(args, ['/PID', '4321', '/T', '/F']);
        assert.equal(options.shell, false);
        events.push('taskkill');
        const killer = new EventEmitter();
        queueMicrotask(() => {
            killer.emit('close', 0);
            events.push('child:close');
            child.emit('close', 1);
        });
        return killer;
    };

    await assert.rejects(
        () => runCodexProcess({
            taskDir: os.tmpdir(),
            args: ['exec', 'prompt'],
            timeoutMs: 5,
            spawnImpl,
            treeKillSpawnImpl,
            platform: 'win32',
        }),
        (error) => {
            events.push('rejected');
            return error.code === 'CODEX_TIMEOUT';
        },
    );

    assert.deepEqual(events, [
        'taskkill',
        'child:close',
        'rejected',
    ]);
});

test('Windows timeout falls back and still waits when taskkill fails', async () => {
    const events = [];
    const child = new EventEmitter();
    child.pid = 4321;
    child.stderr = new EventEmitter();
    child.kill = () => {
        events.push('fallback-kill');
        queueMicrotask(() => {
            events.push('child:close');
            child.emit('close', 1);
        });
    };
    const treeKillSpawnImpl = () => {
        const killer = new EventEmitter();
        queueMicrotask(() => killer.emit('close', 1));
        return killer;
    };

    await assert.rejects(
        () => runCodexProcess({
            taskDir: os.tmpdir(),
            args: ['exec', 'prompt'],
            timeoutMs: 5,
            spawnImpl: () => child,
            treeKillSpawnImpl,
            platform: 'win32',
        }),
        (error) => {
            events.push('rejected');
            return error.code === 'CODEX_TIMEOUT';
        },
    );
    assert.deepEqual(events, [
        'fallback-kill',
        'child:close',
        'rejected',
    ]);
});

test('POSIX timeout escalates TERM to KILL and waits for close', async () => {
    const events = [];
    const child = new EventEmitter();
    child.pid = 4321;
    child.stderr = new EventEmitter();
    child.kill = (signal) => {
        events.push(`fallback:${signal}`);
        return true;
    };
    const processKillImpl = (pid, signal) => {
        events.push(`${pid}:${signal}`);
        if (signal === 'SIGKILL') {
            queueMicrotask(() => {
                events.push('child:close');
                child.emit('close', 1);
            });
        }
    };

    await assert.rejects(
        () => runCodexProcess({
            taskDir: os.tmpdir(),
            args: ['exec', 'prompt'],
            timeoutMs: 5,
            killGraceMs: 1,
            spawnImpl: () => child,
            platform: 'linux',
            processKillImpl,
        }),
        (error) => {
            events.push('rejected');
            return error.code === 'CODEX_TIMEOUT';
        },
    );

    assert.deepEqual(events, [
        '-4321:SIGTERM',
        '-4321:SIGKILL',
        'child:close',
        'rejected',
    ]);
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
