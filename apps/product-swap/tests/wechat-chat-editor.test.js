const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    createChatEditorState,
    createSafeExampleDraft,
    runChatGeneration,
} = require('../wechat-chat-editor');

const validDraft = {
    version: 1,
    contactName: '小林',
    messages: [
        { id: 'm1', side: 'right', type: 'text', text: '刚去这家。' },
        { id: 'm2', side: 'left', type: 'text', text: '看着不错。' },
        { id: 'm3', side: 'right', type: 'text', text: '味道也很好。' },
        { id: 'm4', side: 'left', type: 'text', text: '下次一起去。' },
        { id: 'm5', side: 'right', type: 'text', text: '好呀。' },
        { id: 'm6', side: 'left', type: 'text', text: '说定了。' },
    ],
};

test('edits text, side, and message collection without mutating input', () => {
    const state = createChatEditorState();
    state.setStoreName('三山山');
    state.setDraft(validDraft);
    state.editText('m2', '真的很不错。');
    state.toggleSide('m2');
    state.removeMessage('m6');

    const snapshot = state.snapshot();
    assert.equal(snapshot.materials.storeName, '三山山');
    assert.equal(snapshot.draft.messages[1].text, '真的很不错。');
    assert.equal(snapshot.draft.messages[1].side, 'right');
    assert.equal(snapshot.draft.messages.length, 5);
    assert.equal(validDraft.messages[1].text, '看着不错。');
});

test('enforces message, text, and image editing limits', () => {
    const state = createChatEditorState();
    assert.throws(
        () => state.setImages(Array.from({ length: 4 }, (_, index) => ({
            id: `image-${index + 1}`,
            dataUrl: 'data:image/png;base64,AA==',
        }))),
        /3/,
    );
    state.setDraft({
        version: 1,
        contactName: '小林',
        messages: validDraft.messages.slice(0, 2),
    });
    assert.throws(() => state.removeMessage('m1'), /至少保留/);
    assert.throws(
        () => state.editText('m2', '长'.repeat(121)),
        /120/,
    );
});

test('keeps the current draft when regeneration fails', async () => {
    const state = createChatEditorState();
    state.setDraft(validDraft);

    await assert.rejects(
        state.regenerate(async () => {
            throw new Error('network failed');
        }),
        /network failed/,
    );
    assert.deepEqual(state.snapshot().draft, validDraft);
});

test('records one completed task for each generated chat draft', async () => {
    const calls = [];
    const state = createChatEditorState();
    state.setStoreName('三山山');

    const result = await runChatGeneration({
        state,
        requestDraft: async () => validDraft,
        renderDraft: async () => [{
            blob: new Blob(['page'], { type: 'image/png' }),
        }],
        taskLifecycle: {
            start: async () => {
                calls.push('start');
                return { id: 'task_chat_1' };
            },
            complete: async (task, output) => {
                calls.push([
                    'complete',
                    task.id,
                    output.pages.length,
                ]);
            },
            fail: async () => calls.push('fail'),
        },
    });

    assert.deepEqual(calls, [
        'start',
        ['complete', 'task_chat_1', 1],
    ]);
    assert.equal(result.pages.length, 1);
    assert.equal(result.archiveWarning, '');
});

test('fails the local task when chat rendering fails', async () => {
    const calls = [];
    const state = createChatEditorState();
    state.setStoreName('三山山');
    const renderError = new Error('render failed');

    await assert.rejects(runChatGeneration({
        state,
        requestDraft: async () => validDraft,
        renderDraft: async () => {
            throw renderError;
        },
        taskLifecycle: {
            start: async () => ({ id: 'task_chat_2' }),
            complete: async () => calls.push('complete'),
            fail: async (task, error) => {
                calls.push(['fail', task.id, error]);
            },
        },
    }), renderError);

    assert.deepEqual(calls, [
        ['fail', 'task_chat_2', renderError],
    ]);
});

