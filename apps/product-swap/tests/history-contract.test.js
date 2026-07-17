const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('generation page links to the task center', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /id="historyLink"/);
    assert.match(html, /href="\/history\.html"/);
});

test('task center exposes list, filters, states, pagination and detail', () => {
    const html = fs.readFileSync(
        path.join(root, 'history.html'),
        'utf8',
    );
    for (const id of [
        'taskTypeFilters',
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
    assert.match(html, /所有任务/);
    assert.match(html, /一键换产品/);
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
