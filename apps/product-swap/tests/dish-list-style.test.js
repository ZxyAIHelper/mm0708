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

