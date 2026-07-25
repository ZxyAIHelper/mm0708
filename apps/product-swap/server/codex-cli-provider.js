'use strict';

const crypto = require('node:crypto');
const { constants: fsConstants } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
    validatePng,
} = require('./image-validation');

const MAX_RESULT_IMAGE_BYTES = 10 * 1024 * 1024;

function buildCodexArgs({ taskDir, imagePaths, prompt }) {
    const args = [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--sandbox',
        'workspace-write',
        '--ask-for-approval',
        'never',
        '-C',
        taskDir,
    ];

    for (const imagePath of imagePaths) {
        args.push('-i', imagePath);
    }

    args.push(prompt);
    return args;
}

function buildCodexSpawnOptions(
    taskDir,
    baseEnv = process.env,
    platform = process.platform,
) {
    const currentDepth = Number(
        baseEnv.PRODUCT_SWAP_AGENT_DEPTH || 0,
    );

    return {
        cwd: taskDir,
        detached: platform !== 'win32',
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: {
            ...baseEnv,
            PRODUCT_SWAP_AGENT_DEPTH:
                String(currentDepth + 1),
            PRODUCT_SWAP_CALL_CHAIN:
                baseEnv.PRODUCT_SWAP_CALL_CHAIN
                || `local_${crypto.randomUUID()}`,
        },
    };
}

function createSerialQueue() {
    let tail = Promise.resolve();

    return function enqueue(task) {
        const current = tail.then(task, task);
        tail = current.catch(() => undefined);
        return current;
    };
}

function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

function waitForSpawnedProcess(child) {
    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`Process exited with code ${code}`));
        });
    });
}

async function terminateProcessTree({
    child,
    waitForClose,
    isClosed,
    platform = process.platform,
    treeKillSpawnImpl = spawn,
    processKillImpl = process.kill,
    killGraceMs = 1000,
}) {
    if (isClosed()) {
        return;
    }

    if (platform === 'win32') {
        try {
            if (!Number.isInteger(child.pid) || child.pid <= 0) {
                throw new Error('Child PID is unavailable');
            }
            const killer = treeKillSpawnImpl(
                'taskkill',
                ['/PID', String(child.pid), '/T', '/F'],
                {
                    shell: false,
                    windowsHide: true,
                    stdio: 'ignore',
                },
            );
            await waitForSpawnedProcess(killer);
        } catch {
            if (!isClosed()) {
                child.kill();
            }
        }
        await waitForClose;
        return;
    }

    const signalProcessGroup = (signal) => {
        if (!Number.isInteger(child.pid) || child.pid <= 0) {
            child.kill(signal);
            return;
        }
        try {
            processKillImpl(-child.pid, signal);
        } catch {
            child.kill(signal);
        }
    };

    signalProcessGroup('SIGTERM');
    const closedDuringGrace = await Promise.race([
        waitForClose.then(() => true),
        delay(killGraceMs).then(() => false),
    ]);
    if (!closedDuringGrace && !isClosed()) {
        signalProcessGroup('SIGKILL');
        await waitForClose;
    }
}

