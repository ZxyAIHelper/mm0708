'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createVersionHistory,
    createDownloadRequest,
    ensureBrowserDecodablePng,
    fetchValidatedPng,
    findVersionIndexByIdentity,
    hydrateVersion,
    readBoundedResponseBody,
    validateDownloadResponse,
    validatePngBytes,
    versionIdForSourceTask,
} = require('../version-history');

const tinyPngBase64 = [
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC',
    'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
].join('');
const tinyPngBytes = Buffer.from(tinyPngBase64, 'base64');

function pngChunk(type, data) {
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    return chunk;
}

function createTestPng({
    width = 1,
    height = 1,
    bitDepth = 8,
    colorType = 6,
    compression = 0,
    filter = 0,
    interlace = 0,
} = {}) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = bitDepth;
    header[9] = colorType;
    header[10] = compression;
    header[11] = filter;
    header[12] = interlace;
    return Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        pngChunk('IHDR', header),
        pngChunk('IDAT', Buffer.from([1])),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function createAbortTracker() {
    const tracker = {
        calls: 0,
        signal: { aborted: false },
        abort() {
            tracker.calls += 1;
            tracker.signal.aborted = true;
        },
    };
    return tracker;
}

function createNetworkResponse({
    url = 'https://product-swap.example/result.png',
    ok = true,
    contentType = 'image/png',
    contentLength = String(tinyPngBytes.length),
    bytes = tinyPngBytes,
    readError = null,
} = {}) {
    const state = {
        bodyCancels: 0,
        readerCancels: 0,
        reads: 0,
    };
    const response = {
        url,
        ok,
        headers: {
            get(name) {
                if (name === 'content-type') return contentType;
                if (name === 'content-length') return contentLength;
                return null;
            },
        },
        body: {
            getReader() {
                return {
                    async read() {
                        state.reads += 1;
                        if (readError) throw readError;
                        if (state.reads === 1) {
                            return { done: false, value: bytes };
                        }
                        return { done: true };
                    },
                    async cancel() {
                        state.readerCancels += 1;
                    },
                    releaseLock() {},
                };
            },
            async cancel() {
                state.bodyCancels += 1;
            },
        },
    };
    return { response, state };
}

test('adds versions and selects the newest version', () => {
    const history = createVersionHistory();

    const first = history.add({
        imageUrl: 'https://example.com/first.png',
        instruction: '首次生成',
    });
    const second = history.add({
        imageUrl: 'https://example.com/second.png',
        instruction: '换成白色背景',
    });

    assert.equal(typeof first.createdAt, 'number');
    assert.notEqual(first.id, second.id);
    assert.deepEqual(history.list(), [first, second]);
    assert.deepEqual(history.current(), second);
});

test('returns copies that cannot mutate internal versions', () => {
    const input = {
        imageUrl: 'https://example.com/original.png',
        instruction: '首次生成',
        conversationId: 'conversation-1',
        messages: [{
            role: 'assistant',
            content: 'original message',
        }],
    };
    const history = createVersionHistory();
    const added = history.add(input);

    input.imageUrl = 'mutated input';
    input.messages[0].content = 'mutated input message';
    added.imageUrl = 'mutated return';
    added.messages[0].content = 'mutated return message';
    const listed = history.list();
    listed[0].instruction = 'mutated list';
    listed[0].messages[0].content = 'mutated list message';
    listed.push({ imageUrl: 'extra' });
    const current = history.current();
    current.createdAt = 0;

    assert.deepEqual(history.list(), [{
        id: added.id,
        imageUrl: 'https://example.com/original.png',
        instruction: '首次生成',
        createdAt: added.createdAt,
        baseVersionId: null,
        conversationId: 'conversation-1',
        messages: [{
            role: 'assistant',
            content: 'original message',
        }],
        sourceTaskId: null,
    }]);
});

