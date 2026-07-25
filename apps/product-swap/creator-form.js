(function (global) {
    'use strict';
    const ChatMaterials = (
        typeof module !== 'undefined'
        && module.exports
        && typeof require === 'function'
    )
        ? require('./chat-materials')
        : global.ChatMaterials;

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

    function createUploadOperations() {
        const fieldVersions = createOperationVersions();
        const pending = new Map();
        let feedbackVersion = 0;

        function nextFeedback(fieldKey) {
            feedbackVersion += 1;
            return { fieldKey, feedbackVersion };
        }

        return {
            begin(fieldKey) {
                const operation = {
                    ...nextFeedback(fieldKey),
                    fieldKey,
                    fieldVersion: fieldVersions.next(fieldKey),
                };
                pending.set(fieldKey, operation);
                return operation;
            },
            complete(operation) {
                const current = pending.get(operation?.fieldKey);
                if (
                    current?.fieldVersion === operation?.fieldVersion
                ) {
                    pending.delete(operation.fieldKey);
                }
            },
            cancel(fieldKey) {
                const operation = {
                    ...nextFeedback(fieldKey),
                    fieldVersion: fieldVersions.next(fieldKey),
                };
                pending.delete(fieldKey);
                return operation;
            },
            claimFeedback(owner) {
                return nextFeedback(owner);
            },
            hasPending() {
                return pending.size > 0;
            },
            isFieldCurrent(fieldKey, operation) {
                return (
                    operation?.fieldKey === fieldKey
                    && fieldVersions.isCurrent(
                        fieldKey,
                        operation.fieldVersion,
                    )
                );
            },
            isLatestFeedback(operation) {
                return operation?.feedbackVersion === feedbackVersion;
            },
        };
    }

    function choiceTabIndex(value, selectedValue, index) {
        return (
            value === selectedValue
            || (!selectedValue && index === 0)
        ) ? 0 : -1;
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
            field.type === 'chat-materials'
                ? ChatMaterials.normalizeChatMaterials({})
                : field.type === 'dish-list'
                ? []
                : (
                    field.default
                    ?? (field.type === 'boolean' ? false : '')
                ),
        ]));
    }

    function normalizeDishItems(value) {
        if (!Array.isArray(value)) return [];
        return value.map((item) => ({
            image: String(item?.image || '').trim(),
            owned: Boolean(item?.owned),
            source: item?.source === 'library' ? 'library' : 'user',
        }));
    }

    function validateValues(manifest, values) {
        for (const field of fieldsFor(manifest)) {
            const value = values?.[field.key];
            if (field.type === 'chat-materials') {
                const validation = ChatMaterials.validateChatMaterials(value);
                if (validation) {
                    return {
                        ...validation,
                        field: field.key,
                    };
                }
                continue;
            }
            if (field.type === 'dish-list') {
                const dishes = normalizeDishItems(value).filter(
                    (dish) => dish.image,
                );
                if (dishes.length < (field.minItems || 1)) {
                    return {
                        field: field.key,
                        message: `请上传${field.label}`,
                    };
                }
                if (dishes.length > (field.maxItems || 12)) {
                    return {
                        field: field.key,
                        message: `${field.label}不能超过 ${field.maxItems} 张`,
                    };
                }
                if (
                    dishes.filter((dish) => (
                        dish.owned && dish.source === 'user'
                    )).length < (field.minOwned || 1)
                ) {
                    return {
                        field: field.key,
                        message: '请至少标记一道自家菜品',
                    };
                }
                continue;
            }
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
            payload[field.key] = field.type === 'chat-materials'
                ? ChatMaterials.normalizeChatMaterials(value)
                : field.type === 'dish-list'
                ? normalizeDishItems(value)
                : (
                    typeof value === 'string'
                        ? value.trim()
                        : value
                );
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
        normalizeDishItems,
        buildTemplatePayload,
        createOperationVersions,
        createUploadOperations,
        choiceTabIndex,
        nextChoiceIndex,
        validateImageDimensions,
        validateValues,
    };

    global.CreatorForm = creatorForm;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = creatorForm;
    }
}(globalThis));
