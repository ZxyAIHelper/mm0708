'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const {
    validateGenerateRequest,
} = require('../server/dev-server');
const {
    createUndecodableJpeg,
    createUndecodableWebp,
    createZeroIdatPng,
} = require('./image-fixtures');

async function createRealFixture(format) {
    return sharp({
        create: {
            width: 2,
            height: 2,
            channels: 4,
            background: {
                r: 20,
                g: 40,
                b: 60,
                alpha: 1,
            },
        },
    }).toFormat(format).toBuffer();
}

test('accepts real fully decodable PNG JPEG and WebP uploads', async () => {
    for (const [format, mimeType] of [
        ['png', 'image/png'],
        ['jpeg', 'image/jpeg'],
        ['webp', 'image/webp'],
    ]) {
        const buffer = await createRealFixture(format);
        const value = await validateGenerateRequest({
            targetImage:
                `data:${mimeType};base64,${buffer.toString('base64')}`,
        });
        assert.equal(value.values.targetImage.mimeType, mimeType);
    }
});

test('rejects structurally present but undecodable pixel streams', async () => {
    for (const [mimeType, buffer] of [
        ['image/png', createZeroIdatPng()],
        ['image/jpeg', createUndecodableJpeg()],
        ['image/webp', createUndecodableWebp()],
    ]) {
        await assert.rejects(
            () => validateGenerateRequest({
                targetImage:
                    `data:${mimeType};base64,${buffer.toString('base64')}`,
            }),
            (error) => error.code === 'INVALID_IMAGE',
        );
    }
});