test('selects by index and returns null for invalid selections', () => {
    const history = createVersionHistory();
    history.add({ imageUrl: 'first', instruction: 'first' });
    history.add({ imageUrl: 'second', instruction: 'second' });

    assert.deepEqual(history.select(0), history.list()[0]);
    assert.deepEqual(history.current(), history.list()[0]);
    assert.equal(history.select(-1), null);
    assert.equal(history.select(2), null);
    assert.equal(history.select(0.5), null);
    assert.deepEqual(history.current(), history.list()[0]);
});

test('restores a selected version as a new latest version', () => {
    const history = createVersionHistory();
    const first = history.add({
        imageUrl: 'first',
        instruction: '首次生成',
        conversationId: 'conversation-1',
        messages: [{ role: 'assistant', content: 'first result' }],
        sourceTaskId: 'task-1',
    });
    history.add({ imageUrl: 'second', instruction: '调整背景' });

    const restored = history.restore(0);

    assert.deepEqual(restored, {
        id: restored.id,
        imageUrl: 'first',
        instruction: '恢复版本 1',
        createdAt: restored.createdAt,
        baseVersionId: first.id,
        conversationId: 'conversation-1',
        messages: [{ role: 'assistant', content: 'first result' }],
        sourceTaskId: null,
    });
    assert.notEqual(restored.id, first.id);
    assert.deepEqual(history.current(), restored);
    assert.equal(history.list().length, 3);
    assert.equal(history.restore(8), null);
});

test('keeps selection stable when timestamps collide', () => {
    const originalNow = Date.now;
    Date.now = () => 1234;
    try {
        const history = createVersionHistory();
        history.add({ imageUrl: 'first', instruction: 'first' });
        history.add({ imageUrl: 'second', instruction: 'second' });

        history.select(0);

        assert.equal(history.current().imageUrl, 'first');
        assert.equal(history.list()[0].createdAt, history.list()[1].createdAt);
    } finally {
        Date.now = originalNow;
    }
});

test('keeps identical image URLs as distinct generation attempts', () => {
    const originalNow = Date.now;
    Date.now = () => 1234;
    try {
        const history = createVersionHistory();
        const first = history.add({
            imageUrl: 'data:image/png;base64,AAAA',
            instruction: 'first',
            sourceTaskId: 'task-1',
        });
        const second = history.add({
            imageUrl: 'data:image/png;base64,AAAA',
            instruction: 'second',
            sourceTaskId: 'task-2',
            baseVersionId: first.id,
        });

        assert.notEqual(first.id, second.id);
        assert.equal(second.baseVersionId, first.id);
        assert.equal(history.list().length, 2);
    } finally {
        Date.now = originalNow;
    }
});

test('bounds message snapshots to the latest six entries', () => {
    const history = createVersionHistory();
    const input = Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user',
        content: `message-${index}`,
    }));

    const version = history.add({
        imageUrl: 'result',
        instruction: 'first',
        messages: input,
    });

    assert.deepEqual(
        version.messages.map((message) => message.content),
        [
            'message-2',
            'message-3',
            'message-4',
            'message-5',
            'message-6',
            'message-7',
        ],
    );
});

test('finds hydrated versions by version or task identity, never URL', () => {
    const existing = [{
        id: 'version-1',
        sourceTaskId: 'task-1',
        imageUrl: 'same-url',
    }];

    assert.equal(findVersionIndexByIdentity(existing, {
        id: 'version-1',
        imageUrl: 'other-url',
    }), 0);
    assert.equal(findVersionIndexByIdentity(existing, {
        sourceTaskId: 'task-1',
        imageUrl: 'other-url',
    }), 0);
    assert.equal(findVersionIndexByIdentity(existing, {
        id: 'unknown-version',
        sourceTaskId: 'task-1',
        imageUrl: 'other-url',
    }), 0);
    assert.equal(findVersionIndexByIdentity(existing, {
        sourceTaskId: 'task-2',
        imageUrl: 'same-url',
    }), -1);
    assert.equal(findVersionIndexByIdentity(existing, {
        imageUrl: 'same-url',
    }), -1);
});

