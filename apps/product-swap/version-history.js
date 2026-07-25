(function (global) {
    'use strict';

    const MAX_MESSAGES = 6;
    const MAX_MESSAGE_CONTENT = 2000;
    const DEFAULT_MAX_ENTRIES = 20;
    const DEFAULT_MAX_ESTIMATED_BYTES = 64 * 1024 * 1024;
    const DEFAULT_MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
    const MAX_PNG_DIMENSION = 16384;
    const MAX_PNG_PIXELS = 16_000_000;
    const CANONICAL_BASE64 =
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    const BASE64_ALPHABET =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let fallbackIdSequence = 0;

    function fallbackVersionId() {
        const randomUuid = global.crypto?.randomUUID?.();
        if (randomUuid) return `version:${randomUuid}`;
        fallbackIdSequence += 1;
        const randomPart = Math.random().toString(36).slice(2);
        return [
            'version',
            Date.now().toString(36),
            fallbackIdSequence.toString(36),
            randomPart,
        ].join(':');
    }

    function versionIdForSourceTask(sourceTaskId) {
        return `task:${encodeURIComponent(String(sourceTaskId || ''))}`;
    }

    function unsafeDownload() {
        throw new Error('UNSAFE_DOWNLOAD');
    }

    function decodedBase64Bytes(base64) {
        const padding = base64.endsWith('==')
            ? 2
            : (base64.endsWith('=') ? 1 : 0);
        return (base64.length / 4) * 3 - padding;
    }

    function decodeBase64(base64) {
        let binary;
        try {
            binary = global.atob(base64);
        } catch {
            throw new Error('INVALID_PNG');
        }
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
    }

    function uint32(bytes, offset) {
        return (
            bytes[offset] * 0x1000000
            + bytes[offset + 1] * 0x10000
            + bytes[offset + 2] * 0x100
            + bytes[offset + 3]
        );
    }

    function chunkType(bytes, offset) {
        return String.fromCharCode(
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        );
    }

    function validatePngBytes(input) {
        const bytes = input instanceof Uint8Array
            ? input
            : new Uint8Array(input || 0);
        const signature = [
            0x89, 0x50, 0x4e, 0x47,
            0x0d, 0x0a, 0x1a, 0x0a,
        ];
        if (
            bytes.length < 8
            || signature.some((value, index) => bytes[index] !== value)
        ) {
            throw new Error('INVALID_PNG');
        }

        let offset = 8;
        let chunkIndex = 0;
        let seenHeader = false;
        let seenImageData = false;
        let pngMetadata = null;
        while (offset < bytes.length) {
            if (offset + 12 > bytes.length) {
                throw new Error('INVALID_PNG');
            }
            const length = uint32(bytes, offset);
            const type = chunkType(bytes, offset + 4);
            const nextOffset = offset + 12 + length;
            if (
                !Number.isSafeInteger(nextOffset)
                || nextOffset > bytes.length
            ) {
                throw new Error('INVALID_PNG');
            }
            if (chunkIndex === 0) {
                if (type !== 'IHDR' || length !== 13) {
                    throw new Error('INVALID_PNG');
                }
                const width = uint32(bytes, offset + 8);
                const height = uint32(bytes, offset + 12);
                const bitDepth = bytes[offset + 16];
                const colorType = bytes[offset + 17];
                const compression = bytes[offset + 18];
                const filter = bytes[offset + 19];
                const interlace = bytes[offset + 20];
                const validBitDepths = {
                    0: [1, 2, 4, 8, 16],
                    2: [8, 16],
                    3: [1, 2, 4, 8],
                    4: [8, 16],
                    6: [8, 16],
                };
                if (
                    !width
                    || !height
                    || width > MAX_PNG_DIMENSION
                    || height > MAX_PNG_DIMENSION
                    || width * height > MAX_PNG_PIXELS
                    || !validBitDepths[colorType]?.includes(bitDepth)
                    || compression !== 0
                    || filter !== 0
                    || ![0, 1].includes(interlace)
                ) {
                    throw new Error('INVALID_PNG');
                }
                pngMetadata = {
                    width,
                    height,
                    bitDepth,
                    colorType,
                    interlace,
                };
                seenHeader = true;
            } else if (type === 'IHDR') {
                throw new Error('INVALID_PNG');
            }
            if (type === 'IDAT') {
                if (!seenHeader || length === 0) {
                    throw new Error('INVALID_PNG');
                }
                seenImageData = true;
            }
            if (type === 'IEND') {
                if (
                    length !== 0
                    || !seenHeader
                    || !seenImageData
                    || nextOffset !== bytes.length
                ) {
                    throw new Error('INVALID_PNG');
                }
                return pngMetadata;
            }
            offset = nextOffset;
            chunkIndex += 1;
        }
        throw new Error('INVALID_PNG');
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
            let bytes;
            try {
                bytes = decodeBase64(base64);
                validatePngBytes(bytes);
            } catch {
                unsafeDownload();
            }
            return {
                kind: 'data',
                url: value,
                maxBytes: boundedMax,
                fetchOptions: undefined,
                bytes,
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

    async function readBoundedResponseBody(
        response,
        maxBytes,
        {
            abortController,
            reader: suppliedReader,
            releaseReader = true,
            lifecycle = {},
        } = {},
    ) {
        const boundedMax = Number(maxBytes);
        if (!Number.isFinite(boundedMax) || boundedMax <= 0) {
            throw new Error('DOWNLOAD_TOO_LARGE');
        }
        const reader = suppliedReader || response.body?.getReader?.();
        lifecycle.readerAcquired = Boolean(reader);
        lifecycle.readerCancelled = false;
        let abortCalled = false;
        const abortOnce = () => {
            if (
                abortCalled
                || abortController?.signal?.aborted
                || typeof abortController?.abort !== 'function'
            ) {
                return;
            }
            abortCalled = true;
            abortController.abort();
        };

        try {
            const contentLength = response.headers?.get?.('content-length');
            if (contentLength !== null && contentLength !== undefined) {
                if (!/^\d+$/.test(String(contentLength))) {
                    throw new Error('DOWNLOAD_LENGTH_INVALID');
                }
                if (Number(contentLength) > boundedMax) {
                    throw new Error('DOWNLOAD_TOO_LARGE');
                }
            }

            if (!reader) {
                if (
                    contentLength === null
                    || contentLength === undefined
                    || !response.arrayBuffer
                ) {
                    throw new Error('DOWNLOAD_LENGTH_REQUIRED');
                }
                const buffer = await response.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                if (bytes.byteLength > boundedMax) {
                    throw new Error('DOWNLOAD_TOO_LARGE');
                }
                return bytes;
            }

            const chunks = [];
            let total = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = value instanceof Uint8Array
                    ? value
                    : new Uint8Array(value);
                if (total + chunk.byteLength > boundedMax) {
                    throw new Error('DOWNLOAD_TOO_LARGE');
                }
                chunks.push(chunk);
                total += chunk.byteLength;
            }
            const bytes = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
            }
            return bytes;
        } catch (error) {
            abortOnce();
            if (reader && !lifecycle.readerCancelled) {
                lifecycle.readerCancelled = true;
                try {
                    await reader.cancel(error?.message || 'DOWNLOAD_FAILED');
                } catch {
                    // Preserve the original validation or read failure.
                }
            }
            throw error;
        } finally {
            if (reader && releaseReader) {
                reader.releaseLock?.();
            }
        }
    }

    async function fetchValidatedPng(policy, environment = global) {
        const fetchImpl = environment.fetch;
        const AbortControllerConstructor = environment.AbortController;
        const BlobConstructor = environment.Blob;
        const decodePng = environment.ensureBrowserDecodablePng
            || ensureBrowserDecodablePng;
        if (
            typeof fetchImpl !== 'function'
            || typeof AbortControllerConstructor !== 'function'
            || typeof BlobConstructor !== 'function'
        ) {
            throw new Error('DOWNLOAD_UNAVAILABLE');
        }

        const abortController = new AbortControllerConstructor();
        let abortCalled = false;
        const abortOnce = {
            signal: abortController.signal,
            abort() {
                if (abortCalled || abortController.signal?.aborted) return;
                abortCalled = true;
                abortController.abort();
            },
        };
        let response;
        let reader;
        const lifecycle = {};
        try {
            response = await fetchImpl(policy.url, {
                ...policy.fetchOptions,
                signal: abortController.signal,
            });
            reader = response.body?.getReader?.();
            validateDownloadResponse(policy, {
                url: response.url,
                ok: response.ok,
                contentType: response.headers?.get?.('content-type'),
                contentLength: response.headers?.get?.('content-length'),
            });
            const bytes = await readBoundedResponseBody(
                response,
                policy.maxBytes,
                {
                    abortController: abortOnce,
                    reader,
                    releaseReader: false,
                    lifecycle,
                },
            );
            const png = validatePngBytes(bytes);
            const blob = new BlobConstructor([bytes], { type: 'image/png' });
            await decodePng(blob);
            return {
                bytes,
                blob,
                png,
                abort: () => abortOnce.abort(),
            };
        } catch (error) {
            abortOnce.abort();
            if (reader && !lifecycle.readerCancelled) {
                lifecycle.readerCancelled = true;
                try {
                    await reader.cancel(error?.message || 'DOWNLOAD_FAILED');
                } catch {
                    // Preserve the original download failure.
                }
            } else if (!reader) {
                try {
                    await response?.body?.cancel?.(
                        error?.message || 'DOWNLOAD_FAILED',
                    );
                } catch {
                    // Preserve the original download failure.
                }
            }
            throw error;
        } finally {
            reader?.releaseLock?.();
        }
    }

    async function ensureBrowserDecodablePng(blob, environment = global) {
        if (typeof environment.createImageBitmap === 'function') {
            let bitmap;
            try {
                bitmap = await environment.createImageBitmap(blob);
                if (!bitmap.width || !bitmap.height) {
                    throw new Error('INVALID_PNG');
                }
            } finally {
                bitmap?.close?.();
            }
            return true;
        }

        const Url = environment.URL;
        const ImageConstructor = environment.Image;
        if (!Url?.createObjectURL || !ImageConstructor) {
            throw new Error('IMAGE_DECODE_UNAVAILABLE');
        }
        const objectUrl = Url.createObjectURL(blob);
        try {
            await new Promise((resolve, reject) => {
                const image = new ImageConstructor();
                image.onload = () => {
                    if (image.naturalWidth && image.naturalHeight) resolve();
                    else reject(new Error('INVALID_PNG'));
                };
                image.onerror = () => reject(new Error('INVALID_PNG'));
                image.src = objectUrl;
            });
        } finally {
            Url.revokeObjectURL(objectUrl);
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

    function hydrateVersion(history, input) {
        const candidate = {
            ...input,
            id: input.id || (
                input.sourceTaskId
                    ? versionIdForSourceTask(input.sourceTaskId)
                    : null
            ),
        };
        const existingIndex = findVersionIndexByIdentity(
            history.list(),
            candidate,
        );
        if (existingIndex >= 0) {
            return history.select(existingIndex);
        }
        return history.add(candidate);
    }

    function createVersionHistory(options = {}) {
        const versions = [];
        let selectedIndex = -1;
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
                const removed = versions.shift();
                for (const version of versions) {
                    if (version.baseVersionId === removed.id) {
                        version.baseVersionId = null;
                    }
                }
                selectedIndex -= 1;
            }
        }

        function add(input) {
            const requestedId = input.id
                ? String(input.id)
                : (
                    input.sourceTaskId
                        ? versionIdForSourceTask(input.sourceTaskId)
                        : null
                );
            let id = requestedId;
            while (
                !id
                || versions.some((version) => version.id === id)
            ) {
                id = fallbackVersionId();
            }
            const version = {
                id,
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
        ensureBrowserDecodablePng,
        fetchValidatedPng,
        findVersionIndexByIdentity,
        hydrateVersion,
        readBoundedResponseBody,
        validateDownloadResponse,
        validatePngBytes,
        versionIdForSourceTask,
    };
    global.VersionHistory = versionHistory;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = versionHistory;
    }
}(globalThis));
