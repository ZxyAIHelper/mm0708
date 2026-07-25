'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

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

function buildCodexSpawnOptions(taskDir, baseEnv = process.env) {
    const currentDepth = Number(
        baseEnv.PRODUCT_SWAP_AGENT_DEPTH || 0,
    );

    return {
        cwd: taskDir,
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

async function runCodexProcess({
    taskDir,
    args,
    timeoutMs = 300000,
    spawnImpl = spawn,
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
            buildCodexSpawnOptions(taskDir),
        );
        let stderr = '';
        let settled = false;

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
            child.kill();
            finish(() => {
                const error = new Error('Codex generation timed out');
                error.code = 'CODEX_TIMEOUT';
                reject(error);
            });
        }, timeoutMs);

        child.once('error', (error) => {
            finish(() => {
                error.code = error.code === 'ENOENT'
                    ? 'CODEX_CLI_UNAVAILABLE'
                    : 'CODEX_GENERATION_FAILED';
                reject(error);
            });
        });

        child.once('close', (code) => {
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

    const resultPath = path.join(taskDir, 'result.png');

    try {
        const imageBuffer = await fs.readFile(resultPath);
        return {
            imageBuffer,
            mimeType: 'image/png',
            provider: 'codex-cli',
            assistantMessage: '已完成生成，可以继续提出修改。',
        };
    } catch {
        const error = new Error('Codex did not create result.png');
        error.code = 'RESULT_IMAGE_NOT_FOUND';
        throw error;
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
    buildCodexArgs,
    buildCodexSpawnOptions,
    createSerialQueue,
    runCodexProcess,
    generateWithCodex,
};