test('evicts the oldest versions at the configured entry cap', () => {
    const history = createVersionHistory({ maxEntries: 3 });
    const added = Array.from({ length: 4 }, (_, index) => history.add({
        imageUrl: `image-${index}`,
        instruction: `instruction-${index}`,
    }));

    assert.deepEqual(
        history.list().map((version) => version.id),
        added.slice(1).map((version) => version.id),
    );
    assert.equal(history.current().id, added[3].id);
});

test('evicts oldest entries when the estimated byte budget is exceeded', () => {
    const history = createVersionHistory({
        maxEntries: 20,
        maxEstimatedBytes: 260,
    });
    const first = history.add({
        imageUrl: `data:image/png;base64,${'A'.repeat(180)}`,
        instruction: 'first',
    });
    const second = history.add({
        imageUrl: `data:image/png;base64,${'B'.repeat(180)}`,
        instruction: 'second',
    });

    assert.deepEqual(
        history.list().map((version) => version.id),
        [second.id],
    );
    assert.notEqual(first.id, second.id);
    assert.equal(history.current().id, second.id);
});

test('retains the newest current version when it alone exceeds the budget', () => {
    const history = createVersionHistory({
        maxEstimatedBytes: 32,
    });
    const oversized = history.add({
        imageUrl: `data:image/png;base64,${'A'.repeat(200)}`,
        instruction: 'oversized',
    });

    assert.equal(history.list().length, 1);
    assert.equal(history.current().id, oversized.id);
});

test('allows canonical PNG data URLs and same-origin network URLs', () => {
    const dataUrl = `data:image/png;base64,${tinyPngBase64}`;
    const dataRequest = createDownloadRequest(
        dataUrl,
        'https://product-swap.example',
        1024,
    );
    assert.equal(dataRequest.kind, 'data');
    assert.equal(dataRequest.url, dataUrl);
    assert.equal(dataRequest.maxBytes, 1024);
    assert.deepEqual(
        Buffer.from(dataRequest.bytes),
        tinyPngBytes,
    );

    assert.deepEqual(
        createDownloadRequest(
            '/results/current.png',
            'https://product-swap.example',
            2048,
        ),
        {
            kind: 'network',
            url: 'https://product-swap.example/results/current.png',
            maxBytes: 2048,
            fetchOptions: {
                credentials: 'omit',
                redirect: 'error',
                referrerPolicy: 'no-referrer',
            },
        },
    );
});

test('rejects malformed data URLs and non-same-origin download URLs', () => {
    const origin = 'https://product-swap.example';
    for (const unsafeUrl of [
        'data:image/jpeg;base64,AAAA',
        'data:image/png;base64,AAA',
        'data:image/png;base64,',
        'data:image/png;base64,AB==',
        'data:image/png;base64,AAB=',
        'data:image/png;base64,AAAA',
        'javascript:alert(1)',
        'https://other.example/result.png',
        'https://user:password@product-swap.example/result.png',
    ]) {
        assert.throws(
            () => createDownloadRequest(unsafeUrl, origin),
            /UNSAFE_DOWNLOAD/,
        );
    }
});

test('validates the final PNG response and bounded blob size', () => {
    const policy = createDownloadRequest(
        '/result.png',
        'https://product-swap.example',
        64,
    );
    const response = {
        url: 'https://product-swap.example/result.png',
        ok: true,
        contentType: 'image/png; charset=binary',
        contentLength: '32',
        blobSize: 32,
    };

    assert.equal(validateDownloadResponse(policy, response), true);

    for (const override of [
        { ok: false },
        { url: 'https://other.example/result.png' },
        { contentType: 'image/jpeg' },
        { contentLength: '65' },
        { contentLength: 'invalid' },
        { blobSize: 65 },
        { blobSize: 0 },
    ]) {
        assert.throws(
            () => validateDownloadResponse(
                policy,
                { ...response, ...override },
            ),
            /UNSAFE_DOWNLOAD/,
        );
    }
});

