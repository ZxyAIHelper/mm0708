const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isGenerationMessage,
    normalizeGenerationMessage,
    runGenerationMessage,
    handleGenerationMessage,
    handleCapabilityMessage,
} = require('../generation-worker');

function message(overrides = {}) {
    return {
        type: 'product-swap:start',
        version: 2,
        taskId: 'task_local_1',
        apiUrl: 'https://api.mm0708.top/api/product-swap/generate',
        payload: {
            templateId: 'food-copy-layout',
            targetImage: 'data:image/png;base64,aW1hZ2U=',
            aspectRatio: '3:4',
            showDateTime: true,
            generatedAt: '2026-07-25T10:00:00.000Z',
        },
        ...overrides,
    };
}

test('accepts a version 2 food-copy generation message', () => {
    assert.equal(isGenerationMessage(message()), true);
});

test('rejects a version 2 generation message without a template id', () => {
    assert.equal(isGenerationMessage(message({
        payload: {
            targetImage: 'data:image/png;base64,aW1hZ2U=',
        },
    })), false);
});

test('rejects malformed or unsafe generation messages', () => {
    assert.equal(isGenerationMessage(message({ taskId: '' })), false);
    assert.equal(isGenerationMessage(message({ payload: null })), false);
    assert.equal(isGenerationMessage(message({
        payload: {
            templateId: 'food-copy-layout',
            requirements: 'no image',
        },
    })), false);
    assert.equal(isGenerationMessage(message({
        apiUrl: 'https://evil.example/api/product-swap/generate',
    })), false);
    assert.equal(isGenerationMessage(message({
        apiUrl: 'http://api.mm0708.top/api/product-swap/generate',
    })), false);
});

test('accepts and normalizes a legacy version 1 product-swap message', () => {
    const legacy = message({
        version: 1,
        payload: {
            targetImage: 'data:image/png;base64,aW1hZ2U=',
            productImage: 'data:image/png;base64,cHJvZHVjdA==',
        },
    });

    assert.equal(isGenerationMessage(legacy), true);
    assert.deepEqual(normalizeGenerationMessage(legacy).payload, {
        targetImage: 'data:image/png;base64,aW1hZ2U=',
        productImage: 'data:image/png;base64,cHJvZHVjdA==',
        templateId: 'product-swap',
    });
});

test('strictly rejects arrays, inherited fields, and empty v2 fields', () => {
    const inherited = Object.create({
        templateId: 'food-copy-layout',
        targetImage: 'data:image/png;base64,aW1hZ2U=',
    });
    const inheritedImage = Object.create({
        targetImage: 'data:image/png;base64,aW1hZ2U=',
    });
    inheritedImage.templateId = 'food-copy-layout';

    assert.equal(isGenerationMessage(message({ payload: [] })), false);
    assert.equal(isGenerationMessage(message({ payload: inherited })), false);
    assert.equal(
        isGenerationMessage(message({ payload: inheritedImage })),
        false,
    );
    assert.equal(isGenerationMessage(message({
        payload: {
            templateId: '   ',
            targetImage: 'data:image/png;base64,aW1hZ2U=',
        },
    })), false);
    assert.equal(isGenerationMessage(message({
        payload: {
            templateId: 'food-copy-layout',
            targetImage: '   ',
        },
    })), false);
});

test('accepts a null-prototype v2 payload with own nonempty fields', () => {
    const payload = Object.assign(Object.create(null), {
        templateId: 'food-copy-layout',
        targetImage: 'data:image/png;base64,aW1hZ2U=',
    });

    assert.equal(isGenerationMessage(message({ payload })), true);
});

test('replies to correlated capability requests with v1 and v2 support', () => {
    const replies = [];
    const accepted = handleCapabilityMessage({
        data: {
            type: 'product-swap:capabilities:request',
            requestId: 'cap_request_1',
        },
        source: {
            postMessage: (reply) => replies.push(reply),
        },
    });

    assert.equal(accepted, true);
    assert.deepEqual(replies, [{
        type: 'product-swap:capabilities:response',
        requestId: 'cap_request_1',
        supportedGenerationVersions: [1, 2],
    }]);
});

