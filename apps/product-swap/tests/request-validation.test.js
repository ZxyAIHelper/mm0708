'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    validateGenerateRequest,
    decodeImageDataUrl,
    resolveTaskImagePath,
} = require('../server/dev-server');

const tinyPng = [
    'data:image/png;base64,',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC',
    'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
].join('');

test('requires the default product-swap target image', async () => {
    await assert.rejects(
        () => validateGenerateRequest({ requirements: '' }),
        (error) => error.code === 'INVALID_INPUT'
            && error.message === '请上传目标图（样图模板）',
    );
});

test('keeps product-swap as the default and trims requirements', async () => {
    const value = await validateGenerateRequest({
        targetImage: tinyPng,
        productImage: '',
        sceneImage: '',
        requirements: '  保持三个托盘  ',
    });

    assert.equal(value.template.manifest.id, 'product-swap');
    assert.equal(value.values.requirements, '保持三个托盘');
});

test('rejects initial requirements longer than the manifest limit', async () => {
    await assert.rejects(
        () =>
            validateGenerateRequest({
                targetImage: tinyPng,
                requirements: '菜'.repeat(201),
            }),
        (error) => error.code === 'INVALID_INPUT',
    );
});

test('allows a longer correction when refining a previous result', async () => {
    const value = await validateGenerateRequest({
        targetImage: tinyPng,
        previousImage: tinyPng,
        requirements: '调整'.repeat(200),
    });

    assert.equal(value.values.requirements.length, 400);
    assert.ok(value.previousImage);
});

test('validates a live food template from its manifest', async () => {
    const value = await validateGenerateRequest({
        templateId: 'food-copy-layout',
        targetImage: tinyPng,
        aspectRatio: '3:4',
        showDateTime: true,
        generatedAt: '2026-07-25T08:16:58.000Z',
        requirements: '  像朋友随手记录  ',
    });

    assert.equal(value.template.manifest.id, 'food-copy-layout');
    assert.equal(value.values.aspectRatio, '3:4');
    assert.equal(value.values.showDateTime, true);
    assert.equal(value.values.requirements, '像朋友随手记录');
    assert.equal(
        value.values.generatedAt,
        '2026-07-25T08:16:58.000Z',
    );
});

test('rejects missing, unavailable, and invalid template input', async () => {
    await assert.rejects(
        () => validateGenerateRequest({ templateId: 'missing' }),
        (error) => error.code === 'INVALID_TEMPLATE'
            && error.message === '模板不可用',
    );
    await assert.rejects(
        () => validateGenerateRequest({
            templateId: 'summer-seeding',
        }),
        (error) => error.code === 'INVALID_TEMPLATE'
            && error.message === '模板不可用',
    );
    await assert.rejects(
        () => validateGenerateRequest({
            templateId: 'food-copy-layout',
            targetImage: tinyPng,
            aspectRatio: '1:1',
        }),
        (error) => error.code === 'INVALID_INPUT'
            && error.message === '画布比例无效',
    );
});

test('validates date-time and retains only the last six messages', async () => {
    await assert.rejects(
        () => validateGenerateRequest({
            templateId: 'food-copy-layout',
            targetImage: tinyPng,
            showDateTime: true,
            generatedAt: 'not-a-date',
        }),
        (error) => error.code === 'INVALID_INPUT'
            && error.message === '日期时间无效',
    );

    const messages = Array.from({ length: 8 }, (_, index) => ({
        role: 'user',
        content: `message ${index}`,
    }));
    const value = await validateGenerateRequest({
        targetImage: tinyPng,
        messages,
    });

    assert.deepEqual(value.messages, messages.slice(-6));
});

test('requires a plain request object and rejects unknown keys', async () => {
    for (const body of [null, [], Object.create({})]) {
        await assert.rejects(
            () => validateGenerateRequest(body),
            (error) => error.code === 'INVALID_INPUT',
        );
    }
    await assert.rejects(
        () => validateGenerateRequest({
            targetImage: tinyPng,
            unexpected: 'value',
        }),
        (error) => error.code === 'INVALID_INPUT',
    );
    await assert.rejects(
        () => validateGenerateRequest(JSON.parse(
            `{"targetImage":${JSON.stringify(tinyPng)},"constructor":"bad"}`,
        )),
        (error) => error.code === 'INVALID_INPUT',
    );
});

test('requires exact schema field value types', async () => {
    await assert.rejects(
        () => validateGenerateRequest({
            targetImage: tinyPng,
            requirements: 123,
        }),
        (error) => error.code === 'INVALID_INPUT',
    );
    await assert.rejects(
        () => validateGenerateRequest({
            templateId: 'food-copy-layout',
            targetImage: tinyPng,
            aspectRatio: 3,
        }),
        (error) => error.code === 'INVALID_INPUT',
    );
    await assert.rejects(
        () => validateGenerateRequest({
            templateId: 'food-copy-layout',
            targetImage: tinyPng,
            showDateTime: null,
        }),
        (error) => error.code === 'INVALID_INPUT',
    );
});