test('fallback version IDs do not reset across history sessions', () => {
    const firstSession = createVersionHistory();
    const secondSession = createVersionHistory();

    const first = firstSession.add({
        imageUrl: 'first',
        instruction: 'first',
    });
    const second = secondSession.add({
        imageUrl: 'second',
        instruction: 'second',
    });

    assert.notEqual(first.id, second.id);
    assert.doesNotMatch(first.id, /^version-\d+$/);
    assert.doesNotMatch(second.id, /^version-\d+$/);
});

test('completed task versions use a stable source-derived ID', () => {
    const expectedId = versionIdForSourceTask('task/refine 1');
    const firstSession = createVersionHistory();
    const secondSession = createVersionHistory();

    const first = firstSession.add({
        imageUrl: 'same',
        instruction: 'first',
        sourceTaskId: 'task/refine 1',
    });
    const second = secondSession.add({
        imageUrl: 'same',
        instruction: 'rehydrated',
        sourceTaskId: 'task/refine 1',
    });

    assert.match(expectedId, /^task:/);
    assert.equal(first.id, expectedId);
    assert.equal(second.id, expectedId);
});

test('preserves a trusted explicit ID when it is unique', () => {
    const history = createVersionHistory();
    const explicit = history.add({
        id: 'persisted-base-version',
        imageUrl: 'base',
        instruction: 'base',
    });
    const later = history.add({
        imageUrl: 'later',
        instruction: 'later',
    });

    assert.equal(explicit.id, 'persisted-base-version');
    assert.notEqual(later.id, explicit.id);
});

test('rehydrates an exact parent before its stable task child', () => {
    const originalSession = createVersionHistory();
    const originalBase = originalSession.add({
        imageUrl: 'base-image',
        instruction: 'base',
        conversationId: 'conversation-1',
        messages: [{ role: 'assistant', content: 'base result' }],
    });

    const refreshedSession = createVersionHistory();
    const parent = hydrateVersion(refreshedSession, {
        id: originalBase.id,
        imageUrl: 'base-image',
        instruction: '恢复的基础版本',
        conversationId: 'conversation-1',
        messages: originalBase.messages,
    });
    const child = hydrateVersion(refreshedSession, {
        imageUrl: 'child-image',
        instruction: 'make it brighter',
        baseVersionId: originalBase.id,
        conversationId: 'conversation-1',
        sourceTaskId: 'task-refine-1',
        messages: [
            ...originalBase.messages,
            { role: 'user', content: 'make it brighter' },
        ],
    });
    const duplicate = hydrateVersion(refreshedSession, {
        imageUrl: 'child-image',
        instruction: 'make it brighter',
        baseVersionId: originalBase.id,
        sourceTaskId: 'task-refine-1',
    });
    const later = refreshedSession.add({
        imageUrl: 'later-image',
        instruction: 'later',
    });

    assert.equal(parent.id, originalBase.id);
    assert.equal(child.id, versionIdForSourceTask('task-refine-1'));
    assert.equal(child.baseVersionId, parent.id);
    assert.equal(duplicate.id, child.id);
    assert.equal(refreshedSession.list().length, 3);
    assert.notEqual(later.id, parent.id);
    assert.notEqual(later.id, child.id);
});

test('never leaves a dangling parent ID after deterministic eviction', () => {
    const history = createVersionHistory({ maxEntries: 2 });
    const parent = history.add({
        imageUrl: 'parent',
        instruction: 'parent',
    });
    history.add({
        imageUrl: 'child',
        instruction: 'child',
        baseVersionId: parent.id,
    });
    history.add({
        imageUrl: 'latest',
        instruction: 'latest',
    });

    const listed = history.list();
    const retainedIds = new Set(listed.map((version) => version.id));
    assert.equal(listed.length, 2);
    assert.equal(
        listed.every((version) => (
            !version.baseVersionId
            || retainedIds.has(version.baseVersionId)
        )),
        true,
    );
});

