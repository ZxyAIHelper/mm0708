'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PACKS_ROOT = path.resolve(__dirname, '..', 'template-packs');
const REQUIRED_KEYS = [
    'id',
    'taskType',
    'name',
    'summary',
    'category',
    'platforms',
    'tags',
    'status',
    'href',
    'cover',
    'outputLabel',
    'creditCost',
    'fields',
];
const PUBLIC_KEYS = [...REQUIRED_KEYS, 'quickPrompts'];
const STRING_KEYS = [
    'id',
    'taskType',
    'name',
    'summary',
    'category',
    'href',
    'outputLabel',
];
const FIELD_KEYS = {
    image: ['key', 'type', 'role', 'label', 'required', 'accept'],
    'dish-list': [
        'key',
        'type',
        'role',
        'label',
        'required',
        'minItems',
        'maxItems',
        'minOwned',
        'accept',
    ],
    choice: [
        'key',
        'type',
        'label',
        'required',
        'default',
        'options',
    ],
    boolean: ['key', 'type', 'label', 'required', 'default'],
    text: [
        'key',
        'type',
        'label',
        'required',
        'maxLength',
        'placeholder',
    ],
};
const RESERVED_FIELD_KEYS = new Set([
    '__proto__',
    'constructor',
    'prototype',
    'templateId',
    'previousImage',
    'messages',
    'conversationId',
    'generatedAt',
    'requestId',
    'hasPreviousImage',
    'imageRoles',
]);
const IMAGE_MEDIA_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);

function firstUnknownKey(value, allowedKeys) {
    const allowed = new Set(allowedKeys);
    const keys = Reflect.ownKeys(value);
    for (let index = 0; index < keys.length; index += 1) {
        if (!allowed.has(keys[index])) return keys[index];
    }
    return undefined;
}

function propertyName(key) {
    return typeof key === 'symbol' ? key.toString() : key;
}

function isPlainObject(value) {
    if (
        !value
        || typeof value !== 'object'
        || Array.isArray(value)
    ) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isDataDescriptor(descriptor) {
    return Boolean(descriptor && Object.hasOwn(descriptor, 'value'));
}

function rejectAccessors(value, context) {
    for (const key of Reflect.ownKeys(value)) {
        if (!isDataDescriptor(
            Object.getOwnPropertyDescriptor(value, key),
        )) {
            throw new Error(
                `${context} ${propertyName(key)}`
                + ' must be an own data property',
            );
        }
    }
}

function requireOwnDataProperty(value, key, context) {
    if (!isDataDescriptor(
        Object.getOwnPropertyDescriptor(value, key),
    )) {
        throw new Error(
            `${context} ${propertyName(key)}`
            + ' must be an own data property',
        );
    }
}

function ownDataValues(value) {
    const values = Object.create(null);
    const keys = Reflect.ownKeys(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (isDataDescriptor(descriptor)) {
            values[key] = descriptor.value;
        }
    }
    return values;
}

function assertPlainDenseArray(value, context) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new Error(`${context} must use Array.prototype`);
    }

    const length = Object.getOwnPropertyDescriptor(
        value,
        'length',
    ).value;
    const keys = Reflect.ownKeys(value);
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        const key = keys[keyIndex];
        if (key === 'length') continue;
        const numericIndex = typeof key === 'string'
            ? Number(key)
            : Number.NaN;
        if (
            !Number.isInteger(numericIndex)
            || numericIndex < 0
            || numericIndex >= length
            || String(numericIndex) !== key
        ) {
            throw new Error(
                `${context} has unknown array property`
                + ` ${propertyName(key)}`,
            );
        }
    }
    for (let index = 0; index < length; index += 1) {
        if (!isDataDescriptor(
            Object.getOwnPropertyDescriptor(value, index),
        )) {
            throw new Error(`${context} must be a dense array`);
        }
    }
}

function denseArrayValues(value) {
    const length = Object.getOwnPropertyDescriptor(
        value,
        'length',
    ).value;
    const values = new Array(length);
    for (let index = 0; index < length; index += 1) {
        values[index] = Object.getOwnPropertyDescriptor(
            value,
            index,
        ).value;
    }
    return values;
}

