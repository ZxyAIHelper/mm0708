const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function ruleFor(source, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'g'))]
        .map((match) => match[1])
        .join('\n');
}

test('creator page exposes the template-driven generator controls', () => {
    const html = fs.readFileSync(
        path.join(root, 'create.html'),
        'utf8',
    );

    for (const id of [
        'creatorTitle',
        'creatorSummary',
        'swapForm',
        'templateFields',
        'formError',
        'generateButton',
        'resultSection',
        'refineForm',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }

    assert.doesNotMatch(html, /id="(?:target|product|scene)Input"/);
    const scripts = [
        '/template-catalog.js',
        '/templates.js',
        '/creator-form.js',
        '/creator-meta.js',
        '/api-client.js',
        '/local-history.js',
        '/script.js',
    ];
    let previousIndex = -1;
    for (const script of scripts) {
        const index = html.indexOf(`<script src="${script}"></script>`);
        assert.ok(index > previousIndex, `${script} is in dependency order`);
        previousIndex = index;
    }
});

test('resolves only live creator templates', () => {
    const { resolveCreatorTemplate } = require('../creator-meta');

    assert.equal(
        resolveCreatorTemplate('?template=product-swap')?.id,
        'product-swap',
    );
    assert.equal(resolveCreatorTemplate('?template=missing'), null);
    assert.equal(resolveCreatorTemplate('?template=summer-seeding'), null);
});

test('restores the active template generation label after loading', () => {
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.match(source, /activeTemplate\?\.outputLabel/);
    assert.match(source, /activeTemplate\?\.creditCost/);
});

test('creator metadata renders all supported schema field types', () => {
    const meta = require('../creator-meta');
    const source = fs.readFileSync(
        path.join(root, 'creator-meta.js'),
        'utf8',
    );

    assert.equal(typeof meta.renderTemplateFields, 'function');
    assert.match(source, /template-field-\$\{field\.type\}/);
    assert.match(source, /hint\.textContent = '点击或拖拽上传'/);
    assert.match(source, /group\.className = 'choice-group'/);
    assert.match(source, /role', 'radiogroup'/);
    assert.match(source, /label\.id = `\$\{controlId\}-label`/);
    assert.match(source, /aria-labelledby', label\.id/);
    assert.match(
        source,
        /aria-required'[\s\S]{0,80}String\(Boolean\(field\.required\)\)/,
    );
    assert.match(source, /button\.className = 'switch-control'/);
    assert.match(source, /role', 'switch'/);
    assert.match(source, /button\.appendChild\(text\)/);
    assert.match(source, /CreatorForm\.choiceTabIndex/);
    assert.match(source, /field\.maxLength/);
});

test('creator styles every schema-driven food template control', () => {
    const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

    assert.match(ruleFor(css, '.template-field-image'), /position:\s*relative/);
    assert.match(
        ruleFor(css, '.template-field-image .upload-box'),
        /width:\s*100%/,
    );
    assert.match(
        ruleFor(
            css,
            'body[data-template-id="food-copy-layout"] .template-field-image .upload-box',
        ),
        /min-height:\s*280px/,
    );
    assert.match(
        ruleFor(css, '.template-field-image .upload-box'),
        /border:\s*1px dashed #d7c5b5/,
    );
    assert.match(
        ruleFor(css, '.template-field-image .upload-box'),
        /border-radius:\s*20px/,
    );
    assert.match(
        ruleFor(css, '.template-field-image .upload-box'),
        /background:\s*#fffaf4/,
    );
    assert.match(
        ruleFor(
            css,
            'body[data-template-id="food-copy-layout"] .template-field-image.has-preview .upload-box',
        ),
        /aspect-ratio:\s*3\s*\/\s*4/,
    );
    assert.match(
        ruleFor(css, '.template-field-image .upload-box img'),
        /object-fit:\s*contain/,
    );

    assert.match(ruleFor(css, '.choice-group'), /grid-template-columns:\s*repeat\(3,/);
    assert.match(ruleFor(css, '.choice-group'), /gap:\s*8px/);
    assert.match(
        ruleFor(css, '.choice-group button'),
        /min-height:\s*44px/,
    );
    assert.match(
        ruleFor(css, '.choice-group button[aria-checked="true"]'),
        /border-color:\s*var\(--accent\)/,
    );

    assert.match(ruleFor(css, '.switch-control'), /min-height:\s*44px/);
    assert.match(
        ruleFor(css, '.template-field-text textarea'),
        /width:\s*100%/,
    );
    assert.match(
        ruleFor(css, 'body[data-template-id="food-copy-layout"] .example-card'),
        /display:\s*none/,
    );
    assert.match(ruleFor(css, '.remove-image'), /min-height:\s*44px/);
    assert.match(
        ruleFor(css, '.remove-image'),
        /background:\s*rgb\(255 255 255 \/ 94%\)/,
    );
    for (const selector of [
        '.choice-group button:focus-visible',
        '.switch-control:focus-visible',
        '.template-field-text textarea:focus-visible',
        '.remove-image:focus-visible',
    ]) {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        assert.match(css, new RegExp(
            `${escaped}[\\s\\S]*?outline:\\s*3px solid #c63d48`,
        ));
    }
    assert.match(css, /\.choice-group button:hover[\s\S]*?border-color:\s*var\(--accent\)/);
    assert.match(css, /\.remove-image:hover[\s\S]*?border-color:\s*var\(--danger\)/);
});

test('generic previews stay bounded while food previews use their 3:4 frame', () => {
    const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

    assert.match(
        ruleFor(css, '.template-field-image .upload-box img'),
        /max-height:\s*260px/,
    );
    assert.match(
        ruleFor(
            css,
            'body[data-template-id="food-copy-layout"] .template-field-image .upload-box img',
        ),
        /max-height:\s*none/,
    );
});

test('enabled switches use an accessible dark-red and white combination', () => {
    const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
    const enabled = ruleFor(
        css,
        '.switch-control[aria-checked="true"]',
    );

    assert.match(enabled, /background:\s*#c63d48/);
    assert.match(enabled, /color:\s*#fff/);
});

test('schema field rerenders preserve creator metadata structure', () => {
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.match(source, /hint\.textContent = '点击或拖拽上传'/);
    assert.match(source, /button\.firstElementChild\.textContent/);
    assert.match(source, /CreatorForm\.choiceTabIndex/);
    assert.match(source, /CreatorForm\.nextChoiceIndex/);
    assert.match(source, /addEventListener\('keydown'/);
});

test('creator boot isolates tasks and avoids interpolated selectors', () => {
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.match(source, /if \(!activeTemplate\) return;/);
    assert.match(
        source,
        /const activeTaskKey = activeTaskStorageKey\(activeTemplate\)/,
    );
    assert.match(
        source,
        /taskMatchesTemplate\(rememberedTask, activeTemplate\)/,
    );
    assert.match(
        source,
        /taskMatchesTemplate\(\s*processingTaskCandidate,\s*activeTemplate,/,
    );
    assert.match(
        source,
        /historyInputFromPayload\(\s*activeTemplate,\s*payload,/,
    );
    assert.doesNotMatch(
        source,
        /querySelector\(\s*`\[data-field-key=/,
    );
});

test('image binding invalidates stale uploads and uses field MIME types', () => {
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );

    assert.match(
        source,
        /CreatorForm\.createUploadOperations\(\)/,
    );
    assert.match(source, /uploadOperations\.begin\(field\.key\)/);
    assert.match(
        source,
        /uploadOperations\.isFieldCurrent\(\s*field\.key,\s*operation,/,
    );
    assert.match(
        source,
        /uploadOperations\.isLatestFeedback\(operation\)/,
    );
    assert.match(
        source,
        /uploadOperations\.claimFeedback\('form-validation'\)/,
    );
    assert.match(
        source,
        /uploadOperations\.claimFeedback\('refine-validation'\)/,
    );
    assert.match(source, /uploadOperations\.complete\(operation\)/);
    assert.match(source, /uploadOperations\.cancel\(field\.key\)/);
    assert.match(source, /validateClientFileMeta\(file, field\.accept/);
    assert.match(source, /detectImageMime\(header\)/);
    assert.match(source, /input\.value = '';\s*const operation/);
});

test('pending uploads gate both submit paths before payload creation', () => {
    const source = fs.readFileSync(
        path.join(root, 'script.js'),
        'utf8',
    );
    const initial = source.slice(source.indexOf(
        'async function submitGeneration()',
    ));
    const refine = source.slice(source.indexOf(
        "refineForm.addEventListener('submit'",
    ));

    for (const pathSource of [initial, refine]) {
        const pending = pathSource.indexOf(
            'uploadOperations.hasPending()',
        );
        assert.ok(pending >= 0);
        assert.ok(
            pathSource.indexOf("showError('图片处理中，请稍候')", pending)
            > pending,
        );
    }
    assert.ok(
        initial.indexOf('uploadOperations.hasPending()')
        < initial.indexOf('CreatorForm.validateValues'),
    );
    assert.ok(
        refine.indexOf('uploadOperations.hasPending()')
        < refine.indexOf('buildRefinePayload'),
    );
});