test('rejects truncated or structurally incomplete PNG bytes', () => {
    assert.equal(validatePngBytes(tinyPngBytes).width, 1);

    for (const invalid of [
        tinyPngBytes.subarray(0, 8),
        tinyPngBytes.subarray(0, 24),
        tinyPngBytes.subarray(0, -1),
        Buffer.from('not a png'),
    ]) {
        assert.throws(
            () => validatePngBytes(invalid),
            /INVALID_PNG/,
        );
    }
});

test('streams a valid PNG within the hard byte ceiling', async () => {
    const chunks = [
        tinyPngBytes.subarray(0, 20),
        tinyPngBytes.subarray(20, 50),
        tinyPngBytes.subarray(50),
    ];
    let reads = 0;
    const response = {
        body: {
            getReader() {
                return {
                    async read() {
                        const value = chunks[reads++];
                        return value
                            ? { done: false, value }
                            : { done: true };
                    },
                    async cancel() {},
                };
            },
        },
    };

    const bytes = await readBoundedResponseBody(
        response,
        tinyPngBytes.length,
    );

    assert.deepEqual(Buffer.from(bytes), tinyPngBytes);
    assert.equal(validatePngBytes(bytes).height, 1);
});

test('cancels and aborts an oversized stream before reading it fully', async () => {
    const chunks = [
        Buffer.alloc(4, 1),
        Buffer.alloc(4, 2),
        Buffer.alloc(4, 3),
        Buffer.alloc(4, 4),
    ];
    let reads = 0;
    let cancelled = false;
    let aborted = false;
    const response = {
        body: {
            getReader() {
                return {
                    async read() {
                        const value = chunks[reads++];
                        return value
                            ? { done: false, value }
                            : { done: true };
                    },
                    async cancel() {
                        cancelled = true;
                    },
                };
            },
        },
    };

    await assert.rejects(
        readBoundedResponseBody(response, 8, {
            abortController: {
                abort() {
                    aborted = true;
                },
            },
        }),
        /DOWNLOAD_TOO_LARGE/,
    );

    assert.equal(reads, 3);
    assert.equal(cancelled, true);
    assert.equal(aborted, true);
});

test('uses a known-length bounded fallback when response streams are absent', async () => {
    let buffered = false;
    const response = {
        body: null,
        headers: {
            get(name) {
                return name === 'content-length'
                    ? String(tinyPngBytes.length)
                    : null;
            },
        },
        async arrayBuffer() {
            buffered = true;
            return tinyPngBytes.buffer.slice(
                tinyPngBytes.byteOffset,
                tinyPngBytes.byteOffset + tinyPngBytes.byteLength,
            );
        },
    };

    const bytes = await readBoundedResponseBody(
        response,
        tinyPngBytes.length,
    );
    assert.equal(buffered, true);
    assert.deepEqual(Buffer.from(bytes), tinyPngBytes);

    const abortTracker = createAbortTracker();
    await assert.rejects(
        readBoundedResponseBody({
            ...response,
            headers: { get: () => null },
        }, tinyPngBytes.length, {
            abortController: abortTracker,
        }),
        /DOWNLOAD_LENGTH_REQUIRED/,
    );
    assert.equal(abortTracker.calls, 1);
});

test('readBoundedResponseBody cancels and aborts once for early and read failures', async () => {
    for (const scenario of [
        {
            contentLength: 'invalid',
            error: /DOWNLOAD_LENGTH_INVALID/,
        },
        {
            contentLength: '65',
            error: /DOWNLOAD_TOO_LARGE/,
        },
        {
            contentLength: '1',
            readError: new Error('reader exploded'),
            error: /reader exploded/,
        },
    ]) {
        let cancels = 0;
        const abortTracker = createAbortTracker();
        const response = {
            headers: {
                get: () => scenario.contentLength,
            },
            body: {
                getReader() {
                    return {
                        async read() {
                            if (scenario.readError) throw scenario.readError;
                            return { done: true };
                        },
                        async cancel() {
                            cancels += 1;
                        },
                        releaseLock() {},
                    };
                },
            },
        };

        await assert.rejects(
            readBoundedResponseBody(response, 64, {
                abortController: abortTracker,
            }),
            scenario.error,
        );
        assert.equal(cancels, 1);
        assert.equal(abortTracker.calls, 1);
    }
});

