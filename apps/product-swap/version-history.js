(function (global) {
    'use strict';

    const MAX_MESSAGES = 6;
    const MAX_MESSAGE_CONTENT = 2000;
    const DEFAULT_MAX_ENTRIES = 20;
    const DEFAULT_MAX_ESTIMATED_BYTES = 64 * 1024 * 1024;
    const DEFAULT_MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
    const CANONICAL_BASE64 =
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    const BASE64_ALPHABET =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    function unsafeDownload() {
        throw new Error('UNSAFE_DOWNLOAD');
    }

    function decodedBase64Bytes(base64) {
        const padding = base64.endsWith('==')
            ? 2
            : (base64.endsWith('=') ? 1 : 0);
        return (base64.length / 4) * 3 - padding;
    }

    function hasCanonicalPaddingBits(base64) {
        if (base64.endsWith('==')) {
            return BASE64_ALPHABET.indexOf(base64.at(-3)) % 16 === 0;
        }
        if (base64.endsWith('=')) {
            return BASE64_ALPHABET.indexOf(base64.at(-2)) % 4 === 0;
        }
        return true;
    }

    function createDownloadRequest(
        imageUrl,
        origin,
        maxBytes = DEFAULT_MAX_DOWNLOAD_BYTES,
    ) {
        const value = String(imageUrl || '');
        const boundedMax = Number.isFinite(maxBytes) && maxBytes > 0
            ? maxBytes
            : DEFAULT_MAX_DOWNLOAD_BYTES;
        const dataPrefix = 'data:image/png;base64,';
        if (value.startsWith('data:')) {
            if (!value.startsWith(dataPrefix)) unsafeDownload();
            const base64 = value.slice(dataPrefix.length);
            if (
                !base64
                || !CANONICAL_BASE64.test(base64)
                || !hasCanonicalPaddingBits(base64)
                || decodedBase64Bytes(base64) > boundedMax
            ) {
                unsafeDownload();
            }
            return {
                kind: 'data',
                url: value,
                maxBytes: boundedMax,
                fetchOptions: undefined,
            };
        }

        let originUrl;
        let resolved;
        try {
            originUrl = new URL(origin);
            resolved = new URL(value, originUrl);
        } catch {
            unsafeDownload();
        }
        if (
            !['http:', 'https:'].includes(originUrl.protocol)
            || !['http:', 'https:'].includes(resolved.protocol)
            || resolved.origin !== originUrl.origin
            || resolved.username
            || resolved.password
        ) {
            unsafeDownload();
        }
        return {
            kind: 'network',
            url: resolved.href,
            maxBytes: boundedMax,
            fetchOptions: {
                credentials: 'omit',
                redirect: 'error',
                referrerPolicy: 'no-referrer',
            },
        };
    }

    function validateDownloadResponse(policy, response) {
        if (!policy || response?.ok !== true) unsafeDownload();
        if (policy.kind === 'data') {
            if (response.url !== policy.url) unsafeDownload();
        } else {
            let requested;
            let finalUrl;
            try {
                requested = new URL(policy.url);
                finalUrl = new URL(response.url);
            } catch {
                unsafeDownload();
            }
            if (
                !['http:', 'https:'].includes(finalUrl.protocol)
                || finalUrl.origin !== requested.origin
                || finalUrl.username
                || finalUrl.password
            ) {
                unsafeDownload();
            }
        }

        const contentType = String(response.contentType || '')
            .split(';', 1)[0]
            .trim()
            .toLowerCase();
        if (contentType !== 'image/png') unsafeDownload();

        const contentLength = response.contentLength;
        if (
            contentLength !== null
            && contentLength !== undefined
            && contentLength !== ''
        ) {
            const value = String(contentLength);
            if (
                !/^\d+$/.test(value)
                || Number(value) > policy.maxBytes
            ) {
                unsafeDownload();
            }
        }

        if (response.blobSize !== undefined) {
            if (
                !Number.isInteger(response.blobSize)
                || response.blobSize <= 0
                || response.blobSize > policy.maxBytes
            ) {
                unsafeDownload();
            }
        }
        return true;
    }

    function utf8Length(value) {
        let bytes = 0;
        for (const character of String(value)) {
            const codePoint = character.codePointAt(0);
            if (codePoint <= 0x7f) bytes += 1;
            else if (codePoint <= 0x7ff) bytes += 2;
            else if (codePoint <= 0xffff) bytes += 3;
            else bytes += 4;
        }
        return bytes;
    }

    function estimatedVersionBytes(version) {
        return utf8Length(JSON.stringify(version));
    }

    function copyMessages(messages) {
        return Array.isArray(messages)
            ? messages.slice(-MAX_MESSAGES).map((message) => ({
                role: String(message?.role || '').slice(0, 32),
                content: String(message?.content || '')
                    .slice(0, MAX_MESSAGE_CONTENT),
            }))
            : [];
    }

    function copyVersion(version) {
        return version ? {
            id: version.id,
            imageUrl: version.imageUrl,
            instruction: version.instruction,
            createdAt: version.createdAt,
            baseVersionId: version.baseVersionId,
            conversationId: version.conversationId,
            messages: copyMessages(version.messages),
            sourceTaskId: version.sourceTaskId,
        } : null;
    }

    function findVersionIndexByIdentity(versions, candidate) {
        if (!Array.isArray(versions) || !candidate) return -1;
        if (candidate.id) {
            const versionIndex = versions.findIndex(
                (version) => version.id === candidate.id,
            );
            if (versionIndex >= 0) return versionIndex;
        }
        if (candidate.sourceTaskId) {
            return versions.findIndex(
                (version) => (
                    version.sourceTaskId === candidate.sourceTaskId
                ),
            );
        }
        return -1;
    }

    function createVersionHistory(options = {}) {
        const versions = [];
        let selectedIndex = -1;
        let nextId = 1;
        const maxEntries = Number.isInteger(options.maxEntries)
            && options.maxEntries > 0
            ? options.maxEntries
            : DEFAULT_MAX_ENTRIES;
        const maxEstimatedBytes = Number.isFinite(
            options.maxEstimatedBytes,
        ) && options.maxEstimatedBytes > 0
            ? options.maxEstimatedBytes
            : DEFAULT_MAX_ESTIMATED_BYTES;

        function evictOldest() {
            while (
                versions.length > 1
                && (
                    versions.length > maxEntries
                    || versions.reduce(
                        (total, version) => (
                            total + estimatedVersionBytes(version)
                        ),
                        0,
                    ) > maxEstimatedBytes
                )
            ) {
                versions.shift();
                selectedIndex -= 1;
            }
        }

        function add(input) {
            const version = {
                id: `version-${nextId++}`,
                imageUrl: String(input.imageUrl || ''),
                instruction: String(input.instruction || ''),
                createdAt: Date.now(),
                baseVersionId: input.baseVersionId
                    ? String(input.baseVersionId)
                    : null,
                conversationId: String(input.conversationId || ''),
                messages: copyMessages(input.messages),
                sourceTaskId: input.sourceTaskId
                    ? String(input.sourceTaskId)
                    : null,
            };
            versions.push(version);
            selectedIndex = versions.length - 1;
            evictOldest();
            return copyVersion(version);
        }

        function list() {
            return versions.map(copyVersion);
        }

        function current() {
            return copyVersion(versions[selectedIndex]);
        }

        function select(index) {
            if (
                !Number.isInteger(index)
                || index < 0
                || index >= versions.length
            ) {
                return null;
            }
            selectedIndex = index;
            return current();
        }

        function restore(index) {
            if (
                !Number.isInteger(index)
                || index < 0
                || index >= versions.length
            ) {
                return null;
            }
            const selected = versions[index];
            return add({
                ...selected,
                instruction: `恢复版本 ${index + 1}`,
                baseVersionId: selected.id,
                sourceTaskId: null,
            });
        }

        return {
            add,
            list,
            current,
            select,
            restore,
        };
    }

    const versionHistory = {
        createVersionHistory,
        createDownloadRequest,
        findVersionIndexByIdentity,
        validateDownloadResponse,
    };
    global.VersionHistory = versionHistory;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = versionHistory;
    }
}(globalThis));
