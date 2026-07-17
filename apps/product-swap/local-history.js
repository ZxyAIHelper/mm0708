'use strict';

const DB_NAME = 'product_swap_history_v1';
const DB_VERSION = 1;
const USER_KEY = 'product_swap_local_user_id';
const ASSET_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
        completedAt: null,
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
    return { ...task, assets };
}

async function updateTask(taskId, updater) {
    const database = await openDatabase();
    const transaction = database.transaction('tasks', 'readwrite');
    const store = transaction.objectStore('tasks');
    const task = await requestValue(store.get(taskId));
    if (!task) {
        transaction.abort();
        throw new Error('TASK_NOT_FOUND');
    }
    const updated = updater(task);
    store.put(updated);
    await transactionDone(transaction);
    return updated;
}

async function completeTask(taskId, result) {
    const completedAt = Date.now();
    const task = await updateTask(taskId, (current) => ({
        ...current,
        status: 'completed',
        result,
        errorCode: null,
        errorMessage: null,
        completedAt,
    }));
    if (result?.imageUrl) {
        const database = await openDatabase();
        const transaction = database.transaction('assets', 'readwrite');
        transaction.objectStore('assets').put(assetFromSource(
            taskId,
            'output',
            result.imageUrl,
            completedAt,
        ));
        await transactionDone(transaction);
    }
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
    const selected = filtered.slice(offset, offset + limit);
    const tasks = await Promise.all(selected.map(async (task) => {
        const assets = await assetsForTask(database, task.id);
        const previewAsset = [...assets].reverse()
            .find((asset) => asset.role === 'output')
            || assets.find((asset) => asset.role === 'target')
            || null;
        return { ...task, previewAsset };
    }));
    return {
        tasks,
        nextCursor: offset + selected.length < filtered.length
            ? String(offset + selected.length)
            : null,
    };
}

async function deleteTask(taskId) {
    const task = await getTask(taskId);
    if (!task) {
        return false;
    }
    const database = await openDatabase();
    const transaction = database.transaction(
        ['tasks', 'assets'],
        'readwrite',
    );
    transaction.objectStore('tasks').delete(taskId);
    for (const asset of task.assets) {
        transaction.objectStore('assets').delete(asset.id);
    }
    await transactionDone(transaction);
    return true;
}

async function cleanupExpiredAssets(now = Date.now()) {
    const database = await openDatabase();
    const transaction = database.transaction('assets', 'readwrite');
    const store = transaction.objectStore('assets');
    const assets = await requestValue(store.getAll());
    let cleaned = 0;
    for (const asset of assets) {
        if (!asset.deletedAt && Number(asset.expiresAt) <= now) {
            store.put({ ...asset, blob: null, sourceUrl: '', deletedAt: now });
            cleaned += 1;
        }
    }
    await transactionDone(transaction);
    return cleaned;
}

const localHistory = {
    ASSET_TTL_MS,
    taskTitle,
    isExpired,
    dataUrlToBlob,
    ensureUserId,
    startTask,
    completeTask,
    failTask,
    listTasks,
    getTask,
    deleteTask,
    cleanupExpiredAssets,
};

if (typeof window !== 'undefined') {
    window.LocalTaskHistory = localHistory;
}
if (typeof module !== 'undefined') {
    module.exports = localHistory;
}