test('writes a successful generation response to local task history', async () => {
    const calls = [];
    const history = {
        markTaskDispatched: async (taskId) => calls.push([
            'dispatch',
            taskId,
        ]),
        completeTask: async (taskId, result) => calls.push([
            'complete',
            taskId,
            result,
        ]),
        failTask: async () => assert.fail('should not fail'),
    };
    let request;
    await runGenerationMessage(message(), {
        history,
        fetchImpl: async (url, init) => {
            request = { url, init };
            return new Response(JSON.stringify({
                success: true,
                imageUrl: 'https://example.com/result.png',
                conversationId: 'conversation_1',
                assistantMessage: 'done',
            }), { status: 200 });
        },
    });

    assert.equal(request.url, message().apiUrl);
    assert.equal(request.init.credentials, 'include');
    assert.deepEqual(JSON.parse(request.init.body), message().payload);
    assert.equal(calls[0][0], 'dispatch');
    assert.equal(calls[1][0], 'complete');
    assert.equal(calls[1][2].imageUrl, 'https://example.com/result.png');
});

test('deduplicates an already running local task', async () => {
    let release;
    let requests = 0;
    const fetchImpl = () => {
        requests += 1;
        return new Promise((resolve) => {
            release = () => resolve(new Response(JSON.stringify({
                success: true,
                imageUrl: 'https://example.com/result.png',
            })));
        });
    };
    const history = {
        markTaskDispatched: async () => undefined,
        completeTask: async () => undefined,
        failTask: async () => undefined,
    };
    const promises = [];
    const first = handleGenerationMessage({
        data: message(),
        waitUntil: (promise) => promises.push(promise),
    }, { history, fetchImpl });
    const second = handleGenerationMessage({
        data: message(),
        waitUntil: (promise) => promises.push(promise),
    }, { history, fetchImpl });

    assert.equal(first, true);
    assert.equal(second, false);
    await Promise.resolve();
    assert.equal(requests, 1);
    release();
    await Promise.all(promises);
});

test('marks the local task failed when fetch cannot start', async () => {
    let failure;
    await runGenerationMessage(message(), {
        history: {
            markTaskDispatched: async () => undefined,
            completeTask: async () => assert.fail('should not complete'),
            failTask: async (taskId, code, errorMessage) => {
                failure = { taskId, code, errorMessage };
            },
        },
        fetchImpl: () => {
            throw new Error('network unavailable');
        },
    });

    assert.deepEqual(failure, {
        taskId: 'task_local_1',
        code: 'PROVIDER_REQUEST_FAILED',
        errorMessage: 'network unavailable',
    });
});

test('does not start a billable request when dispatch persistence fails', async () => {
    let requests = 0;
    await assert.rejects(
        runGenerationMessage(message(), {
            history: {
                markTaskDispatched: async () => {
                    throw new Error('indexeddb unavailable');
                },
                completeTask: async () => undefined,
                completeTaskMetadata: async () => undefined,
                failTask: async () => undefined,
            },
            fetchImpl: async () => {
                requests += 1;
                return new Response('{}');
            },
        }),
        /indexeddb unavailable/,
    );
    assert.equal(requests, 0);
});

test('falls back to metadata completion without marking a billed task failed', async () => {
    const calls = [];
    await runGenerationMessage(message(), {
        history: {
            markTaskDispatched: async () => undefined,
            completeTask: async () => {
                throw new Error('asset quota exceeded');
            },
            completeTaskMetadata: async (taskId, result) => {
                calls.push(['metadata', taskId, result.imageUrl]);
            },
            failTask: async () => calls.push(['failed']),
        },
        fetchImpl: async () => new Response(JSON.stringify({
            success: true,
            imageUrl: 'https://example.com/result.png',
        })),
    });

    assert.deepEqual(calls, [[
        'metadata',
        'task_local_1',
        'https://example.com/result.png',
    ]]);
});

test('keeps a local success receipt when both IndexedDB completions fail', async () => {
    const calls = [];
    await runGenerationMessage(message(), {
        history: {
            markTaskDispatched: async () => undefined,
            storeGenerationReceipt: async (taskId, result) => {
                calls.push(['receipt', taskId, result.imageUrl]);
            },
            deleteGenerationReceipt: async () => {
                calls.push(['delete-receipt']);
            },
            completeTask: async () => {
                throw new Error('quota');
            },
            completeTaskMetadata: async () => {
                throw new Error('quota');
            },
            failTask: async () => calls.push(['failed']),
        },
        fetchImpl: async () => new Response(JSON.stringify({
            success: true,
            imageUrl: 'https://example.com/result.png',
        })),
    });

    assert.deepEqual(calls, [[
        'receipt',
        'task_local_1',
        'https://example.com/result.png',
    ]]);
});
