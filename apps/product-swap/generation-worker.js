'use strict';

if (typeof importScripts === 'function') {
    importScripts('/local-history.js');
}

const runningTaskIds = new Set();
const PRODUCTION_API_ORIGIN = 'https://api.mm0708.top';
const SUPPORTED_GENERATION_VERSIONS = [1, 2];

function isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isAllowedApiUrl(apiUrl, workerOrigin = globalThis.location?.origin) {
    try {
        const url = new URL(apiUrl);
        if (url.pathname !== '/api/product-swap/generate') {
            return false;
        }
        if (url.origin === PRODUCTION_API_ORIGIN) {
            return url.protocol === 'https:';
        }
        if (!workerOrigin || url.origin !== workerOrigin) {
            return false;
        }
        return url.protocol === 'https:'
            || (url.protocol === 'http:'
                && (url.hostname === 'localhost'
                    || url.hostname === '127.0.0.1'));
    } catch {
        return false;
    }
}

function normalizeGenerationMessage(value, workerOrigin) {
    if (!value || typeof value !== 'object'
        || value.type !== 'product-swap:start'
        || !/^task_[A-Za-z0-9_-]+$/.test(value.taskId || '')
        || !isPlainRecord(value.payload)
        || !isAllowedApiUrl(value.apiUrl, workerOrigin)) {
        return null;
    }
    const payload = value.payload;
    if (value.version === 1) {
        if (!Object.hasOwn(payload, 'targetImage')
            || typeof payload.targetImage !== 'string'
            || !payload.targetImage.trim()) {
            return null;
        }
        let templateId = 'product-swap';
        if (Object.hasOwn(payload, 'templateId')) {
            if (typeof payload.templateId !== 'string') {
                return null;
            }
            templateId = payload.templateId.trim() || templateId;
        }
        return {
            ...value,
            payload: {
                ...payload,
                templateId,
            },
        };
    }
    if (value.version !== 2
        || !Object.hasOwn(payload, 'templateId')
        || typeof payload.templateId !== 'string'
        || !payload.templateId.trim()
        || !Object.keys(payload).some((key) => (
            key.endsWith('Image')
            && typeof payload[key] === 'string'
            && Boolean(payload[key].trim())
        ))) {
        return null;
    }
    return {
        ...value,
        payload: { ...payload },
    };
}

function isGenerationMessage(value, workerOrigin) {
    return Boolean(normalizeGenerationMessage(value, workerOrigin));
}

function handleCapabilityMessage(event) {
    const message = event?.data;
    if (!message
        || message.type !== 'product-swap:capabilities:request'
        || typeof message.requestId !== 'string'
        || !message.requestId.trim()
        || typeof event.source?.postMessage !== 'function') {
        return false;
    }
    event.source.postMessage({
        type: 'product-swap:capabilities:response',
        requestId: message.requestId,
        supportedGenerationVersions: [
            ...SUPPORTED_GENERATION_VERSIONS,
        ],
    });
    return true;
}

async function runGenerationMessage(
    message,
    {
        history = globalThis.LocalTaskHistory,
        fetchImpl = globalThis.fetch,
    } = {},
) {
    await history.markTaskDispatched(message.taskId);
    let data;
    try {
        const response = await fetchImpl(message.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(message.payload),
        });
        data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !data.imageUrl) {
            const error = new Error(
                data?.error?.message || '图片生成失败',
            );
            error.code = data?.error?.code || 'PROVIDER_REQUEST_FAILED';
            throw error;
        }
    } catch (error) {
        await history.failTask(
            message.taskId,
            error?.code || 'PROVIDER_REQUEST_FAILED',
            error?.message || '图片生成失败',
        );
        return;
    }

    const result = {
        imageUrl: data.imageUrl,
        conversationId: data.conversationId || '',
        assistantMessage: data.assistantMessage || '',
    };
    let receiptStored = false;
    if (history.storeGenerationReceipt) {
        try {
            await history.storeGenerationReceipt(message.taskId, result);
            receiptStored = true;
        } catch {
            // IndexedDB remains the primary local persistence path.
        }
    }
    let persisted = false;
    try {
        await history.completeTask(message.taskId, result);
        persisted = true;
    } catch {
        try {
            await history.completeTaskMetadata(message.taskId, result);
            persisted = true;
        } catch {
            // Keep the success receipt so the page can recover without retrying.
        }
    }
    if (persisted && receiptStored && history.deleteGenerationReceipt) {
        await history.deleteGenerationReceipt(message.taskId).catch(
            () => undefined,
        );
    }
}

function handleGenerationMessage(event, dependencies) {
    const message = normalizeGenerationMessage(event?.data);
    if (!message
        || runningTaskIds.has(message.taskId)) {
        return false;
    }
    runningTaskIds.add(message.taskId);
    event.source?.postMessage?.({
        type: 'product-swap:start:ack',
        taskId: message.taskId,
        version: message.version,
    });
    const work = runGenerationMessage(message, dependencies)
        .finally(() => runningTaskIds.delete(message.taskId));
    event.waitUntil(work);
    return true;
}

if (typeof globalThis.addEventListener === 'function'
    && typeof importScripts === 'function') {
    globalThis.addEventListener('message', (event) => {
        if (!handleCapabilityMessage(event)) {
            handleGenerationMessage(event);
        }
    });
}

if (typeof module !== 'undefined') {
    module.exports = {
        isGenerationMessage,
        normalizeGenerationMessage,
        runGenerationMessage,
        handleGenerationMessage,
        handleCapabilityMessage,
    };
}
