(function (global) {
    'use strict';

    function fieldsFor(manifest) {
        return Array.isArray(manifest?.fields) ? manifest.fields : [];
    }

    function createOperationVersions() {
        const versions = new Map();
        return {
            next(key) {
                const version = (versions.get(key) || 0) + 1;
                versions.set(key, version);
                return version;
            },
            isCurrent(key, version) {
                return versions.get(key) === version;
            },
        };
    }

    function nextChoiceIndex(current, length, key) {
        if (length < 1) return -1;
        if (key === 'Home') return 0;
        if (key === 'End') return length - 1;
        if (key === 'ArrowRight' || key === 'ArrowDown') {
            return (current + 1) % length;
        }
        if (key === 'ArrowLeft' || key === 'ArrowUp') {
            return (current - 1 + length) % length;
        }
        return current;
    }

    function initialValues(manifest) {
        return Object.fromEntries(fieldsFor(manifest).map((field) => [
            field.key,
            field.default ?? (field.type === 'boolean' ? false : ''),
        ]));
    }

    function validateValues(manifest, values) {
        for (const field of fieldsFor(manifest)) {
            const value = values?.[field.key];
            if (
                field.required
                && (
                    value === undefined
                    || value === null
                    || (typeof value === 'string' && !value.trim())
                )
            ) {
                const verb = field.type === 'image'
                    ? '上传'
                    : (field.type === 'choice' ? '选择' : '填写');
                return {
                    field: field.key,
                    message: `请${verb}${field.label}`,
                };
            }
            if (
                field.maxLength
                && String(value || '').trim().length > field.maxLength
            ) {
                return {
                    field: field.key,
                    message: `${field.label}不能超过 ${field.maxLength} 字`,
                };
            }
        }
        return null;
    }

    function buildTemplatePayload(manifest, values, generatedAt) {
        const payload = { templateId: manifest.id };
        for (const field of fieldsFor(manifest)) {
            const value = values?.[field.key];
            payload[field.key] = typeof value === 'string'
                ? value.trim()
                : value;
            if (field.key === 'showDateTime' && value) {
                payload.generatedAt = generatedAt;
            }
        }
        return payload;
    }

    function validateImageDimensions(width, height) {
        if (Math.min(width, height) < 320) {
            return {
                code: 'IMAGE_TOO_SMALL',
                message: '图片短边不能小于 320 像素',
            };
        }
        return null;
    }

    const creatorForm = {
        initialValues,
        buildTemplatePayload,
        createOperationVersions,
        nextChoiceIndex,
        validateImageDimensions,
        validateValues,
    };

    global.CreatorForm = creatorForm;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = creatorForm;
    }
}(globalThis));
