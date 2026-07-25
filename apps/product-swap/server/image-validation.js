'use strict';

const sharp = require('sharp');

const PNG_MAGIC = Buffer.from('89504e470d0a1a0a', 'hex');
const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;
const MAX_DECODED_IMAGE_BYTES = MAX_IMAGE_PIXELS * 4;

function crc32(buffer) {
    let crc = 0xffffffff;

    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (
                (crc & 1) ? 0xedb88320 : 0
            );
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function validatePng(buffer) {
    if (
        !Buffer.isBuffer(buffer)
        || buffer.length < PNG_MAGIC.length + 12
        || !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
    ) {
        return null;
    }

    let offset = PNG_MAGIC.length;
    let width = 0;
    let height = 0;
    let seenHeader = false;
    let seenImageData = false;

    while (offset < buffer.length) {
        if (buffer.length - offset < 12) {
            return null;
        }
        const dataLength = buffer.readUInt32BE(offset);
        if (dataLength > buffer.length - offset - 12) {
            return null;
        }
        const typeStart = offset + 4;
        const dataStart = offset + 8;
        const crcOffset = dataStart + dataLength;
        const nextOffset = crcOffset + 4;
        const type = buffer.toString(
            'ascii',
            typeStart,
            dataStart,
        );

        if (
            !/^[A-Za-z]{4}$/.test(type)
            || crc32(buffer.subarray(typeStart, crcOffset))
                !== buffer.readUInt32BE(crcOffset)
        ) {
            return null;
        }

        if (!seenHeader) {
            if (offset !== PNG_MAGIC.length || type !== 'IHDR') {
                return null;
            }
            if (dataLength !== 13) {
                return null;
            }
            width = buffer.readUInt32BE(dataStart);
            height = buffer.readUInt32BE(dataStart + 4);
            const bitDepth = buffer[dataStart + 8];
            const colorType = buffer[dataStart + 9];
            const validDepths = new Map([
                [0, [1, 2, 4, 8, 16]],
                [2, [8, 16]],
                [3, [1, 2, 4, 8]],
                [4, [8, 16]],
                [6, [8, 16]],
            ]);
            if (
                !width
                || !height
                || !validDepths.get(colorType)?.includes(bitDepth)
                || buffer[dataStart + 10] !== 0
                || buffer[dataStart + 11] !== 0
                || ![0, 1].includes(buffer[dataStart + 12])
            ) {
                return null;
            }
            seenHeader = true;
        } else if (type === 'IHDR') {
            return null;
        }

        if (type === 'IDAT') {
            seenImageData = true;
        }
        if (type === 'IEND') {
            if (
                dataLength !== 0
                || !seenImageData
                || nextOffset !== buffer.length
            ) {
                return null;
            }
            return { width, height };
        }
        offset = nextOffset;
    }

    return null;
}

async function decodeImageBuffer(buffer, expectedMimeType) {
    const expectedFormat = new Map([
        ['image/png', 'png'],
        ['image/jpeg', 'jpeg'],
        ['image/webp', 'webp'],
    ]).get(expectedMimeType);
    if (!expectedFormat || !Buffer.isBuffer(buffer)) {
        throw new Error('Unsupported image decode request');
    }

    const image = sharp(buffer, {
        failOn: 'error',
        limitInputPixels: MAX_IMAGE_PIXELS,
        sequentialRead: true,
    });
    const metadata = await image.metadata();
    if (
        metadata.format !== expectedFormat
        || !Number.isInteger(metadata.width)
        || !Number.isInteger(metadata.height)
        || metadata.width <= 0
        || metadata.height <= 0
        || metadata.width * metadata.height > MAX_IMAGE_PIXELS
    ) {
        throw new Error('Decoded image metadata is invalid');
    }

    const { data, info } = await image.clone()
        .raw()
        .toBuffer({ resolveWithObject: true });
    if (
        !Number.isInteger(info.width)
        || !Number.isInteger(info.height)
        || !Number.isInteger(info.channels)
        || info.width !== metadata.width
        || info.height !== metadata.height
        || info.channels <= 0
        || info.channels > 4
        || info.width * info.height > MAX_IMAGE_PIXELS
        || data.length <= 0
        || data.length > MAX_DECODED_IMAGE_BYTES
        || data.length
            !== info.width * info.height * info.channels
    ) {
        throw new Error('Decoded image pixels are invalid');
    }

    return {
        format: metadata.format,
        width: info.width,
        height: info.height,
    };
}

module.exports = {
    MAX_IMAGE_PIXELS,
    PNG_MAGIC,
    decodeImageBuffer,
    validatePng,
};