test('readBoundedResponseBody leaves successful streams untouched', async () => {
    let cancels = 0;
    const abortTracker = createAbortTracker();
    const response = {
        headers: {
            get: () => String(tinyPngBytes.length),
        },
        body: {
            getReader() {
                let complete = false;
                return {
                    async read() {
                        if (complete) return { done: true };
                        complete = true;
                        return { done: false, value: tinyPngBytes };
                    },
                    async cancel() {
                        cancels += 1;
                    },
                    releaseLock() {},
                };
            },
        },
    };

    await readBoundedResponseBody(
        response,
        tinyPngBytes.length,
        { abortController: abortTracker },
    );

    assert.equal(cancels, 0);
    assert.equal(abortTracker.calls, 0);
});

test('forces browser PNG decoding and closes the decoded bitmap', async () => {
    let closed = false;
    const blob = new Blob([tinyPngBytes], { type: 'image/png' });

    await ensureBrowserDecodablePng(blob, {
        async createImageBitmap() {
            return {
                width: 1,
                height: 1,
                close() {
                    closed = true;
                },
            };
        },
    });

    assert.equal(closed, true);
});

test('falls back to Image decoding and releases its temporary URL', async () => {
    let revoked = '';
    class FakeImage {
        constructor() {
            this.naturalWidth = 1;
            this.naturalHeight = 1;
        }

        set src(value) {
            this.value = value;
            queueMicrotask(() => this.onload());
        }
    }
    const blob = new Blob([tinyPngBytes], { type: 'image/png' });

    await ensureBrowserDecodablePng(blob, {
        Image: FakeImage,
        URL: {
            createObjectURL: () => 'blob:temporary-decode',
            revokeObjectURL: (value) => {
                revoked = value;
            },
        },
    });

    assert.equal(revoked, 'blob:temporary-decode');
});

test('releases the temporary Image URL when browser decoding fails', async () => {
    let revoked = '';
    class BrokenImage {
        set src(value) {
            this.value = value;
            queueMicrotask(() => this.onerror());
        }
    }

    await assert.rejects(
        ensureBrowserDecodablePng(
            new Blob([tinyPngBytes], { type: 'image/png' }),
            {
                Image: BrokenImage,
                URL: {
                    createObjectURL: () => 'blob:failed-decode',
                    revokeObjectURL: (value) => {
                        revoked = value;
                    },
                },
            },
        ),
        /INVALID_PNG/,
    );

    assert.equal(revoked, 'blob:failed-decode');
});

test('returns bounded IHDR metadata for a valid PNG', () => {
    assert.deepEqual(validatePngBytes(tinyPngBytes), {
        width: 1,
        height: 1,
        bitDepth: 8,
        colorType: 4,
        interlace: 0,
    });
});

test('rejects unsafe IHDR dimensions and format combinations', () => {
    for (const invalid of [
        createTestPng({ width: 16385 }),
        createTestPng({ width: 5000, height: 4000 }),
        createTestPng({ bitDepth: 4, colorType: 6 }),
        createTestPng({ colorType: 5 }),
        createTestPng({ compression: 1 }),
        createTestPng({ filter: 1 }),
        createTestPng({ interlace: 2 }),
    ]) {
        assert.throws(() => validatePngBytes(invalid), /INVALID_PNG/);
    }

    const oversizedDataUrl = [
        'data:image/png;base64,',
        createTestPng({ width: 16384, height: 16384 }).toString('base64'),
    ].join('');
    assert.throws(
        () => createDownloadRequest(
            oversizedDataUrl,
            'https://product-swap.example',
            1024,
        ),
        /UNSAFE_DOWNLOAD/,
    );
});

