'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
    getTemplatePackage,
    publicCatalog,
} = require('./template-registry');
const {
    MAX_IMAGE_PIXELS,
    decodeImageBuffer,
    validatePng,
} = require('./image-validation');
const {
    parseDishAssetQuery,
    queryDishAssets,
    validateCatalog,
} = require('../dish-assets/library');
const dishAssetCatalog = validateCatalog(
    require('../dish-assets/catalog.json'),
);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 16384;
const MAX_REQUEST_BYTES = 42 * 1024 * 1024;
const APP_ROOT = path.resolve(__dirname, '..');
const PUBLIC_ASSETS_ROOT = path.join(APP_ROOT, 'assets');
const PUBLIC_STATIC_PATHS = new Set([
    'index.html',
    'create.html',
    'history.html',
    'profile.html',
    'style.css',
    'app.css',
    'api-client.js',
    'local-history.js',
    'version-history.js',
    'merchant-store.js',
    'generation-worker.js',
    'script.js',
    'history.js',
    'home.js',
    'profile.js',
    'templates.js',
    'creator-form.js',
    'creator-meta.js',
    'dish-library-client.js',
].map((entry) => path.join(APP_ROOT, entry)));
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
class ProductSwapError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'ProductSwapError';
        this.code = code;
        this.status = status;
    }
}

async function unavailableLocalProvider() {
    const error = new Error(
        'Local generation uses the shared Volcano-backed API',
    );
    error.code = 'VOLCANO_PROVIDER_NOT_CONFIGURED';
    throw error;
}

function decodeImageDataUrl(value, fieldName) {
    if (typeof value !== 'string') {
        throw new ProductSwapError(
            'INVALID_INPUT',
            `${fieldName} 不是有效图片`,
        );
    }

    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
        value,
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

    const base64 = match[2];
    const canonicalBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

    if (
        !canonicalBase64.test(base64)
        || Math.floor(base64.length / 4) * 3
            > MAX_IMAGE_BYTES + 2
    ) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            `${fieldName} 不是有效图片`,
        );
    }

    const buffer = Buffer.from(base64, 'base64');

    if (
        !buffer.length
        || buffer.toString('base64') !== base64
    ) {
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

    const { width, height } = readImageDimensions(
        buffer,
        mimeType,
    );

    if (
        !Number.isInteger(width)
        || !Number.isInteger(height)
        || width <= 0
        || height <= 0
        || width > MAX_IMAGE_DIMENSION
        || height > MAX_IMAGE_DIMENSION
        || width * height > MAX_IMAGE_PIXELS
    ) {
        throw new ProductSwapError(
            'INVALID_IMAGE',
            '图片尺寸无效',
        );
    }

    return { buffer, mimeType, extension, width, height };
}