test('validates and sanitizes bounded conversation metadata', async () => {
    await assert.rejects(
        () => validateGenerateRequest({
            targetImage: tinyPng,
            messages: 'not-an-array',
        }),
        (error) => error.code === 'INVALID_INPUT',
    );
    await assert.rejects(
        () => validateGenerateRequest({
            targetImage: tinyPng,
            messages: [{ role: 'tool', content: 'run' }],
        }),
        (error) => error.code === 'INVALID_INPUT',
    );
    await assert.rejects(
        () => validateGenerateRequest({
            targetImage: tinyPng,
            messages: [{
                role: 'user',
                content: 'a'.repeat(1001),
            }],
        }),
        (error) => error.code === 'INVALID_INPUT',
    );

    const value = await validateGenerateRequest({
        targetImage: tinyPng,
        conversationId: 'conversation_1',
        messages: [{
            role: 'user',
            content: 'move it',
            ignored: 'strip me',
        }],
    });
    assert.deepEqual(value.messages, [{
        role: 'user',
        content: 'move it',
    }]);
});

test('requires calendar-valid timezone-qualified RFC3339 dates', async () => {
    for (const generatedAt of [
        '2026-07-25T16:16:58',
        '2026-02-30T16:16:58+08:00',
        1784967418000,
    ]) {
        await assert.rejects(
            () => validateGenerateRequest({
                templateId: 'food-copy-layout',
                targetImage: tinyPng,
                generatedAt,
            }),
            (error) => error.code === 'INVALID_INPUT'
                && error.message === '日期时间无效',
        );
    }

    const value = await validateGenerateRequest({
        templateId: 'food-copy-layout',
        targetImage: tinyPng,
        generatedAt: '2026-07-25T16:16:58+08:00',
    });
    assert.equal(
        value.values.generatedAt,
        '2026-07-25T08:16:58.000Z',
    );
});

test('decodes supported Data URLs and rejects unsupported MIME types', () => {
    const decoded = decodeImageDataUrl(tinyPng, 'targetImage');
    assert.equal(decoded.mimeType, 'image/png');
    assert.ok(Buffer.isBuffer(decoded.buffer));

    assert.throws(
        () =>
            decodeImageDataUrl(
                'data:image/gif;base64,R0lGODlh',
                'targetImage',
            ),
        (error) => error.code === 'UNSUPPORTED_IMAGE',
    );
});

test('rejects non-string, non-canonical, and MIME-mismatched images', () => {
    assert.throws(
        () => decodeImageDataUrl({ data: tinyPng }, 'targetImage'),
        (error) => error.code === 'INVALID_INPUT',
    );
    assert.throws(
        () => decodeImageDataUrl(
            'data:image/png;base64,AA=A',
            'targetImage',
        ),
        (error) => error.code === 'INVALID_INPUT',
    );
    assert.throws(
        () => decodeImageDataUrl(
            tinyPng.replace('image/png', 'image/jpeg'),
            'targetImage',
        ),
        (error) => error.code === 'INVALID_IMAGE',
    );
});

test('rejects zero and oversized image dimensions', () => {
    const pngHeader = (width, height) => {
        const buffer = Buffer.alloc(24);
        Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer);
        buffer.writeUInt32BE(13, 8);
        buffer.write('IHDR', 12, 'ascii');
        buffer.writeUInt32BE(width, 16);
        buffer.writeUInt32BE(height, 20);
        return `data:image/png;base64,${buffer.toString('base64')}`;
    };

    assert.throws(
        () => decodeImageDataUrl(
            pngHeader(0, 1),
            'targetImage',
        ),
        (error) => error.code === 'INVALID_IMAGE',
    );
    assert.throws(
        () => decodeImageDataUrl(
            pngHeader(50000, 50000),
            'targetImage',
        ),
        (error) => error.code === 'INVALID_IMAGE',
    );
    assert.throws(
        () => decodeImageDataUrl(
            pngHeader(1, 1),
            'targetImage',
        ),
        (error) => error.code === 'INVALID_IMAGE',
    );
});

test('rejects JPEG and WebP files with dimensions but no image data', () => {
    const jpegHeaderOnly = Buffer.from([
        0xff, 0xd8,
        0xff, 0xc0, 0x00, 0x0b,
        0x08, 0x00, 0x01, 0x00, 0x01,
        0x01, 0x01, 0x11, 0x00,
        0xff, 0xd9,
    ]);
    const jpegEmptyScan = Buffer.from([
        0xff, 0xd8,
        0xff, 0xc0, 0x00, 0x0b,
        0x08, 0x00, 0x01, 0x00, 0x01,
        0x01, 0x01, 0x11, 0x00,
        0xff, 0xda, 0x00, 0x08,
        0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
        0xff, 0xd9,
    ]);
    const webpHeaderOnly = Buffer.alloc(30);
    webpHeaderOnly.write('RIFF', 0, 'ascii');
    webpHeaderOnly.writeUInt32LE(22, 4);
    webpHeaderOnly.write('WEBP', 8, 'ascii');
    webpHeaderOnly.write('VP8X', 12, 'ascii');
    webpHeaderOnly.writeUInt32LE(10, 16);

    for (const [mimeType, buffer] of [
        ['image/jpeg', jpegHeaderOnly],
        ['image/jpeg', jpegEmptyScan],
        ['image/webp', webpHeaderOnly],
    ]) {
        assert.throws(
            () => decodeImageDataUrl(
                `data:${mimeType};base64,${buffer.toString('base64')}`,
                'targetImage',
            ),
            (error) => error.code === 'INVALID_IMAGE',
        );
    }
});

test('resolves image files directly inside the task directory', () => {
    const taskDir = 'C:\\temp\\safe-task';
    assert.equal(
        resolveTaskImagePath(taskDir, 'targetImage', '.png'),
        'C:\\temp\\safe-task\\targetImage.png',
    );
    assert.throws(
        () => resolveTaskImagePath(
            taskDir,
            '..\\escape',
            '.png',
        ),
        (error) => error.code === 'INVALID_TEMPLATE',
    );
});