function validateField(field, manifestId) {
    if (
        !field
        || typeof field !== 'object'
        || Array.isArray(field)
    ) {
        throw new Error(
            `Template ${manifestId} field keys must be non-empty strings`,
        );
    }
    if (!isPlainObject(field)) {
        throw new Error(
            `Template ${manifestId} field must be a plain object`,
        );
    }

    const keyDescriptor = Object.getOwnPropertyDescriptor(field, 'key');
    if (!keyDescriptor) {
        throw new Error(
            `Template ${manifestId} field keys must be non-empty strings`,
        );
    }
    if (!isDataDescriptor(keyDescriptor)) {
        throw new Error(
            `Template ${manifestId} field key`
            + ' must be an own data property',
        );
    }
    const fieldKey = keyDescriptor.value;
    if (typeof fieldKey !== 'string' || !fieldKey.trim()) {
        throw new Error(
            `Template ${manifestId} field keys must be non-empty strings`,
        );
    }

    if (
        !/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldKey)
        || fieldKey === '__proto__'
        || fieldKey === 'constructor'
        || fieldKey === 'prototype'
    ) {
        throw new Error(
            `Template ${manifestId} field key ${fieldKey} is unsafe`,
        );
    }
    if (RESERVED_FIELD_KEYS.has(fieldKey)) {
        throw new Error(
            `Template ${manifestId} field key ${fieldKey} is reserved`,
        );
    }

    const fieldContext = `Template ${manifestId} field ${fieldKey}`;
    rejectAccessors(field, fieldContext);
    requireOwnDataProperty(field, 'type', fieldContext);
    const values = ownDataValues(field);

    if (!Object.hasOwn(FIELD_KEYS, values.type)) {
        throw new Error(
            fieldContext
            + ` has unknown type ${values.type}`,
        );
    }
    const allowedKeys = FIELD_KEYS[values.type];

    const unknownKey = firstUnknownKey(field, allowedKeys);
    if (unknownKey !== undefined) {
        throw new Error(
            fieldContext
            + ` has unknown property ${propertyName(unknownKey)}`,
        );
    }

    requireOwnDataProperty(field, 'label', fieldContext);
    if (typeof values.label !== 'string' || !values.label.trim()) {
        throw new Error(
            fieldContext
            + ' label must be a non-empty string',
        );
    }
    if (
        Object.hasOwn(values, 'required')
        && typeof values.required !== 'boolean'
    ) {
        throw new Error(
            fieldContext
            + ' required must be a boolean',
        );
    }

    if (values.type === 'image' || values.type === 'dish-list') {
        requireOwnDataProperty(field, 'role', fieldContext);
        requireOwnDataProperty(field, 'required', fieldContext);
        if (
            typeof values.role !== 'string'
            || !values.role.trim()
        ) {
            throw new Error(
                fieldContext
                + ' role must be a non-empty string',
            );
        }
        if (typeof values.required !== 'boolean') {
            throw new Error(
                fieldContext
                + ' required must be a boolean',
            );
        }
        if (
            Object.hasOwn(values, 'accept')
            && !Array.isArray(values.accept)
        ) {
            throw new Error(
                fieldContext
                + ' accept must be an array',
            );
        }
        if (Array.isArray(values.accept)) {
            assertPlainDenseArray(
                values.accept,
                `${fieldContext} accept`,
            );
            const acceptValues = denseArrayValues(values.accept);
            if (acceptValues.length === 0) {
                throw new Error(
                    fieldContext
                    + ' accept may only contain image/jpeg, image/png, or image/webp',
                );
            }
            for (
                let index = 0;
                index < acceptValues.length;
                index += 1
            ) {
                if (!IMAGE_MEDIA_TYPES.has(acceptValues[index])) {
                    throw new Error(
                        fieldContext
                        + ' accept may only contain image/jpeg, image/png, or image/webp',
                    );
                }
            }
            values.accept = acceptValues;
        }
    }

    if (values.type === 'dish-list') {
        for (const key of ['minItems', 'maxItems', 'minOwned']) {
            requireOwnDataProperty(field, key, fieldContext);
        }
        if (
            !Number.isInteger(values.minItems)
            || !Number.isInteger(values.maxItems)
            || !Number.isInteger(values.minOwned)
            || values.minItems < 1
            || values.maxItems > 12
            || values.minItems > values.maxItems
            || values.minOwned < 1
            || values.minOwned > values.maxItems
        ) {
            throw new Error(`${fieldContext} has invalid dish-list bounds`);
        }
    }

    if (values.type === 'choice') {
        requireOwnDataProperty(field, 'options', fieldContext);
        requireOwnDataProperty(field, 'default', fieldContext);
        if (Array.isArray(values.options)) {
            assertPlainDenseArray(
                values.options,
                `${fieldContext} options`,
            );
            const optionInputs = denseArrayValues(values.options);
            const canonicalOptions = new Array(optionInputs.length);
            const optionValues = new Array(optionInputs.length);
            const optionLabels = new Array(optionInputs.length);
            for (
                let index = 0;
                index < optionInputs.length;
                index += 1
            ) {
                const option = optionInputs[index];
                if (!isPlainObject(option)) {
                    throw new Error(
                        `${fieldContext} option must be a plain object`,
                    );
                }
                const unknownOptionKey = firstUnknownKey(
                    option,
                    ['value', 'label'],
                );
                if (unknownOptionKey !== undefined) {
                    throw new Error(
                        `${fieldContext} option has unknown property`
                        + ` ${propertyName(unknownOptionKey)}`,
                    );
                }
                rejectAccessors(option, `${fieldContext} option`);
                requireOwnDataProperty(
                    option,
                    'value',
                    `${fieldContext} option`,
                );
                requireOwnDataProperty(
                    option,
                    'label',
                    `${fieldContext} option`,
                );
                const optionData = ownDataValues(option);
                optionValues[index] = optionData.value;
                optionLabels[index] = optionData.label;
                const canonicalOption = Object.create(null);
                canonicalOption.value = optionData.value;
                canonicalOption.label = optionData.label;
                canonicalOptions[index] = canonicalOption;
            }
            let invalidOptions = optionInputs.length === 0;
            for (
                let index = 0;
                index < optionInputs.length;
                index += 1
            ) {
                if (
                    typeof optionValues[index] !== 'string'
                    || !optionValues[index].trim()
                    || typeof optionLabels[index] !== 'string'
                    || !optionLabels[index].trim()
                ) {
                    invalidOptions = true;
                }
            }
            if (
                invalidOptions
                || new Set(optionValues).size !== optionValues.length
                || new Set(optionLabels).size !== optionLabels.length
            ) {
                throw new Error(
                    fieldContext
                    + ' options must have unique non-empty string values and labels',
                );
            }
            if (!new Set(optionValues).has(values.default)) {
                throw new Error(
                    fieldContext
                    + ' default must match an option value',
                );
            }
            values.options = canonicalOptions;
        } else {
            throw new Error(
                fieldContext
                + ' options must have unique non-empty string values and labels',
            );
        }
    }

    if (values.type === 'boolean') {
        requireOwnDataProperty(field, 'default', fieldContext);
    }
    if (
        values.type === 'boolean'
        && typeof values.default !== 'boolean'
    ) {
        throw new Error(
            fieldContext
            + ' default must be a boolean',
        );
    }

    if (
        values.type === 'text'
        && Object.hasOwn(values, 'maxLength')
        && (
            !Number.isInteger(values.maxLength)
            || values.maxLength <= 0
        )
    ) {
        throw new Error(
            fieldContext
            + ' maxLength must be a positive integer',
        );
    }
    if (
        values.type === 'text'
        && Object.hasOwn(values, 'placeholder')
        && typeof values.placeholder !== 'string'
    ) {
        throw new Error(
            fieldContext
            + ' placeholder must be a string',
        );
    }

    const canonical = Object.create(null);
    for (let index = 0; index < allowedKeys.length; index += 1) {
        const key = allowedKeys[index];
        if (Object.hasOwn(values, key)) {
            canonical[key] = values[key];
        }
    }
    return canonical;
}

