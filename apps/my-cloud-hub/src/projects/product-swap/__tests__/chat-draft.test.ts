import {
    buildChatDraftMessages,
    ChatDraftValidationError,
    parseChatDraft,
    parseChatDraftContent,
    validateChatDraftRequest,
} from '../chat-draft'

const validMessages = [
    { id: 'm1', side: 'right', type: 'image_ref', refId: 'image-1' },
    { id: 'm2', side: 'left', type: 'text', text: '看着就很好吃。' },
    { id: 'm3', side: 'right', type: 'location_ref', refId: 'store-location' },
    { id: 'm4', side: 'left', type: 'text', text: '位置也挺好找。' },
    { id: 'm5', side: 'right', type: 'text', text: '下次一起去。' },
    { id: 'm6', side: 'left', type: 'text', text: '可以呀。' },
]

const validRequest = {
    templateId: 'wechat-chat-screenshot',
    storeName: '三山山',
    images: [{
        id: 'image-1',
        dataUrl: 'data:image/png;base64,AA==',
    }],
    location: {
        id: 'store-location',
        name: '颐和园',
        address: '北京市海淀区新建宫门路19号',
        city: '北京市',
        lat: 39.998766,
        lng: 116.273938,
    },
    requirements: '像朋友聊天',
}

describe('chat draft contract', () => {
    it('validates and normalizes the request', () => {
        expect(validateChatDraftRequest(validRequest)).toEqual(validRequest)
    })

    it('accepts a complete structured draft', () => {
        expect(parseChatDraft({
            version: 1,
            contactName: '小林',
            messages: validMessages,
        }, {
            imageIds: ['image-1'],
            locationId: 'store-location',
        }).messages).toHaveLength(6)
    })

    it.each([
        ['unknown keys', { extra: true }],
        ['too few messages', { messages: validMessages.slice(0, 5) }],
        ['one-sided chat', {
            messages: validMessages.map((message) => ({
                ...message,
                side: 'left',
            })),
        }],
        ['unknown reference', {
            messages: validMessages.map((message, index) => (
                index === 0
                    ? { ...message, refId: 'image-9' }
                    : message
            )),
        }],
        ['duplicate ids', {
            messages: validMessages.map((message, index) => (
                index === 1 ? { ...message, id: 'm1' } : message
            )),
        }],
        ['long text', {
            messages: validMessages.map((message, index) => (
                index === 1
                    ? { ...message, text: '长'.repeat(81) }
                    : message
            )),
        }],
    ])('rejects %s', (_name, draftOverrides) => {
        expect(() => parseChatDraft({
            version: 1,
            contactName: '小林',
            messages: validMessages,
            ...draftOverrides,
        }, {
            imageIds: ['image-1'],
            locationId: 'store-location',
        })).toThrow(ChatDraftValidationError)
    })

    it('rejects missing or repeated supplied references', () => {
        const missingImage = validMessages.filter(
            (message) => message.type !== 'image_ref',
        )
        missingImage.push({
            id: 'm7',
            side: 'right',
            type: 'text',
            text: '补一句。',
        })
        expect(() => parseChatDraft({
            version: 1,
            contactName: '小林',
            messages: missingImage,
        }, {
            imageIds: ['image-1'],
            locationId: 'store-location',
        })).toThrow(/image-1/)

        const repeated = validMessages.map((message, index) => (
            index === 5
                ? {
                    id: 'm6',
                    side: 'left',
                    type: 'image_ref',
                    refId: 'image-1',
                }
                : message
        ))
        expect(() => parseChatDraft({
            version: 1,
            contactName: '小林',
            messages: repeated,
        }, {
            imageIds: ['image-1'],
            locationId: 'store-location',
        })).toThrow(/image-1/)
    })

    it('parses one outer markdown fence and builds safe prompt messages', () => {
        const content = `\`\`\`json
${JSON.stringify({
    version: 1,
    contactName: '小林',
    messages: validMessages,
})}
\`\`\``
        expect(parseChatDraftContent(content, {
            imageIds: ['image-1'],
            locationId: 'store-location',
        }).contactName).toBe('小林')

        const prompt = buildChatDraftMessages(
            validateChatDraftRequest(validRequest),
        )
        expect(prompt[0].role).toBe('system')
        expect(prompt[0].content).toContain(
            '{"version":1,"contactName"',
        )
        expect(prompt[0].content).toContain(
            'text 消息只能包含 id、side、type、text',
        )
        expect(prompt[1].content).toContain(
            '---BEGIN_UNTRUSTED_CHAT_MATERIALS---',
        )
        expect(prompt[1].content).toContain('"三山山"')
    })
})
