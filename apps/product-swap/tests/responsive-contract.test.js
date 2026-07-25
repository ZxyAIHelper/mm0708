const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appCss = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
const creatorCss = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

function ruleFor(source, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'g'))]
        .map((match) => match[1])
        .join('\n');
}

test('shared app chrome stays mobile-safe and keyboard accessible', () => {
    assert.match(appCss, /width:\s*min\(100%,\s*520px\)/);
    assert.match(appCss, /env\(safe-area-inset-bottom\)/);
    assert.match(appCss, /min-height:\s*48px/);
    assert.match(appCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(appCss, /transition-duration:\s*0\.01ms !important/);
    assert.match(appCss, /animation-duration:\s*0\.01ms !important/);
    assert.doesNotMatch(appCss, /animation-iteration-count/);
    assert.match(
        appCss,
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.generate-button\.is-loading::before\s*\{[^}]*animation:\s*none !important/,
    );
    assert.match(ruleFor(appCss, ':focus-visible'), /outline:\s*3px solid #c63d48/);
    assert.doesNotMatch(ruleFor(appCss, '.search-row input'), /outline:\s*none/);
});

test('creator uses the light merchant palette and narrow-screen layout', () => {
    assert.match(creatorCss, /color-scheme:\s*light/);
    assert.match(creatorCss, /--page:\s*#f7f6f2/);
    assert.match(creatorCss, /--panel:\s*#ffffff/);
    assert.match(creatorCss, /--accent:\s*#f4515b/);
    assert.match(creatorCss, /@media\s*\(max-width:\s*360px\)/);
});

test('food creator has explicit desktop and 640px responsive layout contracts', () => {
    assert.match(
        ruleFor(creatorCss, '.product-swap-shell'),
        /width:\s*min\(100%,\s*460px\)/,
    );
    assert.match(
        ruleFor(creatorCss, '.choice-group'),
        /overflow-x:\s*auto/,
    );
    assert.match(creatorCss, /@media\s*\(max-width:\s*640px\)/);
    assert.match(
        creatorCss,
        /@media\s*\(max-width:\s*640px\)[\s\S]*?\.product-swap-shell\s*\{[^}]*padding-inline:\s*16px/,
    );
    assert.match(
        creatorCss,
        /@media\s*\(max-width:\s*640px\)[\s\S]*?body\[data-template-id="food-copy-layout"\] \.template-field-image \.upload-box\s*\{[^}]*min-height:\s*220px/,
    );
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
    assert.doesNotMatch(
        ruleFor(creatorCss, '.template-field-text textarea'),
        /outline:\s*none/,
    );
    assert.doesNotMatch(ruleFor(creatorCss, '#refineInput'), /outline:\s*none/);
    assert.match(
        ruleFor(creatorCss, '.template-field-text textarea::placeholder'),
        /color:\s*var\(--muted\)/,
    );
    assert.match(ruleFor(creatorCss, '.history-footnote'), /color:\s*#5f5a55/);
    assert.doesNotMatch(creatorCss, /rgba\(21,\s*185,\s*212|#0b8ea7/);
});

test('coral actions retain readable text and primary touch targets', () => {
    for (const selector of [
        '.search-row button',
        '.quick-task-primary',
        '.quick-task-primary span',
        '.category-strip button.active',
        '.settings-card button',
    ]) {
        assert.match(ruleFor(appCss, selector), /color:\s*(?:var\(--text\)|#211f1d)/);
    }
    assert.match(ruleFor(appCss, '.search-row button:hover'), /background:\s*#c63d48/);
    assert.match(ruleFor(appCss, '.search-row button:hover'), /color:\s*#fff/);
    assert.match(ruleFor(appCss, '.bottom-nav a.active'), /color:\s*#c63d48/);

    for (const selector of [
        '.generate-button',
        '#refineButton',
        '.task-filters button.active',
        '.primary-link',
    ]) {
        assert.match(ruleFor(creatorCss, selector), /color:\s*(?:var\(--text\)|#211f1d)/);
    }
    assert.match(ruleFor(creatorCss, '.archive-notice'), /color:\s*#7a4b00/);
    assert.match(ruleFor(creatorCss, '.archive-notice'), /background:\s*#fff4d8/);

    for (const selector of [
        '.back-button',
        '#historyLink',
        '#refineButton',
        '.task-filters button',
        '.load-more',
        '.task-card-actions button',
        '.detail-asset button',
        '.detail-delete',
    ]) {
        assert.match(ruleFor(creatorCss, selector), /min-height:\s*44px/);
        assert.doesNotMatch(
            ruleFor(creatorCss, selector),
            /min-height:\s*(?:[0-3]\d|4[0-3])px/,
        );
    }
});
