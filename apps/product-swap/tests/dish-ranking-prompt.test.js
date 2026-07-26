'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require(
    '../template-packs/dish-ranking-guide/manifest',
);

const root = path.resolve(__dirname, '..');

test('the active ranking path asks AI only for ordering and comments', () => {
    const client = fs.readFileSync(
        path.join(root, 'dish-ranking-client.js'),
        'utf8',
    );
    const renderer = fs.readFileSync(
        path.join(root, 'dish-ranking-renderer.js'),
        'utf8',
    );
    const script = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.match(
        client,
        /\/api\/product-swap\/dish-ranking-draft/,
    );
    assert.match(script, /requestDishRankingDraft/);
    assert.match(script, /renderDishRankingDataUrl/);
    assert.match(
        script,
        /isDishRankingTemplate[\s\S]*?runDishRankingGeneration/,
    );
    assert.doesNotMatch(client, /result\.png|\/generate/);
    assert.doesNotMatch(renderer, /result\.png|\/generate|fetch\(/);
});

test('layout choices keep ranking generation free of image credits', () => {
    const layout = manifest.fields.find((field) => field.key === 'layout');

    assert.deepEqual(
        layout.options.map((option) => option.value),
        ['tier', 'grid-4', 'grid-9', 'hero', 'leaderboard'],
    );
    assert.equal(
        layout.options.every((option) => (
            option.preview === option.value
        )),
        true,
    );
    assert.equal(manifest.creditCost, 0);
    assert.deepEqual(manifest.quickPrompts, []);
});
