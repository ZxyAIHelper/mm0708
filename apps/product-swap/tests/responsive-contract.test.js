const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appCss = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
const creatorCss = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

function ruleFor(source, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? '';
}

test('shared app chrome stays mobile-safe and keyboard accessible', () => {
    assert.match(appCss, /width:\s*min\(100%,\s*520px\)/);
    assert.match(appCss, /env\(safe-area-inset-bottom\)/);
    assert.match(appCss, /min-height:\s*48px/);
    assert.match(appCss, /:focus-visible[\s\S]*3px solid rgb\(244 81 91 \/ 35%\)/);
    assert.match(appCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(appCss, /transition-duration:\s*0\.01ms !important/);
    assert.match(appCss, /animation-duration:\s*0\.01ms !important/);
    assert.doesNotMatch(appCss, /animation-iteration-count/);
});

test('creator uses the light merchant palette and narrow-screen layout', () => {
    assert.match(creatorCss, /color-scheme:\s*light/);
    assert.match(creatorCss, /--page:\s*#f7f6f2/);
    assert.match(creatorCss, /--panel:\s*#ffffff/);
    assert.match(creatorCss, /--accent:\s*#f4515b/);
    assert.match(creatorCss, /@media\s*\(max-width:\s*360px\)/);
});

test('creator inputs and Works surfaces retain readable light-theme contrast', () => {
    assert.match(ruleFor(creatorCss, '#refineInput'), /background:\s*var\(--panel-soft\)/);
    assert.match(ruleFor(creatorCss, '.state-card'), /background:\s*var\(--panel-soft\)/);
    assert.match(ruleFor(creatorCss, '.task-status'), /background:\s*var\(--panel-soft\)/);
    assert.match(ruleFor(creatorCss, '.task-status'), /color:\s*var\(--muted\)/);
    assert.match(ruleFor(creatorCss, '.status-completed'), /color:\s*#176c43/);
    assert.match(ruleFor(creatorCss, '.status-completed'), /background:\s*#e8f7ef/);
    assert.match(ruleFor(creatorCss, '.status-failed'), /color:\s*#a92f3c/);
    assert.match(ruleFor(creatorCss, '.status-failed'), /background:\s*#fdecef/);
    assert.match(ruleFor(creatorCss, '.task-requirement'), /color:\s*var\(--text\)/);
    assert.match(
        ruleFor(creatorCss, '.task-detail-toolbar'),
        /background:\s*rgb\(255 255 255 \/ 94%\)/,
    );
});
