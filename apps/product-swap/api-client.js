'use strict';

function resolveApiBase(explicitBase, hostname) {
    if (explicitBase) {
        return String(explicitBase).replace(/\/+$/, '');
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return '';
    }
    return 'https://api.mm0708.top';
}
class ApiClientError extends Error {
    constructor(code, message, status) {
        super(message);
        this.name = 'ApiClientError';
        this.code = code;
        this.status = status;
    }
}

function defaultApiBase() {
    if (typeof window === 'undefined') {
        return '';
    }
    return resolveApiBase(
        window.API_BASE_URL || '',
        window.location.hostname,
    );
}

async function apiFetch(path, init = {}, config = {}) {
    const apiBase = config.apiBase === undefined
        ? defaultApiBase()
        : String(config.apiBase).replace(/\/+$/, '');
    const fetchImpl = config.fetchImpl || fetch;
    return fetchImpl(`${apiBase}${path}`, {
        ...init,
        credentials: 'include',
    });
}

async function apiJson(path, init = {}, config = {}) {
    const response = await apiFetch(path, init, config);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiClientError(
            data?.error?.code || 'REQUEST_FAILED',
            data?.error?.message || '请求失败，请稍后重试',
            response.status,
        );
    }
    return data;
}

function ensureSession(apiBase, config = {}) {
    return apiJson('/api/tasks/session', { method: 'POST' }, {
        ...config,
        apiBase,
    });
}

function assetUrl(apiBase, taskId, assetId) {
    const base = String(apiBase || '').replace(/\/+$/, '');
    return `${base}/api/tasks/${encodeURIComponent(taskId)}`
        + `/assets/${encodeURIComponent(assetId)}`;
}

const client = {
    ApiClientError,
    resolveApiBase,
    apiFetch,
    apiJson,
    ensureSession,
    assetUrl,
};

if (typeof window !== 'undefined') {
    window.ProductSwapApi = client;
}

if (typeof module !== 'undefined') {
    module.exports = client;
}
