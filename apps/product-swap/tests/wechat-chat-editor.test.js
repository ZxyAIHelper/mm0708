const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    createChatEditorState,
    createSafeExampleDraft,
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
    assert.match(source, /chat-page-preview/);
    assert.match(source, /chat-download-all-button/);
});
