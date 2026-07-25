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

    for (const key of REQUIRED_KEYS) {
        if (manifest[key] === undefined) {
            throw new Error(`Template ${directoryName} is missing ${key}`);
        }
    }

    if (manifest.id !== directoryName) {
        throw new Error(
            `Template directory ${directoryName} must match manifest id ${manifest.id}`,
        );
    }

    for (const key of ['platforms', 'tags', 'fields']) {
        if (!Array.isArray(manifest[key])) {
            throw new Error(
                `Template ${manifest.id} ${key} must be an array`,
            );
        }
    }

    for (const key of ['platforms', 'tags']) {
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

    if (manifest.fields.some(
        (field) => (
            !field
            || typeof field !== 'object'
            || typeof field.key !== 'string'
            || !field.key.trim()
        ),
    )) {
        throw new Error(
            `Template ${manifest.id} field keys must be non-empty strings`,
        );
    }

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

function publicCatalog() {
    return listTemplatePackages().map(({ manifest }) => (
        JSON.parse(JSON.stringify(manifest))
    ));
}

module.exports = {
    PACKS_ROOT,
    validateManifest,
    listTemplatePackages,
    getTemplatePackage,
    publicCatalog,
};
