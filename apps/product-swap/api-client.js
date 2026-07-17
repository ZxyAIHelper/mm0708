'use strict';

const BROWSER_SESSION_KEY = 'product_swap_browser_session';
const BROWSER_SESSION_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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

function createBrowserSession() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function browserSession(config = {}) {
    const storage = config.storage || (
        typeof window !== 'undefined' ? window.localStorage : null
    );
    if (!storage) {
        return '';
    }
    let token = storage.getItem(BROWSER_SESSION_KEY) || '';
    if (!BROWSER_SESSION_PATTERN.test(token)) {
        token = createBrowserSession();
        storage.setItem(BROWSER_SESSION_KEY, token);
    }
    return token;
}

async function apiFetch(path, init = {}, config = {}) {
    const apiBase = config.apiBase === undefined
        ? defaultApiBase()
        : String(config.apiBase).replace(/\/+$/, '');
    const fetchImpl = config.fetchImpl || fetch;
    const headers = new Headers(init.headers || {});
    const session = browserSession(config);
    if (session) {
        headers.set('X-Browser-Session', session);
    }
    return fetchImpl(`${apiBase}${path}`, {
        ...init,
        headers,
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
    const start = () => apiJson(
        '/api/tasks/session',
        { method: 'POST' },
        { ...config, apiBase },
    );
    const locks = config.locks || (
        typeof navigator !== 'undefined' ? navigator.locks : null
    );
    return locks
        ? locks.request('product-swap-session-bootstrap', start)
        : start();
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
    browserSession,
    ensureSession,
    assetUrl,
};

if (typeof window !== 'undefined') {
    window.ProductSwapApi = client;
}

if (typeof module !== 'undefined') {
    module.exports = client;
}
