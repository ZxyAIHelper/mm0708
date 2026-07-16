'use strict';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
]);

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

module.exports = {
    MAX_IMAGE_BYTES,
    ProductSwapError,
    decodeImageDataUrl,
    validateGenerateRequest,
};