function readImageDimensions(buffer, mimeType) {
    if (mimeType === 'image/png') {
        const dimensions = validatePng(buffer);
        if (dimensions) {
            return dimensions;
        }
    }

    if (
        mimeType === 'image/jpeg'
        && buffer.length >= 4
        && buffer[0] === 0xff
        && buffer[1] === 0xd8
    ) {
        let offset = 2;
        let dimensions = null;
        let seenScan = false;
        const startOfFrame = new Set([
            0xc0, 0xc1, 0xc2, 0xc3,
            0xc5, 0xc6, 0xc7,
            0xc9, 0xca, 0xcb,
            0xcd, 0xce, 0xcf,
        ]);

        while (offset + 3 < buffer.length) {
            if (buffer[offset] !== 0xff) {
                break;
            }
            while (
                offset < buffer.length
                && buffer[offset] === 0xff
            ) {
                offset += 1;
            }
            const marker = buffer[offset];
            offset += 1;
            if (marker === 0xd9) {
                break;
            }
            if (offset + 1 >= buffer.length) {
                break;
            }
            const segmentLength = buffer.readUInt16BE(offset);
            if (
                segmentLength < 2
                || offset + segmentLength > buffer.length
            ) {
                break;
            }
            if (marker === 0xda) {
                const scanStart = offset + segmentLength;
                const endMarker = buffer.indexOf(
                    Buffer.from([0xff, 0xd9]),
                    scanStart,
                );
                seenScan = endMarker > scanStart;
                break;
            }
            if (
                startOfFrame.has(marker)
                && segmentLength >= 7
            ) {
                dimensions = {
                    height: buffer.readUInt16BE(offset + 3),
                    width: buffer.readUInt16BE(offset + 5),
                };
            }
            offset += segmentLength;
        }
        if (dimensions && seenScan) {
            return dimensions;
        }
    }

    if (
        mimeType === 'image/webp'
        && buffer.length >= 30
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP'
        && buffer.readUInt32LE(4) + 8 === buffer.length
    ) {
        const format = buffer.toString('ascii', 12, 16);
        const chunkLength = buffer.readUInt32LE(16);
        const paddedChunkEnd = 20
            + chunkLength
            + (chunkLength % 2);
        if (paddedChunkEnd > buffer.length) {
            throw new ProductSwapError(
                'INVALID_IMAGE',
                '图片格式无效',
            );
        }
        if (format === 'VP8X' && chunkLength >= 10) {
            const dimensions = {
                width: 1 + buffer.readUIntLE(24, 3),
                height: 1 + buffer.readUIntLE(27, 3),
            };
            let chunkOffset = paddedChunkEnd;
            let seenImageChunk = false;
            while (chunkOffset < buffer.length) {
                if (buffer.length - chunkOffset < 8) {
                    throw new ProductSwapError(
                        'INVALID_IMAGE',
                        '图片格式无效',
                    );
                }
                const nestedType = buffer.toString(
                    'ascii',
                    chunkOffset,
                    chunkOffset + 4,
                );
                const nestedLength = buffer.readUInt32LE(
                    chunkOffset + 4,
                );
                const nestedEnd = chunkOffset
                    + 8
                    + nestedLength
                    + (nestedLength % 2);
                if (nestedEnd > buffer.length) {
                    throw new ProductSwapError(
                        'INVALID_IMAGE',
                        '图片格式无效',
                    );
                }
                if (
                    ['VP8 ', 'VP8L', 'ANMF'].includes(nestedType)
                    && nestedLength > 0
                ) {
                    seenImageChunk = true;
                }
                chunkOffset = nestedEnd;
            }
            if (seenImageChunk) {
                return dimensions;
            }
        }
        if (
            format === 'VP8 '
            && chunkLength >= 10
            && paddedChunkEnd === buffer.length
            && buffer[23] === 0x9d
            && buffer[24] === 0x01
            && buffer[25] === 0x2a
        ) {
            return {
                width: buffer.readUInt16LE(26) & 0x3fff,
                height: buffer.readUInt16LE(28) & 0x3fff,
            };
        }
        if (
            format === 'VP8L'
            && chunkLength >= 5
            && paddedChunkEnd === buffer.length
            && buffer[20] === 0x2f
        ) {
            return {
                width: 1 + (
                    buffer[21]
                    | ((buffer[22] & 0x3f) << 8)
                ),
                height: 1 + (
                    (buffer[22] >> 6)
                    | (buffer[23] << 2)
                    | ((buffer[24] & 0x0f) << 10)
                ),
            };
        }
    }

    throw new ProductSwapError(
        'INVALID_IMAGE',
        '图片格式无效',
    );
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function normalizeGeneratedAt(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
        value,
    );
    if (!match) {
        return '';
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const offsetHour = Number(match[9] || 0);
    const offsetMinute = Number(match[10] || 0);
    const daysInMonth = new Date(
        Date.UTC(year, month, 0),
    ).getUTCDate();

    if (
        month < 1
        || month > 12
        || day < 1
        || day > daysInMonth
        || hour > 23
        || minute > 59
        || second > 59
        || offsetHour > 23
        || offsetMinute > 59
    ) {
        return '';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

async function validateGenerateRequest(body = {}) {
    if (!isPlainObject(body)) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            '请求内容无效',
        );
    }
    const dangerousKeys = new Set([
        '__proto__',
        'constructor',
        'prototype',
    ]);
    if (Object.keys(body).some((key) => dangerousKeys.has(key))) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            '请求包含危险字段',
        );
    }
    if (
        body.templateId !== undefined
        && (
            typeof body.templateId !== 'string'
            || !body.templateId
        )
    ) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            '模板标识无效',
        );
    }
    const template = getTemplatePackage(
        body.templateId || 'product-swap',
    );

    if (!template || template.manifest.status !== 'live') {
        throw new ProductSwapError(
            'INVALID_TEMPLATE',
            '模板不可用',
        );
    }

    const allowedKeys = new Set([
        ...template.manifest.fields.map((field) => field.key),
        'previousImage',
        'messages',
        'conversationId',
        'generatedAt',
        'templateId',
    ]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            '请求包含未知字段',
        );
    }

    const values = Object.create(null);
    const hasPreviousImage = Boolean(body.previousImage);

    for (const field of template.manifest.fields) {
        const rawValue = body[field.key];
        const hasRawValue = Object.prototype.hasOwnProperty.call(
            body,
            field.key,
        );

        if (field.type === 'dish-list') {
            if (
                !hasRawValue
                || !Array.isArray(rawValue)
                || Object.getPrototypeOf(rawValue) !== Array.prototype
                || rawValue.length < field.minItems
                || rawValue.length > field.maxItems
                || Reflect.ownKeys(rawValue).some((key) => (
                    key !== 'length'
                    && (
                        typeof key !== 'string'
                        || !/^(0|[1-9]\d*)$/.test(key)
                        || Number(key) >= rawValue.length
                    )
                ))
            ) {
                throw new ProductSwapError(
                    'INVALID_INPUT',
                    `${field.label}无效`,
                );
            }
            const dishes = [];
            for (let index = 0; index < rawValue.length; index += 1) {
                if (!Object.hasOwn(rawValue, index)) {
                    throw new ProductSwapError(
                        'INVALID_INPUT',
                        `${field.label}无效`,
                    );
                }
                const dish = rawValue[index];
                if (
                    !isPlainObject(dish)
                    || Reflect.ownKeys(dish).some((key) => (
                        !['image', 'owned', 'source'].includes(key)
                    ))
                    || typeof dish.image !== 'string'
                    || typeof dish.owned !== 'boolean'
                    || !['user', 'library'].includes(dish.source)
                ) {
                    throw new ProductSwapError(
                        'INVALID_INPUT',
                        `第 ${index + 1} 张菜品无效`,
                    );
                }
                if (dish.source === 'library' && dish.owned) {
                    throw new ProductSwapError(
                        'INVALID_INPUT',
                        '资源库菜品不能标记为自家菜品',
                    );
                }
                dishes.push({
                    image: decodeImageDataUrl(
                        dish.image,
                        `${field.key}-${index}`,
                    ),
                    owned: dish.owned,
                    source: dish.source,
                });
            }
            if (
                dishes.filter((dish) => (
                    dish.owned && dish.source === 'user'
                )).length < field.minOwned
            ) {
                throw new ProductSwapError(
                    'INVALID_INPUT',
                    '请至少标记一道自家菜品',
                );
            }
            values[field.key] = dishes;
            continue;
        }

        if (field.type === 'image') {
            if (!hasRawValue || rawValue === '') {
                if (field.required) {
                    throw new ProductSwapError(
                        'INVALID_INPUT',
                        `请上传${field.label}`,
                    );
                }
                values[field.key] = null;
                continue;
            }
            if (typeof rawValue !== 'string') {
                throw new ProductSwapError(
                    'INVALID_INPUT',
                    `${field.label}无效`,
                );
            }
            values[field.key] = decodeImageDataUrl(
                rawValue,
                field.key,
            );
            continue;
        }

        if (field.type === 'choice') {
            if (
                hasRawValue
                && typeof rawValue !== 'string'
            ) {
                throw new ProductSwapError(
                    'INVALID_INPUT',
                    `${field.label}无效`,
                );
            }
            const value = hasRawValue ? rawValue : field.default;
            const allowedValues = (field.options || []).map(
                (option) => option.value,
            );
            if (!allowedValues.includes(value)) {
                throw new ProductSwapError(
                    'INVALID_INPUT',
                    `${field.label}无效`,
                );
            }
            values[field.key] = value;
            continue;
        }

        if (field.type === 'boolean') {
            const value = hasRawValue ? rawValue : field.default;
            if (typeof value !== 'boolean') {
                throw new ProductSwapError(
                    'INVALID_INPUT',
                    `${field.label}无效`,
                );
            }
            values[field.key] = value;
            continue;
        }

        if (field.type === 'text') {
            if (
                hasRawValue
                && typeof rawValue !== 'string'
            ) {
                throw new ProductSwapError(
                    'INVALID_INPUT',
                    `${field.label}无效`,
                );
            }
            const value = (hasRawValue ? rawValue : '').trim();
            if (field.required && !value) {
                throw new ProductSwapError(
                    'INVALID_INPUT',
                    `${field.label}不能为空`,
                );
            }
            const limit = hasPreviousImage
                ? 500
                : field.maxLength;
            if (limit && value.length > limit) {
                throw new ProductSwapError(
                    'INVALID_INPUT',
                    `${field.label}不能超过 ${limit} 字`,
                );
            }
            values[field.key] = value;
        }
    }

    let generatedAt = '';
    if (body.generatedAt !== undefined) {
        generatedAt = normalizeGeneratedAt(body.generatedAt);
        if (!generatedAt) {
            throw new ProductSwapError(
                'INVALID_INPUT',
                '日期时间无效',
            );
        }
    }
    if (values.showDateTime) {
        generatedAt = generatedAt || new Date().toISOString();
        values.generatedAt = generatedAt;
    }

    if (
        body.previousImage !== undefined
        && typeof body.previousImage !== 'string'
    ) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            'previousImage 无效',
        );
    }
    if (
        body.conversationId !== undefined
        && (
            typeof body.conversationId !== 'string'
            || body.conversationId.length > 128
        )
    ) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            'conversationId 无效',
        );
    }
    if (
        body.messages !== undefined
        && !Array.isArray(body.messages)
    ) {
        throw new ProductSwapError(
            'INVALID_INPUT',
            'messages 无效',
        );
    }
    const messages = (body.messages || []).slice(-6).map(
        (message) => {
            if (
                !isPlainObject(message)
                || !['user', 'assistant'].includes(message.role)
                || typeof message.content !== 'string'
                || message.content.length > 1000
            ) {
                throw new ProductSwapError(
                    'INVALID_INPUT',
                    'messages 无效',
                );
            }
            return {
                role: message.role,
                content: message.content,
            };
        },
    );

    const previousImage = body.previousImage
        ? decodeImageDataUrl(body.previousImage, 'previousImage')
        : null;
    const images = [
        ...template.manifest.fields
            .filter((field) => field.type === 'image')
            .map((field) => values[field.key])
            .filter(Boolean),
        ...template.manifest.fields
            .filter((field) => field.type === 'dish-list')
            .flatMap((field) => (
                (values[field.key] || []).map((dish) => dish.image)
            )),
        previousImage,
    ].filter(Boolean);

    try {
        for (const image of images) {
            const decoded = await decodeImageBuffer(
                image.buffer,
                image.mimeType,
            );
            image.width = decoded.width;
            image.height = decoded.height;
        }
    } catch {
        throw new ProductSwapError(
            'INVALID_IMAGE',
            '图片内容无法解码',
        );
    }

    return {
        template,
        values,
        previousImage,
        messages,
    };
}

