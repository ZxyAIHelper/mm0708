const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('creator links to Works', () => {
    const html = fs.readFileSync(path.join(root, 'create.html'), 'utf8');
    assert.match(html, /id="historyLink"/);
    assert.match(html, /href="\/history\.html"/);
});

test('Works exposes list, status filters, states, pagination and detail', () => {
    const html = fs.readFileSync(
        path.join(root, 'history.html'),
        'utf8',
    );
    for (const id of [
        'workStatusFilters',
        'taskList',
        'historyLoading',
        'historyEmpty',
        'historyError',
        'historyRetry',
        'loadMoreButton',
        'taskDetailLayer',
        'taskDetailClose',
        'taskDetailContent',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, />作品</);
    assert.match(html, /data-status="processing"/);
    assert.match(html, /data-status="completed"/);
    assert.match(html, /data-status="failed"/);
    assert.match(html, /data-nav="works"/);
    assert.match(
        html,
        /class="active"[^>]*data-status=""[^>]*aria-pressed="true"/,
    );
    for (const status of ['processing', 'completed', 'failed']) {
        assert.match(
            html,
            new RegExp(`data-status="${status}"[^>]*aria-pressed="false"`),
        );
    }

    const script = fs.readFileSync(
        path.join(root, 'history.js'),
        'utf8',
    );
    assert.match(script, /setAttribute\('aria-pressed'/);

    const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
    assert.match(
        style,
        /\.load-more\[hidden\]\s*\{[^}]*display:\s*none\s*;/,
    );
});

test('task center reads local blobs, urls, expiry and deletion', () => {
    const html = fs.readFileSync(
        path.join(root, 'history.html'),
        'utf8',
    );
    const script = fs.readFileSync(
        path.join(root, 'history.js'),
        'utf8',
    );
    assert.match(html, /local-history\.js/);
    assert.doesNotMatch(script, /\/api\/tasks/);
    assert.match(script, /LocalTaskHistory/);
    assert.match(script, /history\.listTasks/);
    assert.match(script, /history\.getTask/);
    assert.match(script, /history\.deleteTask/);
    assert.match(script, /URL\.createObjectURL/);
    assert.match(script, /URL\.revokeObjectURL/);
    assert.match(script, /history\.isExpired/);
    assert.match(script, /sourceUrl/);
    assert.match(script, /cursor/);
    assert.match(script, /input\?\.messages/);
    assert.match(script, /result\?\.assistantMessage/);
    assert.match(script, /history-conversation/);
});
