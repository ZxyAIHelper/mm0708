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
    'status',
    'href',
    'outputLabel',
    'creditCost',
    'fields',
];

function validateManifest(manifest, directoryName) {
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

    const fieldKeys = manifest.fields.map((field) => field.key);
    if (new Set(fieldKeys).size !== fieldKeys.length) {
        throw new Error(`Template ${manifest.id} has duplicate field keys`);
    }

    return manifest;
}

function listTemplatePackages() {
    return fs.readdirSync(PACKS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
            const packRoot = path.join(PACKS_ROOT, entry.name);
            const manifest = validateManifest(
                require(path.join(packRoot, 'manifest.js')),
                entry.name,
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

            return { manifest, buildPrompt };
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