function readJsonBody(
    request,
    {
        timeoutMs = 15000,
        maxBytes = MAX_REQUEST_BYTES,
    } = {},
) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let settled = false;

        const cleanup = () => {
            clearTimeout(timer);
            request.off('data', onData);
            request.off('end', onEnd);
            request.off('aborted', onAborted);
            request.off('error', onError);
        };
        const finish = (callback) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            callback();
        };
        const rejectWith = (code, message, status) => {
            finish(() => reject(
                new ProductSwapError(code, message, status),
            ));
        };
        const onData = (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                request.pause();
                rejectWith(
                    'FILE_TOO_LARGE',
                    '上传内容过大',
                    413,
                );
                return;
            }
            chunks.push(chunk);
        };
        const onEnd = () => {
            try {
                const value = JSON.parse(
                    Buffer.concat(chunks).toString('utf8') || '{}',
                );
                finish(() => resolve(value));
            } catch {
                rejectWith('INVALID_INPUT', '请求格式无效');
            }
        };
        const onAborted = () => {
            rejectWith('REQUEST_ABORTED', '请求已中止', 400);
        };
        const onError = () => {
            rejectWith('REQUEST_ABORTED', '请求已中止', 400);
        };
        const timer = setTimeout(() => {
            request.pause();
            rejectWith('REQUEST_TIMEOUT', '请求体读取超时', 408);
        }, timeoutMs);

        request.on('data', onData);
        request.once('end', onEnd);
        request.once('aborted', onAborted);
        request.once('error', onError);
    });
}

