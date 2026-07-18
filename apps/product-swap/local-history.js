'use strict';

const DB_NAME = 'product_swap_history_v1';
const DB_VERSION = 1;
const USER_KEY = 'product_swap_local_user_id';
const ASSET_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PROCESSING_STALE_MS = 15 * 60 * 1000;

function randomId(prefix) {
    const value = globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return `${prefix}_${value}`;
}

function taskTitle(taskType) {
    return taskType === 'product_swap'
        ? '一键换产品'
        : 'AI 生成任务';
}

function isExpired(asset, now = Date.now()) {
    return Boolean(asset?.deletedAt)
        || !asset?.expiresAt
        || Number(asset.expiresAt) <= now;
}

function dataUrlToBlob(source) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/
        .exec(source);
    if (!match) {
        throw new Error('INVALID_IMAGE');
    }
    const binary = atob(match[2].replace(/[\r\n]/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: match[1].toLowerCase() });
}

function ensureUserId(storage = globalThis.localStorage) {
    let userId = storage.getItem(USER_KEY) || '';
    if (!/^local_[A-Za-z0-9_-]{8,}$/.test(userId)) {
        userId = randomId('local');
        storage.setItem(USER_KEY, userId);
    }
    return userId;
}

function requestValue(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

let databasePromise;
function openDatabase() {
    if (!globalThis.indexedDB) {
        return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'));
    }
    if (!databasePromise) {
        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains('tasks')) {
                    const tasks = database.createObjectStore('tasks', {
                        keyPath: 'id',
                    });
                    tasks.createIndex('createdAt', 'createdAt');
                    tasks.createIndex('taskType', 'taskType');
                }
                if (!database.objectStoreNames.contains('assets')) {
                    const assets = database.createObjectStore('assets', {
                        keyPath: 'id',
                    });
                    assets.createIndex('taskId', 'taskId');
                    assets.createIndex('expiresAt', 'expiresAt');
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    return databasePromise;
}

function assetFromSource(taskId, role, source, createdAt) {
    const common = {
        id: randomId('asset'),
        taskId,
        role,
        createdAt,
        expiresAt: createdAt + ASSET_TTL_MS,
        deletedAt: null,
    };
    if (source.startsWith('data:')) {
        const blob = dataUrlToBlob(source);
        return {
            ...common,
            blob,
            sourceUrl: '',
            contentType: blob.type,
            byteSize: blob.size,
        };
    }
    return {
        ...common,
        blob: null,
        sourceUrl: source,
        contentType: '',
        byteSize: 0,
    };
}

function previewAssetFromAsset(asset) {
    if (!asset) {
        return null;
    }
    const { blob, ...preview } = asset;
    return preview;
}

function isStaleProcessingTask(task, now = Date.now()) {
    const lastActivity = Number(task?.updatedAt || task?.createdAt || 0);
    return task?.status === 'processing'
        && lastActivity + PROCESSING_STALE_MS <= now;
}

async function startTask({
    taskType = 'product_swap',
    title = taskTitle(taskType),
    input = {},
    images = [],
}) {
    const database = await openDatabase();
    const createdAt = Date.now();
    const task = {
        id: randomId('task'),
        userId: ensureUserId(),
        taskType,
        status: 'processing',
        title,
        input,
        result: null,
        errorCode: null,
        errorMessage: null,
        createdAt,
        updatedAt: createdAt,
        completedAt: null,
        previewAsset: null,
    };
    const assets = images
        .filter((image) => image?.source)
        .map((image) => assetFromSource(
            task.id,
            image.role,
            image.source,
            createdAt,
        ));
    const transaction = database.transaction(
        ['tasks', 'assets'],
        'readwrite',
    );
    transaction.objectStore('tasks').put(task);
    for (const asset of assets) {
        transaction.objectStore('assets').put(asset);
    }
    await transactionDone(transaction);
    return task;
}

async function updateTask(taskId, updater) {
    const database = await openDatabase();
    const transaction = database.transaction('tasks', 'readwrite');
    const store = transaction.objectStore('tasks');
    const done = transactionDone(transaction);
    const task = await requestValue(store.get(taskId));
    if (!task) {
        transaction.abort();
        throw new Error('TASK_NOT_FOUND');
    }
    const updated = { ...updater(task), updatedAt: Date.now() };
    store.put(updated);
    await done;
    return updated;
}

async function completeTask(taskId, result) {
    const completedAt = Date.now();
    const outputAsset = result?.imageUrl
        ? assetFromSource(taskId, 'output', result.imageUrl, completedAt)
        : null;
    const database = await openDatabase();
    const transaction = database.transaction(
        ['tasks', 'assets'],
        'readwrite',
    );
    const done = transactionDone(transaction);
    const taskStore = transaction.objectStore('tasks');
    const current = await requestValue(taskStore.get(taskId));
    if (!current) {
        transaction.abort();
        throw new Error('TASK_NOT_FOUND');
    }
    const task = {
        ...current,
        status: 'completed',
        result,
        errorCode: null,
        errorMessage: null,
        updatedAt: completedAt,
        completedAt,
        previewAsset: previewAssetFromAsset(outputAsset),
    };
    if (outputAsset) {
        transaction.objectStore('assets').put(outputAsset);
    }
    taskStore.put(task);
    await done;
    return task;
}

function failTask(taskId, code, message) {
    return updateTask(taskId, (task) => ({
        ...task,
        status: 'failed',
        errorCode: code || 'GENERATION_FAILED',
        errorMessage: String(message || '生成失败').slice(0, 500),
        completedAt: Date.now(),
    }));
}

async function assetsForTask(database, taskId) {
    const transaction = database.transaction('assets', 'readonly');
    return requestValue(
        transaction.objectStore('assets').index('taskId').getAll(taskId),
    );
}

async function getTask(taskId) {
    const database = await openDatabase();
    const transaction = database.transaction('tasks', 'readonly');
    const task = await requestValue(
        transaction.objectStore('tasks').get(taskId),
    );
    if (!task || task.userId !== ensureUserId()) {
        return null;
    }
    return { ...task, assets: await assetsForTask(database, taskId) };
}

async function listTasks({ taskType = '', cursor, limit = 30 } = {}) {
    const database = await openDatabase();
    const transaction = database.transaction('tasks', 'readonly');
    const all = await requestValue(
        transaction.objectStore('tasks').getAll(),
    );
    const userId = ensureUserId();
    const filtered = all
        .filter((task) => task.userId === userId)
        .filter((task) => !taskType || task.taskType === taskType)
        .sort((left, right) => right.createdAt - left.createdAt
            || right.id.localeCompare(left.id));
    const offset = Math.max(0, Number(cursor) || 0);
    const tasks = filtered.slice(offset, offset + limit);
    return {
        tasks,
        nextCursor: offset + tasks.length < filtered.length
            ? String(offset + tasks.length)
            : null,
    };
}

function selectLatestProcessingTask(tasks, userId, taskType = 'product_swap') {
    return tasks
        .filter((task) => task.userId === userId)
        .filter((task) => task.taskType === taskType)
        .filter((task) => task.status === 'processing')
        .sort((left, right) => right.createdAt - left.createdAt
            || right.id.localeCompare(left.id))[0]
        || null;
}

async function latestProcessingTask(taskType = 'product_swap') {
    const database = await openDatabase();
    const transaction = database.transaction('tasks', 'readonly');
    const tasks = await requestValue(
        transaction.objectStore('tasks').getAll(),
    );
    return selectLatestProcessingTask(tasks, ensureUserId(), taskType);
}

async function touchTask(taskId, updatedAt = Date.now()) {
    const database = await openDatabase();
    const transaction = database.transaction('tasks', 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore('tasks');
    const task = await requestValue(store.get(taskId));
    if (!task) {
        transaction.abort();
        throw new Error('TASK_NOT_FOUND');
    }
    const updated = { ...task, updatedAt };
    store.put(updated);
    await done;
    return updated;
}

function deleteKeysFromIndex(index, range, store) {
    return new Promise((resolve, reject) => {
        const request = index.openKeyCursor(range);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve();
                return;
            }
            store.delete(cursor.primaryKey);
            cursor.continue();
        };
    });
}

async function deleteTask(taskId) {
    const database = await openDatabase();
    const transaction = database.transaction(
        ['tasks', 'assets'],
        'readwrite',
    );
    const done = transactionDone(transaction);
    const taskStore = transaction.objectStore('tasks');
    const task = await requestValue(taskStore.get(taskId));
    if (!task || task.userId !== ensureUserId()) {
        transaction.abort();
        await done.catch(() => undefined);
        return false;
    }
    taskStore.delete(taskId);
    const assetStore = transaction.objectStore('assets');
    await deleteKeysFromIndex(
        assetStore.index('taskId'),
        IDBKeyRange.only(taskId),
        assetStore,
    );
    await done;
    return true;
}

async function cleanupExpiredAssets(now = Date.now()) {
    const database = await openDatabase();
    const transaction = database.transaction(
        ['tasks', 'assets'],
        'readwrite',
    );
    const taskStore = transaction.objectStore('tasks');
    const store = transaction.objectStore('assets');
    const done = transactionDone(transaction);
    let cleaned = 0;
    await new Promise((resolve, reject) => {
        const cursorRequest = store.index('expiresAt').openKeyCursor(
            IDBKeyRange.upperBound(now),
        );
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
                resolve();
                return;
            }
            const assetRequest = store.get(cursor.primaryKey);
            assetRequest.onerror = () => reject(assetRequest.error);
            assetRequest.onsuccess = () => {
                const asset = assetRequest.result;
                if (asset && !asset.deletedAt) {
                    store.put({
                        ...asset,
                        blob: null,
                        sourceUrl: '',
                        deletedAt: now,
                    });
                    cleaned += 1;
                    if (asset.role === 'output') {
                        const taskRequest = taskStore.get(asset.taskId);
                        taskRequest.onerror = () => reject(taskRequest.error);
                        taskRequest.onsuccess = () => {
                            const task = taskRequest.result;
                            if (task?.previewAsset?.id === asset.id) {
                                taskStore.put({
                                    ...task,
                                    result: task.result
                                        ? { ...task.result, imageUrl: '' }
                                        : task.result,
                                    previewAsset: {
                                        ...task.previewAsset,
                                        sourceUrl: '',
                                        deletedAt: now,
                                    },
                                });
                            }
                            cursor.continue();
                        };
                        return;
                    }
                }
                cursor.continue();
            };
        };
    });
    await done;
    return cleaned;
}

