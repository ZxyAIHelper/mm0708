'use strict';

const ALLOWED_KEYS = new Set([
    'id',
    'name',
    'tags',
    'width',
    'height',
    'url',
]);

function validateCatalog(input) {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
        throw new Error('Dish asset catalog must be an array');
    }
    const ids = new Set();
    return input.map((item, index) => {
        if (
            !item
            || typeof item !== 'object'
            || Array.isArray(item)
            || Object.getPrototypeOf(item) !== Object.prototype
            || Object.keys(item).some((key) => !ALLOWED_KEYS.has(key))
        ) {
            throw new Error(`Dish asset ${index} is invalid`);
        }
        if (
            typeof item.id !== 'string'
            || !/^[a-z0-9-]+$/.test(item.id)
            || ids.has(item.id)
            || typeof item.name !== 'string'
            || !item.name.trim()
            || !Array.isArray(item.tags)
            || item.tags.length === 0
            || item.tags.some((tag) => typeof tag !== 'string' || !tag.trim())
            || !Number.isInteger(item.width)
            || item.width < 1
            || !Number.isInteger(item.height)
            || item.height < 1
            || typeof item.url !== 'string'
            || !/^\/assets\/dish-library\/[a-z0-9-]+\.webp$/.test(item.url)
        ) {
            throw new Error(`Dish asset ${index} must use a safe dish-library entry`);
        }
        ids.add(item.id);
        return {
            id: item.id,
            name: item.name.trim(),
            tags: item.tags.map((tag) => tag.trim()),
            width: item.width,
            height: item.height,
            url: item.url,
        };
    });
}

function parseDishAssetQuery(url) {
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? 9 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 12) {
        throw new Error('limit must be an integer between 1 and 12');
    }
    const tags = (url.searchParams.get('tags') || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12);
    return {
        limit,
        tags,
        random: url.searchParams.get('random') === 'true',
    };
}

function queryDishAssets(
    catalog,
    { tags = [], limit = 9, random = false } = {},
    randomValue = Math.random,
) {
    const tagSet = new Set(tags);
    const candidates = tagSet.size
        ? catalog.filter((item) => item.tags.some((tag) => tagSet.has(tag)))
        : catalog.slice();
    if (random) {
        for (let index = candidates.length - 1; index > 0; index -= 1) {
            const target = Math.floor(randomValue() * (index + 1));
            [candidates[index], candidates[target]] = [
                candidates[target],
                candidates[index],
            ];
        }
    }
    return candidates.slice(0, Math.min(12, Math.max(0, limit)));
}

module.exports = {
    parseDishAssetQuery,
    queryDishAssets,
    validateCatalog,
};
