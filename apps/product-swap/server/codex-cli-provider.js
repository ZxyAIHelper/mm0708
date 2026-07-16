'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

function buildCodexPrompt({
    hasProductImage,
    hasSceneImage,
    requirements,
}) {
    const instructions = [
        '第一张图是目标模板。保持它的宽高比、镜头、构图、商品数量、排列、背景和光线。',
        hasProductImage
            ? '第二张图是需要换入的产品。保留其形状、颜色、包装、餐具和关键识别特征。'
            : '没有提供产品图，请根据用户额外要求生成需要换入的商品。',
        hasSceneImage
            ? '第三张图只作为场景参考。只吸收环境和氛围，不改变产品本身。'
            : '',
        '只替换目标模板中的菜品或商品，不增加文字、Logo、水印或额外商品。',
        requirements ? `用户额外要求：${requirements}` : '',
        '使用可用的图片编辑能力生成一张结果图，并将最终文件保存为当前工作目录下的 result.png。不要只描述结果。',
    ];

    return instructions.filter(Boolean).join('\n');
}

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

function createSerialQueue() {
    let tail = Promise.resolve();

    return function enqueue(task) {
        const current = tail.then(task, task);
        tail = current.catch(() => undefined);
        return current;
    };
}

async function generateWithCodex({
    taskDir,
    imagePaths,
    requirements,
    timeoutMs = 300000,
    spawnImpl = spawn,
}) {
    const prompt = buildCodexPrompt({
        hasProductImage: imagePaths.length >= 2,
        hasSceneImage: imagePaths.length >= 3,
        requirements,
    });
    const args = buildCodexArgs({ taskDir, imagePaths, prompt });

    await new Promise((resolve, reject) => {
        const child = spawnImpl('codex', args, {
            cwd: taskDir,
            shell: false,
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
            if (stderr.length > 8000) {
                stderr = stderr.slice(-8000);
            }
        });

        const timer = setTimeout(() => {
            child.kill();
            const error = new Error('Codex generation timed out');
            error.code = 'CODEX_TIMEOUT';
            reject(error);
        }, timeoutMs);

        child.once('error', (error) => {
            clearTimeout(timer);
            error.code =
                error.code === 'ENOENT'
                    ? 'CODEX_CLI_UNAVAILABLE'
                    : 'CODEX_GENERATION_FAILED';
            reject(error);
        });

        child.once('close', (code) => {
            clearTimeout(timer);
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

    const resultPath = path.join(taskDir, 'result.png');

    try {
        const imageBuffer = await fs.readFile(resultPath);
        return {
            imageBuffer,
            mimeType: 'image/png',
            provider: 'codex-cli',
        };
    } catch {
        const error = new Error('Codex did not create result.png');
        error.code = 'RESULT_IMAGE_NOT_FOUND';
        throw error;
    }
}

module.exports = {
    buildCodexPrompt,
    buildCodexArgs,
    createSerialQueue,
    generateWithCodex,
};