function validateManifest(manifest, directoryName) {
    if (
        !manifest
        || typeof manifest !== 'object'
        || Array.isArray(manifest)
    ) {
        throw new Error(
            `Template ${directoryName} manifest must be an object`,
        );
    }
    if (!isPlainObject(manifest)) {
        throw new Error(
            `Template ${directoryName} manifest must be a plain object`,
        );
    }

    const unknownKey = firstUnknownKey(manifest, PUBLIC_KEYS);
    if (unknownKey !== undefined) {
        throw new Error(
            `Template ${directoryName} has unknown property`
            + ` ${propertyName(unknownKey)}`,
        );
    }

    rejectAccessors(manifest, `Template ${directoryName}`);

    for (const key of REQUIRED_KEYS) {
        if (!Object.hasOwn(manifest, key)) {
            throw new Error(`Template ${directoryName} is missing ${key}`);
        }
    }
    const values = ownDataValues(manifest);

    for (const key of STRING_KEYS) {
        if (typeof values[key] !== 'string') {
            throw new Error(
                `Template ${directoryName} ${key} must be a string`,
            );
        }
    }

    if (values.id !== directoryName) {
        throw new Error(
            `Template directory ${directoryName}`
            + ` must match manifest id ${values.id}`,
        );
    }

    if (
        values.status !== 'live'
        && values.status !== 'coming_soon'
    ) {
        throw new Error(
            `Template ${values.id} status must be live or coming_soon`,
        );
    }
    if (values.status === 'live' && !values.href.trim()) {
        throw new Error(
            `Live template ${values.id} href must be a non-empty string`,
        );
    }
    if (
        typeof values.creditCost !== 'number'
        || !Number.isFinite(values.creditCost)
        || values.creditCost < 0
    ) {
        throw new Error(
            `Template ${values.id}`
            + ' creditCost must be a non-negative number',
        );
    }

    for (const key of ['platforms', 'tags', 'fields']) {
        if (!Array.isArray(values[key])) {
            throw new Error(
                `Template ${values.id} ${key} must be an array`,
            );
        }
        assertPlainDenseArray(
            values[key],
            `Template ${values.id} ${key}`,
        );
    }

    const hasQuickPrompts = Object.hasOwn(values, 'quickPrompts');
    if (hasQuickPrompts) {
        if (!Array.isArray(values.quickPrompts)) {
            throw new Error(
                `Template ${values.id} quickPrompts must be an array`,
            );
        }
        assertPlainDenseArray(
            values.quickPrompts,
            `Template ${values.id} quickPrompts`,
        );
    }

    const canonicalArrays = Object.create(null);
    for (const key of ['platforms', 'tags']) {
        const entries = denseArrayValues(values[key]);
        for (let index = 0; index < entries.length; index += 1) {
            if (
                typeof entries[index] !== 'string'
                || !entries[index].trim()
            ) {
                throw new Error(
                    `Template ${values.id} ${key} entries`
                    + ' must be non-empty strings',
                );
            }
        }
        canonicalArrays[key] = entries;
    }
    const quickPrompts = hasQuickPrompts
        ? denseArrayValues(values.quickPrompts)
        : [];
    for (let index = 0; index < quickPrompts.length; index += 1) {
        if (
            typeof quickPrompts[index] !== 'string'
            || !quickPrompts[index].trim()
        ) {
            throw new Error(
                `Template ${values.id} quickPrompts entries`
                + ' must be non-empty strings',
            );
        }
    }

    if (
        typeof values.cover !== 'string'
        || !values.cover.trim()
    ) {
        throw new Error(
            `Template ${values.id} cover must be a non-empty string`,
        );
    }

    const fieldInputs = denseArrayValues(values.fields);
    const canonicalFields = new Array(fieldInputs.length);
    const fieldKeys = new Array(fieldInputs.length);
    for (let index = 0; index < fieldInputs.length; index += 1) {
        const canonicalField = validateField(
            fieldInputs[index],
            values.id,
        );
        canonicalFields[index] = canonicalField;
        fieldKeys[index] = Object.getOwnPropertyDescriptor(
            canonicalField,
            'key',
        ).value;
    }
    if (new Set(fieldKeys).size !== fieldKeys.length) {
        throw new Error(`Template ${values.id} has duplicate field keys`);
    }

    const canonical = Object.create(null);
    for (let index = 0; index < REQUIRED_KEYS.length; index += 1) {
        const key = REQUIRED_KEYS[index];
        canonical[key] = values[key];
    }
    canonical.platforms = canonicalArrays.platforms;
    canonical.tags = canonicalArrays.tags;
    canonical.fields = canonicalFields;
    canonical.quickPrompts = quickPrompts;
    return canonical;
}