test('continues generation when local task creation fails', async () => {
    const calls = [];
    const state = createChatEditorState();
    state.setStoreName('三山山');

    const result = await runChatGeneration({
        state,
        requestDraft: async () => validDraft,
        renderDraft: async () => [{
            blob: new Blob(['page'], { type: 'image/png' }),
        }],
        taskLifecycle: {
            start: async () => {
                throw new Error('storage unavailable');
            },
            complete: async () => calls.push('complete'),
            fail: async () => calls.push('fail'),
        },
    });

    assert.equal(result.pages.length, 1);
    assert.equal(
        result.archiveWarning,
        '生成可继续，但本次任务记录无法保存',
    );
    assert.deepEqual(calls, []);
});

test('keeps generated pages when task completion cannot be saved', async () => {
    const state = createChatEditorState();
    state.setStoreName('三山山');

    const result = await runChatGeneration({
        state,
        requestDraft: async () => validDraft,
        renderDraft: async () => [{
            blob: new Blob(['page'], { type: 'image/png' }),
        }],
        taskLifecycle: {
            start: async () => ({ id: 'task_chat_3' }),
            complete: async () => {
                throw new Error('quota exceeded');
            },
            fail: async () => undefined,
        },
    });

    assert.equal(result.pages.length, 1);
    assert.equal(
        result.archiveWarning,
        '生成成功，但任务记录保存失败',
    );
});

test('creates a safe editable example with every supplied reference', () => {
    const draft = createSafeExampleDraft({
        storeName: '三山山',
        images: [
            { id: 'image-1', dataUrl: 'one' },
            { id: 'image-2', dataUrl: 'two' },
        ],
        location: {
            id: 'store-location',
            name: '颐和园',
            address: '北京市海淀区新建宫门路19号',
            city: '北京市',
            lat: 39.998766,
            lng: 116.273938,
        },
        requirements: '',
    });
    const references = draft.messages
        .filter((message) => message.type !== 'text')
        .map((message) => message.refId);

    assert.equal(draft.messages.length >= 6, true);
    assert.deepEqual(references.sort(), [
        'image-1',
        'image-2',
        'store-location',
    ]);
    assert.match(
        draft.messages.find((message) => message.type === 'text').text,
        /三山山/,
    );
});

test('renders and downloads chat screenshots as multiple pages', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'wechat-chat-editor.js'),
        'utf8',
    );

    assert.match(source, /renderChatPages/);
    assert.match(source, /runChatGeneration\(/);
    assert.match(source, /chat-page-preview/);
    assert.match(source, /chat-download-all-button/);
    const downloadHandler = source.match(
        /downloadAll\.addEventListener\('click'[\s\S]*?closeDialog/,
    )?.[0] || '';
    assert.doesNotMatch(downloadHandler, /taskLifecycle/);
});

test('uses the first-party Tencent location search dialog', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'wechat-chat-editor.js'),
        'utf8',
    );

    assert.match(source, /chat-map-region/);
    assert.match(source, /chat-map-keyword/);
    assert.match(source, /chat-map-results/);
    assert.match(source, /map\.searchLocations/);
    assert.match(source, /备用位置/);
    assert.match(source, /地图暂不可用，已提供备用地点/);
    assert.match(source, /loadMapPreviewImage/);
    assert.match(source, /正在加载地图/);
    assert.match(source, /chat-location-fallback-badge/);
    assert.match(source, /chat-location-map-preview/);
    assert.doesNotMatch(source, /chat-map-frame/);
});

test('keeps the browser preview at the exported canvas ratio', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'app.css'),
        'utf8',
    );
    const rule = css.match(
        /(?:^|\n)\.chat-preview-canvas\s*\{([^}]*)\}/m,
    );

    assert.ok(rule);
    assert.match(rule[1], /height:\s*auto/);
    assert.doesNotMatch(
        rule[1],
        /aspect-ratio:\s*9\s*\/\s*16/,
    );
});