function resolveTaskImagePath(taskDir, name, extension) {
    const taskRoot = path.resolve(taskDir);
    const filePath = path.resolve(
        taskRoot,
        `${name}${extension}`,
    );

    if (
        !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)
        || !/^\.[a-z0-9]+$/i.test(extension)
        || path.dirname(filePath) !== taskRoot
    ) {
        throw new ProductSwapError(
            'INVALID_TEMPLATE',
            '模板图片字段无效',
        );
    }
    return filePath;
}

async function writeInputImage(taskDir, name, image) {
    if (!image) {
        return null;
    }

    const filePath = resolveTaskImagePath(
        taskDir,
        name,
        image.extension,
    );
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
            'VOLCANO_PROVIDER_NOT_CONFIGURED',
            {
                status: 503,
                message: '火山图片服务尚未配置',
            },
        ],
        [
            'PROVIDER_TIMEOUT',
            {
                status: 504,
                message: '图片生成超时，请稍后重试',
            },
        ],
        [
            'PROVIDER_REQUEST_FAILED',
            {
                status: 502,
                message: '图片服务请求失败',
            },
        ],
    ]);
    const code = knownErrors.has(error?.code)
        ? error.code
        : 'PROVIDER_REQUEST_FAILED';
    const mapped = knownErrors.get(code);

    return {
        status: mapped.status,
        code,
        message: mapped.message,
    };
}

