const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeChatDraftResponse,
    requestChatDraft,
} = require('../chat-draft-client');

const materials = {
    storeName: '三山山',
    images: [],
    location: null,
    requirements: '',
};

const response = {
    success: true,
    draft: {
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
    },
    provider: 'volcano',
    requestId: 'chat_test',
};

test('posts normalized materials to the chat draft endpoint', async () => {
    const calls = [];
    const draft = await requestChatDraft(materials, {
        apiJson: async (path, init) => {
            calls.push({ path, init });
            return response;
        },
    });

    assert.equal(calls[0].path, '/api/product-swap/chat-draft');
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
        templateId: 'wechat-chat-screenshot',
        ...materials,
    });
    assert.equal(draft.messages.length, 6);
});

test('rejects malformed browser responses', () => {
    assert.throws(
        () => normalizeChatDraftResponse({
            ...response,
            draft: {
                ...response.draft,
                messages: response.draft.messages.slice(0, 5),
            },
        }, materials),
        /对话/,
    );
    assert.throws(
        () => normalizeChatDraftResponse({
            ...response,
            draft: {
                ...response.draft,
                messages: response.draft.messages.map(
                    (message, index) => (
                        index === 0
                            ? { ...message, type: 'html' }
                            : message
                    ),
                ),
            },
        }, materials),
        /消息/,
    );
});
