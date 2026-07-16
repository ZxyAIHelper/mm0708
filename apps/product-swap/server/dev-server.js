'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
    createSerialQueue,
    generateWithCodex,
} = require('./codex-cli-provider');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 42 * 1024 * 1024;
const APP_ROOT = path.resolve(__dirname, '..');
const SUPPORTED_MIME_TYPES = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
]);
const STATIC_MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
};
const enqueueGeneration = createSerialQueue();

class ProductSwapError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'ProductSwapError';
        this.code = code;
        this.status = status;
    }
}

function decodeImageDataUrl(value, fieldName) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
        String(value || ''),
    );

    if (!match) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            `${fieldName} 不是有效图片`,
        );
    }

    const mimeType = match[1].toLowerCase();
    const extension = SUPPORTED_MIME_TYPES.get(mimeType);

    if (!extension) {
        throw new ProductSwapError(
            'UNSUPPORTED_IMAGE',
            '仅支持 JPG、PNG、WebP',
        );
    }

    const buffer = Buffer.from(match[2], 'base64');

    if (!buffer.length) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            `${fieldName} 图片为空`,
        );
    }

    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new ProductSwapError(
            'FILE_TOO_LARGE',
            '单张图片不能超过 10MB',
        );
    }

    return { buffer, mimeType, extension };
}

function validateGenerateRequest(body = {}) {
    if (!body.targetImage) {
        throw new ProductSwapError('INVALID_INPUT', '请上传目标图');
    }

    const requirements = String(body.requirements || '').trim();

    if (requirements.length > 200) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            '额外要求不能超过 200 字',
        );
    }

    return {
        targetImage: decodeImageDataUrl(body.targetImage, 'targetImage'),
        productImage: body.productImage
            ? decodeImageDataUrl(body.productImage, 'productImage')
            : null,
        sceneImage: body.sceneImage
            ? decodeImageDataUrl(body.sceneImage, 'sceneImage')
            : null,
        requirements,
    };
}

async function readJsonBody(request) {
    const chunks = [];
    let size = 0;

    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_REQUEST_BYTES) {
            throw new ProductSwapError(
                'FILE_TOO_LARGE',
                '上传内容过大',
                413,
            );
        }
        chunks.push(chunk);
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
        throw new ProductSwapError(
            'INVALID_INPUT',
            '请求格式无效',
        );
    }
}

async function writeInputImage(taskDir, name, image) {
    if (!image) {
        return null;
    }

    const filePath = path.join(taskDir, `${name}${image.extension}`);
    await fs.writeFile(filePath, image.buffer);
    return filePath;
}

function sendJson(response, status, value) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(value));
}

function mapServerError(error) {
    if (error instanceof ProductSwapError) {
        return {
            status: error.status,
            code: error.code,
            message: error.message,
        };
    }

    const knownErrors = new Map([
        [
            'CODEX_CLI_UNAVAILABLE',
            {
                status: 503,
                message: '本机没有可用的 Codex CLI',
            },
        ],
        [
            'CODEX_GENERATION_FAILED',
            {
                status: 500,
                message: '本地生成失败，请稍后重试',
            },
        ],
        [
            'CODEX_TIMEOUT',
            {
                status: 504,
                message: '生成超时，请稍后重试',
            },
        ],
        [
            'RESULT_IMAGE_NOT_FOUND',
            {
                status: 500,
                message: 'Codex 没有生成结果图片',
            },
        ],
    ]);
    const code = knownErrors.has(error?.code)
        ? error.code
        : 'CODEX_GENERATION_FAILED';
    const mapped = knownErrors.get(code);

    return {
        status: mapped.status,
        code,
        message: mapped.message,
    };
}

async function handleGenerate(request, response, provider) {
    const requestId = `swap_${crypto.randomUUID()}`;
    let taskDir = '';

    try {
        const body = await readJsonBody(request);
        const input = validateGenerateRequest(body);
        taskDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'product-swap-'),
        );

        const imagePaths = [
            await writeInputImage(
                taskDir,
                'target',
                input.targetImage,
            ),
        ];
        const productPath = await writeInputImage(
            taskDir,
            'product',
            input.productImage,
        );
        const scenePath = await writeInputImage(
            taskDir,
            'scene',
            input.sceneImage,
        );

        if (productPath) {
            imagePaths.push(productPath);
        }
        if (scenePath) {
            imagePaths.push(scenePath);
        }

        const result = await enqueueGeneration(() =>
            provider({
                taskDir,
                imagePaths,
                requirements: input.requirements,
                requestId,
            }),
        );

        sendJson(response, 200, {
            success: true,
            imageUrl: `data:${result.mimeType};base64,${result.imageBuffer.toString('base64')}`,
            provider: result.provider,
            requestId,
        });
    } catch (error) {
        const mapped = mapServerError(error);
        sendJson(response, mapped.status, {
            success: false,
            error: {
                code: mapped.code,
                message: mapped.message,
            },
            requestId,
        });
    } finally {
        if (taskDir) {
            await fs.rm(taskDir, {
                recursive: true,
                force: true,
            }).catch(() => undefined);
        }
    }
}

function resolveStaticPath(urlPath) {
    const pathname = decodeURIComponent(
        new URL(urlPath, 'http://local').pathname,
    );
    const relativePath =
        pathname === '/'
            ? 'index.html'
            : pathname.replace(/^\/+/, '');
    const resolved = path.resolve(APP_ROOT, relativePath);

    if (
        resolved !== APP_ROOT
        && !resolved.startsWith(`${APP_ROOT}${path.sep}`)
    ) {
        return null;
    }

    return resolved;
}

async function serveStatic(request, response) {
    const filePath = resolveStaticPath(request.url || '/');

    if (!filePath) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
    }

    try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
            throw new Error('Not a file');
        }

        const body = await fs.readFile(filePath);
        response.writeHead(200, {
            'Content-Type':
                STATIC_MIME_TYPES[
                    path.extname(filePath).toLowerCase()
                ] || 'application/octet-stream',
        });

        if (request.method === 'HEAD') {
            response.end();
            return;
        }

        response.end(body);
    } catch {
        response.writeHead(404);
        response.end('Not found');
    }
}

function createProductSwapServer({
    provider = generateWithCodex,
} = {}) {
    return http.createServer(async (request, response) => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader(
            'Access-Control-Allow-Headers',
            'Content-Type',
        );
        response.setHeader(
            'Access-Control-Allow-Methods',
            'GET,HEAD,POST,OPTIONS',
        );

        if (request.method === 'OPTIONS') {
            response.writeHead(204);
            response.end();
            return;
        }

        const pathname = new URL(
            request.url || '/',
            'http://local',
        ).pathname;

        if (
            pathname.replace(/\/+$/, '')
                === '/api/product-swap/generate'
            && request.method === 'POST'
        ) {
            await handleGenerate(request, response, provider);
            return;
        }

        if (
            request.method !== 'GET'
            && request.method !== 'HEAD'
        ) {
            response.writeHead(405);
            response.end('Method not allowed');
            return;
        }

        await serveStatic(request, response);
    });
}

if (require.main === module) {
    const port = Number(process.env.PORT || 8791);
    const server = createProductSwapServer();

    server.listen(port, '127.0.0.1', () => {
        console.log(
            `Product Swap running at http://127.0.0.1:${port}`,
        );
    });
}

module.exports = {
    MAX_IMAGE_BYTES,
    ProductSwapError,
    decodeImageDataUrl,
    validateGenerateRequest,
    createProductSwapServer,
};
