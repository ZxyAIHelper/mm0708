'use strict';

if (typeof importScripts === 'function') {
    importScripts('/local-history.js');
}

const runningTaskIds = new Set();

function isGenerationMessage(value) {
    if (!value || typeof value !== 'object'
        || value.type !== 'product-swap:start'
        || value.version !== 1
        || !/^task_[A-Za-z0-9_-]+$/.test(value.taskId || '')
        || !value.payload || typeof value.payload !== 'object'
        || typeof value.payload.targetImage !== 'string') {
        return false;
    }
    try {
        const url = new URL(value.apiUrl);
        return /^https?:$/.test(url.protocol)
            && url.pathname === '/api/product-swap/generate';
    } catch {
        return false;
    }
}

async function runGenerationMessage(
    message,
    {
        history = globalThis.LocalTaskHistory,
        fetchImpl = globalThis.fetch,
    } = {},
) {
    const request = fetchImpl(message.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(message.payload),
    });
    await history.touchTask(message.taskId);
    try {
        const response = await request;
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !data.imageUrl) {
            const error = new Error(
                data?.error?.message || '图片生成失败',
            );
            error.code = data?.error?.code || 'PROVIDER_REQUEST_FAILED';
            throw error;
        }
        await history.completeTask(message.taskId, {
            imageUrl: data.imageUrl,
            conversationId: data.conversationId || '',
            assistantMessage: data.assistantMessage || '',
        });
    } catch (error) {
        await history.failTask(
            message.taskId,
            error?.code || 'PROVIDER_REQUEST_FAILED',
            error?.message || '图片生成失败',
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