async function recoverInterruptedTasks(now = Date.now()) {
    const database = await openDatabase();
    const transaction = database.transaction('tasks', 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore('tasks');
    const tasks = await requestValue(store.getAll());
    let recovered = 0;
    for (const task of tasks) {
        if (task.userId === ensureUserId()
            && isStaleProcessingTask(task, now)) {
            store.put({
                ...task,
                status: 'failed',
                errorCode: 'GENERATION_INTERRUPTED',
                errorMessage: '页面关闭或刷新，生成任务已中断',
                updatedAt: now,
                completedAt: now,
            });
            recovered += 1;
        }
    }
    await done;
    return recovered;
}

const localHistory = {
    ASSET_TTL_MS,
    PROCESSING_STALE_MS,
    taskTitle,
    isExpired,
    dataUrlToBlob,
    ensureUserId,
    previewAssetFromAsset,
    isStaleProcessingTask,
    startTask,
    completeTask,
    failTask,
    listTasks,
    selectLatestProcessingTask,
    latestProcessingTask,
    touchTask,
    getTask,
    deleteTask,
    cleanupExpiredAssets,
    recoverInterruptedTasks,
};

globalThis.LocalTaskHistory = localHistory;
if (typeof module !== 'undefined') {
    module.exports = localHistory;
}
