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

function atRuleBlockFor(source, header) {
    const start = source.indexOf(header);
    if (start < 0) return '';
    const open = source.indexOf('{', start + header.length);
    if (open < 0) return '';

    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(open + 1, index);
    }
    return '';
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
    const mobile640 = atRuleBlockFor(
        creatorCss,
        '@media (max-width: 640px)',
    );
    const mobile360 = atRuleBlockFor(
        creatorCss,
        '@media (max-width: 360px)',
    );

    assert.match(
        ruleFor(creatorCss, '.product-swap-shell'),
        /width:\s*min\(100%,\s*460px\)/,
    );
    assert.match(
        ruleFor(creatorCss, '.choice-group'),
        /overflow-x:\s*auto/,
    );
    assert.notEqual(mobile640, '');
    assert.match(
        ruleFor(mobile640, '.product-swap-shell'),
        /padding-inline:\s*16px/,
    );
    assert.match(
        ruleFor(
            mobile640,
            'body[data-template-id="food-copy-layout"] .template-field-image .upload-box',
        ),
        /min-height:\s*220px/,
    );
    assert.match(
        ruleFor(mobile360, '.product-swap-shell'),
        /padding-inline:\s*16px/,
    );
});

test('desktop pages use independent wide layouts while mobile widths remain the default', () => {
    const appDesktop = atRuleBlockFor(
        appCss,
        '@media (min-width: 900px)',
    );
    const creatorDesktop = atRuleBlockFor(
        creatorCss,
        '@media (min-width: 900px)',
    );

    assert.notEqual(appDesktop, '');
    assert.match(
        ruleFor(appDesktop, '.app-shell'),
        /width:\s*min\(calc\(100% - 64px\),\s*1180px\)/,
    );
    assert.match(
        ruleFor(appDesktop, '.home-header'),
        /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(360px,\s*0\.8fr\)/,
    );
    assert.match(
        ruleFor(appDesktop, '.template-grid'),
        /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
    );
    assert.match(
        ruleFor(appDesktop, '.profile-shell'),
        /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );

    assert.notEqual(creatorDesktop, '');
    assert.match(
        ruleFor(creatorDesktop, '.product-swap-shell'),
        /width:\s*min\(calc\(100% - 64px\),\s*1180px\)/,
    );
    assert.match(
        ruleFor(creatorDesktop, '.product-swap-shell'),
        /grid-template-columns:\s*minmax\(300px,\s*0\.75fr\)\s+minmax\(460px,\s*1\.25fr\)/,
    );
    assert.match(
        ruleFor(creatorDesktop, '.task-grid'),
        /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
    assert.match(
        ruleFor(
            creatorDesktop,
            'body[data-template-id="wechat-chat-screenshot"] .product-swap-shell',
        ),
        /display:\s*block/,
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
