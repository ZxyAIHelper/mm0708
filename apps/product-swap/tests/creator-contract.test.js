const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

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