async function handleGenerate(
    request,
    response,
    provider,
    bodyOptions,
) {
    const requestId = `swap_${crypto.randomUUID()}`;
    let taskDir = '';

    try {
        const body = await readJsonBody(request, bodyOptions);
        const input = await validateGenerateRequest(body);
        taskDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'product-swap-'),
        );

        const previousPath = await writeInputImage(
            taskDir,
            'previous',
            input.previousImage,
        );
        const imageEntries = input.template.manifest.fields.filter(
            (field) => (
                field.type === 'image'
                && input.values[field.key]
            ),
        );
        const imagePaths = previousPath ? [previousPath] : [];

        for (const field of imageEntries) {
            imagePaths.push(await writeInputImage(
                taskDir,
                field.key,
                input.values[field.key],
            ));
        }
        const dishFields = input.template.manifest.fields.filter(
            (field) => field.type === 'dish-list',
        );
        for (const field of dishFields) {
            const dishes = input.values[field.key] || [];
            for (let index = 0; index < dishes.length; index += 1) {
                imagePaths.push(await writeInputImage(
                    taskDir,
                    `${field.key}-${index}`,
                    dishes[index].image,
                ));
            }
        }
        const promptValues = { ...input.values };
        for (const field of dishFields) {
            promptValues[field.key] = input.values[field.key].map(
                (dish) => ({
                    owned: dish.owned,
                    source: dish.source,
                }),
            );
        }
        const prompt = input.template.buildPrompt({
            ...promptValues,
            hasPreviousImage: Boolean(previousPath),
            imageRoles: imageEntries.map((field) => field.role),
            messages: input.messages,
        });

        const result = await provider({
            taskDir,
            imagePaths,
            prompt,
            requestId,
        });

        sendJson(response, 200, {
            success: true,
            imageUrl: result.imageUrl
                || `data:${result.mimeType};base64,${result.imageBuffer.toString('base64')}`,
            provider: result.provider,
            assistantMessage: result.assistantMessage,
            requestId,
        });
    } catch (error) {
        if (
            error?.code === 'REQUEST_ABORTED'
            || response.destroyed
            || response.writableEnded
        ) {
            return;
        }
        const mapped = mapServerError(error);
        const closeAfterResponse = [
            'REQUEST_TIMEOUT',
            'FILE_TOO_LARGE',
        ].includes(error?.code);
        if (closeAfterResponse) {
            response.setHeader('Connection', 'close');
            response.once('finish', () => {
                request.socket.destroy();
            });
        }
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

    if (
        !PUBLIC_STATIC_PATHS.has(resolved)
        && !resolved.startsWith(`${PUBLIC_ASSETS_ROOT}${path.sep}`)
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

function sendTemplateCatalog(
    response,
    method = 'GET',
    catalogProvider = publicCatalog,
) {
    let source;

    try {
        source = `globalThis.__TEMPLATE_CATALOG__ = ${JSON.stringify(
            catalogProvider(),
        )};\n`;
    } catch {
        response.writeHead(500, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        response.end(
            method === 'HEAD'
                ? undefined
                : 'Internal server error',
        );
        return;
    }

    response.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
    });

    if (method === 'HEAD') {
        response.end();
        return;
    }

    response.end(source);
}

function createProductSwapServer({
    provider = unavailableLocalProvider,
    catalogProvider = publicCatalog,
    bodyTimeoutMs = 15000,
    maxRequestBytes = MAX_REQUEST_BYTES,
} = {}) {
    let generationActive = false;

    const server = http.createServer(async (request, response) => {
        const pathname = new URL(
            request.url || '/',
            'http://local',
        ).pathname;
        const isGenerateApi = pathname.replace(/\/+$/, '')
            === '/api/product-swap/generate';
        const origin = request.headers.origin;

        if ((isGenerateApi || request.method === 'OPTIONS') && origin) {
            let parsedOrigin;
            const address = server.address();

            try {
                parsedOrigin = new URL(origin);
            } catch {
                parsedOrigin = null;
            }
            const allowedHost = parsedOrigin
                && parsedOrigin.protocol === 'http:'
                && (
                    parsedOrigin.hostname === '127.0.0.1'
                    || parsedOrigin.hostname === 'localhost'
                )
                && Number(parsedOrigin.port) === address?.port;

            if (!allowedHost) {
                sendJson(response, 403, {
                    success: false,
                    error: {
                        code: 'FORBIDDEN_ORIGIN',
                        message: '请求来源不受信任',
                    },
                });
                return;
            }
            response.setHeader(
                'Access-Control-Allow-Origin',
                parsedOrigin.origin,
            );
            response.setHeader('Vary', 'Origin');
        }

        if (request.method === 'OPTIONS') {
            response.setHeader(
                'Access-Control-Allow-Headers',
                'Content-Type, X-Product-Swap-Agent-Depth',
            );
            response.setHeader(
                'Access-Control-Allow-Methods',
                'POST, OPTIONS',
            );
            response.writeHead(204);
            response.end();
            return;
        }

        if (
            isGenerateApi
            && request.method === 'POST'
        ) {
            const requestedDepth = Number(
                request.headers['x-product-swap-agent-depth'] || 0,
            );

            if (requestedDepth > 0) {
                sendJson(response, 409, {
                    success: false,
                    error: {
                        code: 'AGENT_LOOP_GUARD',
                        message: '检测到嵌套生成请求，已阻止 agent 循环',
                    },
                });
                return;
            }
            if (generationActive) {
                sendJson(response, 409, {
                    success: false,
                    error: {
                        code: 'SERVER_BUSY',
                        message: '已有生成任务正在进行',
                    },
                });
                return;
            }

            generationActive = true;
            try {
                await handleGenerate(
                    request,
                    response,
                    provider,
                    {
                        timeoutMs: bodyTimeoutMs,
                        maxBytes: maxRequestBytes,
                    },
                );
            } finally {
                generationActive = false;
            }
            return;
        }

        if (
            pathname === '/template-catalog.js'
            && (
                request.method === 'GET'
                || request.method === 'HEAD'
            )
        ) {
            sendTemplateCatalog(
                response,
                request.method,
                catalogProvider,
            );
            return;
        }

        if (pathname.replace(/\/+$/, '') === '/api/dish-assets') {
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                sendJson(response, 405, {
                    success: false,
                    error: {
                        code: 'METHOD_NOT_ALLOWED',
                        message: '请求方法不受支持',
                    },
                });
                return;
            }
            try {
                const options = parseDishAssetQuery(new URL(
                    request.url || '/',
                    'http://local',
                ));
                const items = queryDishAssets(dishAssetCatalog, options);
                response.setHeader(
                    'Cache-Control',
                    'public, max-age=300',
                );
                if (request.method === 'HEAD') {
                    response.writeHead(200, {
                        'Content-Type': 'application/json; charset=utf-8',
                    });
                    response.end();
                    return;
                }
                sendJson(response, 200, {
                    success: true,
                    items,
                    total: items.length,
                });
            } catch (error) {
                sendJson(response, 400, {
                    success: false,
                    error: {
                        code: 'INVALID_INPUT',
                        message: error.message,
                    },
                });
            }
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

    return server;
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
    readJsonBody,
    resolveTaskImagePath,
    validateGenerateRequest,
    createProductSwapServer,
};
