const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isGenerationMessage,
    runGenerationMessage,
    handleGenerationMessage,
} = require('../generation-worker');

function message(overrides = {}) {
    return {
        type: 'product-swap:start',
        version: 1,
        taskId: 'task_local_1',
        apiUrl: 'https://api.mm0708.top/api/product-swap/generate',
        payload: { targetImage: 'data:image/png;base64,aW1hZ2U=' },
        ...overrides,
    };
}

test('accepts only the versioned product-swap generation message', () => {
    assert.equal(isGenerationMessage(message()), true);
    assert.equal(isGenerationMessage(message({ version: 2 })), false);
    assert.equal(isGenerationMessage(message({ taskId: '' })), false);
    assert.equal(isGenerationMessage(message({ payload: null })), false);
});

test('writes a successful generation response to local task history', async () => {
    const calls = [];
    const history = {
        touchTask: async (taskId) => calls.push(['touch', taskId]),
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
    assert.equal(calls[0][0], 'touch');
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
        touchTask: async () => undefined,
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
    assert.equal(requests, 1);
    release();
    await Promise.all(promises);
});

test('marks the local task failed when fetch cannot start', async () => {
    let failure;
    await runGenerationMessage(message(), {
        history: {
            touchTask: async () => undefined,
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
