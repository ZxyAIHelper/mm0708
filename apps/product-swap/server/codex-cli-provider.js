'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SKILL_PATH = path.resolve(
    __dirname,
    '..',
    'skills',
    'product-swap-image',
    'SKILL.md',
);

function buildCodexPrompt({
    hasProductImage,
    hasSceneImage,
    hasPreviousImage = false,
    requirements,
}) {
    const initialRoles = [
        '第一张图是目标模板。保持它的宽高比、镜头、构图、商品数量、排列、背景和光线。',
        hasProductImage
            ? '第二张图是需要换入的产品。保留其形状、颜色、包装、餐具和关键识别特征。'
            : '没有提供产品图，请根据用户要求生成需要换入的商品。',
        hasSceneImage
            ? `第${hasProductImage ? '三' : '二'}张图只作为场景参考。只吸收环境和氛围，不改变产品本身。`
            : '',
    ];
    const refinementRoles = [
        '第一张图是上一版结果，以它作为本轮编辑底图。',
        '第二张图是原始目标模板，只用于校准构图、数量、排列、背景和光线。',
        hasProductImage
            ? '第三张图是产品图，产品主体和识别特征不得改变。'
            : '',
        hasSceneImage
            ? `第${hasProductImage ? '四' : '三'}张图只作为场景参考。`
            : '',
    ];
    const instructions = [
        `严格遵循 product-swap-image Skill：${SKILL_PATH}`,
        ...(hasPreviousImage ? refinementRoles : initialRoles),
        '只替换目标模板中的菜品或商品，不增加文字、Logo、水印或额外商品。',
        requirements ? `用户本轮要求：${requirements}` : '',
        '不要调用任何 HTTP/HTTPS 地址，不要启动服务，不要再次运行 codex 或其他 agent。',
        '只使用当前进程直接可用的图片编辑能力生成一张结果图，并将最终文件保存为当前工作目录下的 result.png。不要只描述结果。',
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

async function generateWithCodex({
    taskDir,
    imagePaths,
    hasProductImage = imagePaths.length >= 2,
    hasSceneImage = imagePaths.length >= 3,
    hasPreviousImage = false,
    requirements,
    timeoutMs = 300000,
    spawnImpl = spawn,
}) {
    if (Number(process.env.PRODUCT_SWAP_AGENT_DEPTH || 0) > 0) {
        const error = new Error('Nested product-swap agent call blocked');
        error.code = 'AGENT_LOOP_GUARD';
        throw error;
    }

    const prompt = buildCodexPrompt({
        hasProductImage,
        hasSceneImage,
        hasPreviousImage,
        requirements,
    });
    const args = buildCodexArgs({ taskDir, imagePaths, prompt });

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
            assistantMessage: hasPreviousImage
                ? '已完成新一版修正。'
                : '已完成第一版，可以继续提出修改。',
        };
    } catch {
        const error = new Error('Codex did not create result.png');
        error.code = 'RESULT_IMAGE_NOT_FOUND';
        throw error;
    }
}

module.exports = {
    SKILL_PATH,
    buildCodexPrompt,
    buildCodexArgs,
    buildCodexSpawnOptions,
    createSerialQueue,
    generateWithCodex,
};
