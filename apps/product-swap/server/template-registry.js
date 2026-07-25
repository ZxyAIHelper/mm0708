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
]);
const IMAGE_MEDIA_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);

function firstUnknownKey(value, allowedKeys) {
    const allowed = new Set(allowedKeys);
    return Object.keys(value).find((key) => !allowed.has(key));
}

function validateField(field, manifestId) {
    if (
        !field
        || typeof field !== 'object'
        || Array.isArray(field)
        || typeof field.key !== 'string'
        || !field.key.trim()
    ) {
        throw new Error(
            `Template ${manifestId} field keys must be non-empty strings`,
        );
    }

    if (
        !/^[A-Za-z][A-Za-z0-9_]*$/.test(field.key)
        || [
            '__proto__',
            'constructor',
            'prototype',
        ].includes(field.key)
    ) {
        throw new Error(
            `Template ${manifestId} field key ${field.key} is unsafe`,
        );
    }
    if (RESERVED_FIELD_KEYS.has(field.key)) {
        throw new Error(
            `Template ${manifestId} field key ${field.key} is reserved`,
        );
    }

    const allowedKeys = FIELD_KEYS[field.type];
    if (!allowedKeys) {
        throw new Error(
            `Template ${manifestId} field ${field.key}`
            + ` has unknown type ${field.type}`,
        );
    }

    const unknownKey = firstUnknownKey(field, allowedKeys);
    if (unknownKey) {
        throw new Error(
            `Template ${manifestId} field ${field.key}`
            + ` has unknown property ${unknownKey}`,
        );
    }

    if (typeof field.label !== 'string' || !field.label.trim()) {
        throw new Error(
            `Template ${manifestId} field ${field.key}`
            + ' label must be a non-empty string',
        );
    }
    if (
        Object.hasOwn(field, 'required')
        && typeof field.required !== 'boolean'
    ) {
        throw new Error(
            `Template ${manifestId} field ${field.key}`
            + ' required must be a boolean',
        );
    }

    if (field.type === 'image') {
        if (
            typeof field.role !== 'string'
            || !field.role.trim()
        ) {
            throw new Error(
                `Template ${manifestId} field ${field.key}`
                + ' role must be a non-empty string',
            );
        }
        if (typeof field.required !== 'boolean') {
            throw new Error(
                `Template ${manifestId} field ${field.key}`
                + ' required must be a boolean',
            );
        }
        if (
            Object.hasOwn(field, 'accept')
            && !Array.isArray(field.accept)
        ) {
            throw new Error(
                `Template ${manifestId} field ${field.key}`
                + ' accept must be an array',
            );
        }
        if (
            Array.isArray(field.accept)
            && (
                field.accept.length === 0
                || field.accept.some(
                    (mediaType) => !IMAGE_MEDIA_TYPES.has(mediaType),
                )
            )
        ) {
            throw new Error(
                `Template ${manifestId} field ${field.key}`
                + ' accept may only contain image/jpeg, image/png, or image/webp',
            );
        }
    }

    if (field.type === 'choice') {
        const invalidOptions = (
            !Array.isArray(field.options)
            || field.options.length === 0
            || field.options.some((option) => (
                !option
                || typeof option !== 'object'
                || Array.isArray(option)
                || typeof option.value !== 'string'
                || !option.value.trim()
                || typeof option.label !== 'string'
                || !option.label.trim()
            ))
        );
        const values = invalidOptions
            ? []
            : field.options.map(({ value }) => value);
        const labels = invalidOptions
            ? []
            : field.options.map(({ label }) => label);
        if (
            invalidOptions
            || new Set(values).size !== values.length
            || new Set(labels).size !== labels.length
        ) {
            throw new Error(
                `Template ${manifestId} field ${field.key}`
                + ' options must have unique non-empty string values and labels',
            );
        }
        if (!values.includes(field.default)) {
            throw new Error(
                `Template ${manifestId} field ${field.key}`
                + ' default must match an option value',
            );
        }
        for (const option of field.options) {
            const unknownOptionKey = firstUnknownKey(
                option,
                ['value', 'label'],
            );
            if (unknownOptionKey) {
                throw new Error(
                    `Template ${manifestId} field ${field.key}`
                    + ` option has unknown property ${unknownOptionKey}`,
                );
            }
        }
    }

    if (
        field.type === 'boolean'
        && typeof field.default !== 'boolean'
    ) {
        throw new Error(
            `Template ${manifestId} field ${field.key}`
            + ' default must be a boolean',
        );
    }

    if (
        field.type === 'text'
        && Object.hasOwn(field, 'maxLength')
        && (
            !Number.isInteger(field.maxLength)
            || field.maxLength <= 0
        )
    ) {
        throw new Error(
            `Template ${manifestId} field ${field.key}`
            + ' maxLength must be a positive integer',
        );
    }
    if (
        field.type === 'text'
        && Object.hasOwn(field, 'placeholder')
        && typeof field.placeholder !== 'string'
    ) {
        throw new Error(
            `Template ${manifestId} field ${field.key}`
            + ' placeholder must be a string',
        );
    }
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

    const unknownKey = firstUnknownKey(manifest, PUBLIC_KEYS);
    if (unknownKey) {
        throw new Error(
            `Template ${directoryName} has unknown property ${unknownKey}`,
        );
    }

    for (const key of REQUIRED_KEYS) {
        if (manifest[key] === undefined) {
            throw new Error(`Template ${directoryName} is missing ${key}`);
        }
    }

    for (const key of STRING_KEYS) {
        if (typeof manifest[key] !== 'string') {
            throw new Error(
                `Template ${directoryName} ${key} must be a string`,
            );
        }
    }

    if (manifest.id !== directoryName) {
        throw new Error(
            `Template directory ${directoryName} must match manifest id ${manifest.id}`,
        );
    }

    if (!['live', 'coming_soon'].includes(manifest.status)) {
        throw new Error(
            `Template ${manifest.id} status must be live or coming_soon`,
        );
    }
    if (manifest.status === 'live' && !manifest.href.trim()) {
        throw new Error(
            `Live template ${manifest.id} href must be a non-empty string`,
        );
    }
    if (
        typeof manifest.creditCost !== 'number'
        || !Number.isFinite(manifest.creditCost)
        || manifest.creditCost < 0
    ) {
        throw new Error(
            `Template ${manifest.id} creditCost must be a non-negative number`,
        );
    }

    for (const key of ['platforms', 'tags', 'fields']) {
        if (!Array.isArray(manifest[key])) {
            throw new Error(
                `Template ${manifest.id} ${key} must be an array`,
            );
        }
    }

    if (
        Object.hasOwn(manifest, 'quickPrompts')
        && !Array.isArray(manifest.quickPrompts)
    ) {
        throw new Error(
            `Template ${manifest.id} quickPrompts must be an array`,
        );
    }

    for (const key of ['platforms', 'tags', 'quickPrompts']) {
        if (manifest[key] === undefined) continue;
        if (manifest[key].some(
            (entry) => (
                typeof entry !== 'string'
                || !entry.trim()
            ),
        )) {
            throw new Error(
                `Template ${manifest.id} ${key} entries must be non-empty strings`,
            );
        }
    }

    if (
        typeof manifest.cover !== 'string'
        || !manifest.cover.trim()
    ) {
        throw new Error(
            `Template ${manifest.id} cover must be a non-empty string`,
        );
    }

    manifest.fields.forEach((field) => (
        validateField(field, manifest.id)
    ));

    const fieldKeys = manifest.fields.map((field) => field.key);
    if (new Set(fieldKeys).size !== fieldKeys.length) {
        throw new Error(`Template ${manifest.id} has duplicate field keys`);
    }

    return manifest;
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
        if (!Object.hasOwn(source, key)) continue;
        const value = source[key];
        copy[key] = Array.isArray(value) ? value.slice() : value;
    }
    return copy;
}

function publicManifest(manifest) {
    const published = copyAllowedProperties(manifest, PUBLIC_KEYS);
    published.platforms = manifest.platforms.slice();
    published.tags = manifest.tags.slice();
    published.fields = manifest.fields.map((field) => {
        const publishedField = copyAllowedProperties(
            field,
            FIELD_KEYS[field.type] || [],
        );
        if (field.type === 'image' && Array.isArray(field.accept)) {
            publishedField.accept = field.accept.slice();
        }
        if (field.type === 'choice' && Array.isArray(field.options)) {
            publishedField.options = field.options.map((option) => (
                copyAllowedProperties(option, ['value', 'label'])
            ));
        }
        return publishedField;
    });
    if (Array.isArray(manifest.quickPrompts)) {
        published.quickPrompts = manifest.quickPrompts.slice();
    }
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
