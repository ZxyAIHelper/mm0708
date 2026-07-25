'use strict';

function resolveApiBase(explicitBase, hostname) {
    if (explicitBase) {
        return String(explicitBase).replace(/\/+$/, '');
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

const client = {
    ApiClientError,
    resolveApiBase,
    apiFetch,
    apiJson,
};

if (typeof window !== 'undefined') {
    window.ProductSwapApi = client;
}

if (typeof module !== 'undefined') {
    module.exports = client;
}
