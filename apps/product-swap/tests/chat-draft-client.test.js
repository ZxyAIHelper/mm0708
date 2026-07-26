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
            { id: 'm7', side: 'right', type: 'text', text: '我现在还在回味。' },
            { id: 'm8', side: 'left', type: 'text', text: '被你说得马上想去。' },
            { id: 'm9', side: 'right', type: 'text', text: '真的很适合慢慢坐。' },
            { id: 'm10', side: 'left', type: 'text', text: '那就说定了。' },
        ],
    },
    provider: 'volcano',
    requestId: 'chat_test',
};

test('posts normalized materials to the chat draft endpoint', async () => {
    const calls = [];
    const requestMaterials = {
        ...materials,
        location: {
            id: 'store-location',
            name: '深圳湖贝里',
            address: '深圳市罗湖区湖贝路1068号',
            city: '深圳市',
            lat: 22.546394,
            lng: 114.128133,
            fallback: true,
        },
    };
    const responseWithLocation = {
        ...response,
        draft: {
            ...response.draft,
            messages: [{
                id: 'm1',
                side: 'right',
                type: 'location_ref',
                refId: 'store-location',
            }, ...response.draft.messages.slice(1)],
        },
    };
    const draft = await requestChatDraft(requestMaterials, {
        apiJson: async (path, init) => {
            calls.push({ path, init });
            return responseWithLocation;
        },
    });

    assert.equal(calls[0].path, '/api/product-swap/chat-draft');
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
        templateId: 'wechat-chat-screenshot',
        ...requestMaterials,
        location: {
            id: 'store-location',
            name: '深圳湖贝里',
            address: '深圳市罗湖区湖贝路1068号',
            city: '深圳市',
            lat: 22.546394,
            lng: 114.128133,
        },
    });
    assert.equal(
        Object.hasOwn(
            JSON.parse(calls[0].init.body).location,
            'fallback',
        ),
        false,
    );
    assert.equal(draft.messages.length, 10);
});

test('rejects malformed browser responses', () => {
    assert.throws(
        () => normalizeChatDraftResponse({
            ...response,
            draft: {
                ...response.draft,
                messages: response.draft.messages.slice(0, 9),
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

test('accepts up to sixteen richer messages and enforces text budgets', () => {
    const messages = Array.from({ length: 16 }, (_, index) => ({
        id: `rich-${index + 1}`,
        side: index % 2 ? 'left' : 'right',
        type: 'text',
        text: index === 0 ? '太惊艳了！'.repeat(12) : '真的很想马上去。',
    }));
    const draft = normalizeChatDraftResponse({
        ...response,
        draft: {
            ...response.draft,
            messages,
        },
    }, materials);

    assert.equal(draft.messages.length, 16);
    assert.throws(
        () => normalizeChatDraftResponse({
            ...response,
            draft: {
                ...response.draft,
                messages: messages.map((message, index) => (
                    index === 0
                        ? { ...message, text: '长'.repeat(121) }
                        : message
                )),
            },
        }, materials),
        /文字/,
    );
    assert.throws(
        () => normalizeChatDraftResponse({
            ...response,
            draft: {
                ...response.draft,
                messages: messages.map((message) => ({
                    ...message,
                    text: '总字数预算'.repeat(13),
                })),
            },
        }, materials),
        /文字/,
    );
});