test('aborts and cancels the reader for every response validation failure', async () => {
    const policy = createDownloadRequest(
        '/result.png',
        'https://product-swap.example',
        1024,
    );
    for (const responseOverride of [
        { ok: false },
        { url: 'https://other.example/result.png' },
        { contentType: 'image/jpeg' },
        { contentLength: 'invalid' },
    ]) {
        const { response, state } = createNetworkResponse(responseOverride);
        const abortTracker = createAbortTracker();

        await assert.rejects(
            fetchValidatedPng(policy, {
                fetch: async () => response,
                AbortController: class {
                    constructor() {
                        return abortTracker;
                    }
                },
                Blob,
                ensureBrowserDecodablePng: async () => true,
            }),
            /UNSAFE_DOWNLOAD/,
        );

        assert.equal(abortTracker.calls, 1);
        assert.equal(state.readerCancels, 1);
        assert.equal(state.bodyCancels, 0);
    }
});

test('cancels and aborts exactly once when a stream read throws', async () => {
    const policy = createDownloadRequest(
        '/result.png',
        'https://product-swap.example',
        1024,
    );
    const { response, state } = createNetworkResponse({
        readError: new Error('stream failed'),
    });
    const abortTracker = createAbortTracker();

    await assert.rejects(
        fetchValidatedPng(policy, {
            fetch: async () => response,
            AbortController: class {
                constructor() {
                    return abortTracker;
                }
            },
            Blob,
            ensureBrowserDecodablePng: async () => true,
        }),
        /stream failed/,
    );

    assert.equal(abortTracker.calls, 1);
    assert.equal(state.readerCancels, 1);
});

test('does not abort or cancel a successful network PNG download', async () => {
    const policy = createDownloadRequest(
        '/result.png',
        'https://product-swap.example',
        1024,
    );
    const { response, state } = createNetworkResponse();
    const abortTracker = createAbortTracker();
    let decodes = 0;

    const result = await fetchValidatedPng(policy, {
        fetch: async () => response,
        AbortController: class {
            constructor() {
                return abortTracker;
            }
        },
        Blob,
        ensureBrowserDecodablePng: async () => {
            decodes += 1;
            return true;
        },
    });

    assert.deepEqual(Buffer.from(result.bytes), tinyPngBytes);
    assert.equal(result.png.width, 1);
    assert.equal(result.png.height, 1);
    assert.equal(decodes, 1);
    assert.equal(abortTracker.calls, 0);
    assert.equal(state.readerCancels, 0);
    assert.equal(state.bodyCancels, 0);
});

test('rejects bomb-sized PNG headers before browser decode is called', async () => {
    const oversizedHeaderPng = createTestPng({
        width: 16384,
        height: 16384,
    });
    const policy = createDownloadRequest(
        '/result.png',
        'https://product-swap.example',
        1024,
    );
    const { response, state } = createNetworkResponse({
        bytes: oversizedHeaderPng,
        contentLength: String(oversizedHeaderPng.length),
    });
    const abortTracker = createAbortTracker();
    let decodes = 0;

    await assert.rejects(
        fetchValidatedPng(policy, {
            fetch: async () => response,
            AbortController: class {
                constructor() {
                    return abortTracker;
                }
            },
            Blob,
            ensureBrowserDecodablePng: async () => {
                decodes += 1;
                return true;
            },
        }),
        /INVALID_PNG/,
    );

    assert.equal(decodes, 0);
    assert.equal(abortTracker.calls, 1);
    assert.equal(state.readerCancels, 1);
});

test('aborts and cancels when browser decoding rejects network PNG bytes', async () => {
    const policy = createDownloadRequest(
        '/result.png',
        'https://product-swap.example',
        1024,
    );
    const { response, state } = createNetworkResponse();
    const abortTracker = createAbortTracker();

    await assert.rejects(
        fetchValidatedPng(policy, {
            fetch: async () => response,
            AbortController: class {
                constructor() {
                    return abortTracker;
                }
            },
            Blob,
            ensureBrowserDecodablePng: async () => {
                throw new Error('browser decode failed');
            },
        }),
        /browser decode failed/,
    );

    assert.equal(abortTracker.calls, 1);
    assert.equal(state.readerCancels, 1);
});
