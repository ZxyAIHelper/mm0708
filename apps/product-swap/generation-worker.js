'use strict';

if (typeof importScripts === 'function') {
    importScripts('/local-history.js');
}

const runningTaskIds = new Set();
const PRODUCTION_API_ORIGIN = 'https://api.mm0708.top';

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

function isGenerationMessage(value, workerOrigin) {
    if (!value || typeof value !== 'object'
        || value.type !== 'product-swap:start'
        || value.version !== 1
        || !/^task_[A-Za-z0-9_-]+$/.test(value.taskId || '')
        || !value.payload || typeof value.payload !== 'object'
        || typeof value.payload.targetImage !== 'string') {
        return false;
    }
    return isAllowedApiUrl(value.apiUrl, workerOrigin);
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
    const message = event?.data;
    if (!isGenerationMessage(message)
        || runningTaskIds.has(message.taskId)) {
        return false;
    }
    runningTaskIds.add(message.taskId);
    const work = runGenerationMessage(message, dependencies)
        .finally(() => runningTaskIds.delete(message.taskId));
    event.waitUntil(work);
    return true;
}

if (typeof globalThis.addEventListener === 'function'
    && typeof importScripts === 'function') {
    globalThis.addEventListener('message', handleGenerationMessage);
}

if (typeof module !== 'undefined') {
    module.exports = {
        isGenerationMessage,
        runGenerationMessage,
        handleGenerationMessage,
    };
}
