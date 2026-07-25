const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appCss = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
const creatorCss = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

test('shared app chrome stays mobile-safe and keyboard accessible', () => {
    assert.match(appCss, /width:\s*min\(100%,\s*520px\)/);
    assert.match(appCss, /env\(safe-area-inset-bottom\)/);
    assert.match(appCss, /min-height:\s*48px/);
    assert.match(appCss, /:focus-visible[\s\S]*3px solid rgb\(244 81 91 \/ 35%\)/);
    assert.match(appCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('creator uses the light merchant palette and narrow-screen layout', () => {
    assert.match(creatorCss, /color-scheme:\s*light/);
    assert.match(creatorCss, /--page:\s*#f7f6f2/);
    assert.match(creatorCss, /--accent:\s*#f4515b/);
    assert.match(creatorCss, /@media\s*\(max-width:\s*360px\)/);
});