async function runCodexProcess({
    taskDir,
    args,
    timeoutMs = 300000,
    spawnImpl = spawn,
    treeKillSpawnImpl = spawn,
    platform = process.platform,
    processKillImpl = process.kill,
    killGraceMs = 1000,
}) {
    if (Number(process.env.PRODUCT_SWAP_AGENT_DEPTH || 0) > 0) {
        const error = new Error('Nested product-swap agent call blocked');
        error.code = 'AGENT_LOOP_GUARD';
        throw error;
    }

    await new Promise((resolve, reject) => {
        const child = spawnImpl(
            'codex',
            args,
            buildCodexSpawnOptions(taskDir, process.env, platform),
        );
        let stderr = '';
        let settled = false;
        let timedOut = false;
        let closed = false;
        let resolveClosed;
        const waitForClose = new Promise((resolve) => {
            resolveClosed = resolve;
        });

        function finish(callback) {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            callback();
        }

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
            if (stderr.length > 8000) {
                stderr = stderr.slice(-8000);
            }
        });

        const timer = setTimeout(() => {
            timedOut = true;
            void terminateProcessTree({
                child,
                waitForClose,
                isClosed: () => closed,
                platform,
                treeKillSpawnImpl,
                processKillImpl,
                killGraceMs,
            }).catch(() => waitForClose).then(() => {
                finish(() => {
                    const error = new Error(
                        'Codex generation timed out',
                    );
                    error.code = 'CODEX_TIMEOUT';
                    reject(error);
                });
            });
        }, timeoutMs);

        child.once('error', (error) => {
            closed = true;
            resolveClosed();
            if (timedOut) {
                return;
            }
            finish(() => {
                error.code = error.code === 'ENOENT'
                    ? 'CODEX_CLI_UNAVAILABLE'
                    : 'CODEX_GENERATION_FAILED';
                reject(error);
            });
        });

        child.once('close', (code) => {
            closed = true;
            resolveClosed();
            if (timedOut) {
                return;
            }
            finish(() => {
                if (code === 0) {
                    resolve();
                    return;
                }

                const error = new Error(
                    stderr || `Codex exited with code ${code}`,
                );
                error.code = 'CODEX_GENERATION_FAILED';
                reject(error);
            });
        });
    });

    return readResultImage(path.join(taskDir, 'result.png'));
}

async function readResultImage(
    resultPath,
    {
        fsImpl = fs,
        constants = fsConstants,
    } = {},
) {
    let linkStat;
    try {
        linkStat = await fsImpl.lstat(resultPath);
    } catch {
        const error = new Error('Codex did not create result.png');
        error.code = 'RESULT_IMAGE_NOT_FOUND';
        throw error;
    }

    if (
        linkStat.isSymbolicLink()
        || !linkStat.isFile()
    ) {
        const error = new Error('Codex created an invalid result.png');
        error.code = 'INVALID_RESULT_IMAGE';
        throw error;
    }

    let fileHandle;
    try {
        const flags = constants.O_RDONLY
            | (constants.O_NOFOLLOW || 0);
        fileHandle = await fsImpl.open(resultPath, flags);
        const resultStat = await fileHandle.stat();
        if (
            !resultStat.isFile()
            || resultStat.size <= 0
            || resultStat.size > MAX_RESULT_IMAGE_BYTES
        ) {
            throw new Error('invalid PNG result');
        }
        const imageBuffer = Buffer.alloc(resultStat.size);
        let offset = 0;
        while (offset < imageBuffer.length) {
            const { bytesRead } = await fileHandle.read(
                imageBuffer,
                offset,
                imageBuffer.length - offset,
                offset,
            );
            if (!bytesRead) {
                throw new Error('truncated PNG result');
            }
            offset += bytesRead;
        }
        const extra = Buffer.alloc(1);
        const { bytesRead: extraBytes } = await fileHandle.read(
            extra,
            0,
            1,
            imageBuffer.length,
        );
        if (extraBytes || !validatePng(imageBuffer)) {
            throw new Error('invalid PNG result');
        }
        return {
            imageBuffer,
            mimeType: 'image/png',
            provider: 'codex-cli',
            assistantMessage: '已完成生成，可以继续提出修改。',
        };
    } catch {
        const error = new Error('Codex created an invalid result.png');
        error.code = 'INVALID_RESULT_IMAGE';
        throw error;
    } finally {
        await fileHandle?.close().catch(() => undefined);
    }
}

async function generateWithCodex({
    taskDir,
    imagePaths,
    prompt,
    timeoutMs = 300000,
    spawnImpl = spawn,
}) {
    if (typeof prompt !== 'string' || !prompt.trim()) {
        const error = new Error('Template prompt is empty');
        error.code = 'INVALID_TEMPLATE';
        throw error;
    }

    const args = buildCodexArgs({ taskDir, imagePaths, prompt });
    return runCodexProcess({
        taskDir,
        args,
        timeoutMs,
        spawnImpl,
    });
}

module.exports = {
    MAX_RESULT_IMAGE_BYTES,
    buildCodexArgs,
    buildCodexSpawnOptions,
    createSerialQueue,
    readResultImage,
    terminateProcessTree,
    runCodexProcess,
    generateWithCodex,
};