function deepFreeze(value) {
    if (
        !value
        || typeof value !== 'object'
        || Object.isFrozen(value)
    ) {
        return value;
    }

    for (const nestedValue of Object.values(value)) {
        deepFreeze(nestedValue);
    }

    return Object.freeze(value);
}

function listTemplatePackages() {
    return fs.readdirSync(PACKS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
            const packRoot = path.join(PACKS_ROOT, entry.name);
            const manifest = deepFreeze(
                validateManifest(
                    require(path.join(packRoot, 'manifest.js')),
                    entry.name,
                ),
            );
            const buildPrompt = manifest.status === 'live'
                ? require(path.join(packRoot, 'prompt.js')).buildPrompt
                : null;

            if (
                manifest.status === 'live'
                && typeof buildPrompt !== 'function'
            ) {
                throw new Error(
                    `Live template ${manifest.id} needs buildPrompt`,
                );
            }

            return Object.freeze({ manifest, buildPrompt });
        })
        .sort((left, right) => (
            left.manifest.id.localeCompare(right.manifest.id)
        ));
}

function getTemplatePackage(id) {
    return listTemplatePackages().find(
        ({ manifest }) => manifest.id === id,
    ) || null;
}

function copyAllowedProperties(source, keys) {
    const copy = {};
    for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(source, key);
        if (!isDataDescriptor(descriptor)) continue;
        const value = descriptor.value;
        Object.defineProperty(copy, key, {
            value: Array.isArray(value)
                ? denseArrayValues(value)
                : value,
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    return copy;
}

function publicManifest(manifest) {
    const manifestValues = ownDataValues(manifest);
    const published = copyAllowedProperties(manifest, PUBLIC_KEYS);
    published.platforms = denseArrayValues(manifestValues.platforms);
    published.tags = denseArrayValues(manifestValues.tags);
    const fieldInputs = denseArrayValues(manifestValues.fields);
    published.fields = new Array(fieldInputs.length);
    for (let fieldIndex = 0; fieldIndex < fieldInputs.length; fieldIndex += 1) {
        const field = fieldInputs[fieldIndex];
        const fieldValues = ownDataValues(field);
        const publishedField = copyAllowedProperties(
            field,
            Object.hasOwn(FIELD_KEYS, fieldValues.type)
                ? FIELD_KEYS[fieldValues.type]
                : [],
        );
        if (
            (fieldValues.type === 'image'
                || fieldValues.type === 'dish-list')
            && Array.isArray(fieldValues.accept)
        ) {
            publishedField.accept = denseArrayValues(fieldValues.accept);
        }
        if (
            fieldValues.type === 'choice'
            && Array.isArray(fieldValues.options)
        ) {
            const optionInputs = denseArrayValues(fieldValues.options);
            publishedField.options = new Array(optionInputs.length);
            for (
                let optionIndex = 0;
                optionIndex < optionInputs.length;
                optionIndex += 1
            ) {
                publishedField.options[optionIndex] = copyAllowedProperties(
                    optionInputs[optionIndex],
                    ['value', 'label'],
                );
            }
        }
        published.fields[fieldIndex] = publishedField;
    }
    const quickPrompts = (
        Object.hasOwn(manifestValues, 'quickPrompts')
        && Array.isArray(manifestValues.quickPrompts)
    )
        ? denseArrayValues(manifestValues.quickPrompts)
        : [];
    Object.defineProperty(published, 'quickPrompts', {
        value: quickPrompts,
        enumerable: true,
        writable: true,
        configurable: true,
    });
    return published;
}

function publicCatalog() {
    return listTemplatePackages().map(({ manifest }) => (
        publicManifest(manifest)
    ));
}

module.exports = {
    PACKS_ROOT,
    validateManifest,
    listTemplatePackages,
    getTemplatePackage,
    publicManifest,
    publicCatalog,
};
