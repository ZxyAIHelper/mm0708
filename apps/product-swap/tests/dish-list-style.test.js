'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'style.css'),
    'utf8',
);

test('dish list has responsive cards and an owned state', () => {
    assert.match(source, /\.dish-card-list\s*\{/);
    assert.match(source, /grid-template-columns:\s*repeat\(2/);
    assert.match(source, /\.dish-card\.is-owned/);
    assert.match(source, /\.dish-owned-toggle/);
    assert.match(source, /@media \(max-width:\s*640px\)[\s\S]*\.dish-card-list/);
});

test('dish layout choices show responsive schematic previews', () => {
    assert.match(source, /\.choice-group-with-previews\s*\{/);
    assert.match(source, /grid-template-columns:\s*repeat\(auto-fit,/);
    assert.match(source, /\.choice-group-with-previews > button\s*\{/);
    assert.match(source, /min-height:\s*118px/);
    assert.match(source, /\.choice-preview\s*\{/);
    assert.match(source, /\.choice-preview-tier\s*\{/);
    assert.match(source, /\.choice-preview-grid-4\s*\{/);
    assert.match(source, /\.choice-preview-grid-9\s*\{/);
    assert.match(source, /\.choice-preview-hero\s*\{/);
    assert.match(source, /\.choice-preview-leaderboard\s*\{/);
    assert.match(
        source,
        /\.choice-group-with-previews > button\[aria-checked="true"\]/,
    );
    assert.match(
        source,
        /@media \(max-width:\s*640px\)[\s\S]*\.choice-group-with-previews/,
    );
});

