import {
    generateChatDraft,
} from '../chat-provider'

const request = {
    templateId: 'wechat-chat-screenshot' as const,
    storeName: '三山山',
    images: [{
        id: 'image-1',
        dataUrl: 'data:image/png;base64,AA==',
    }],
    location: null,
    requirements: '',
}

const validDraft = {
    version: 1,
    contactName: '小林',
    messages: [
        { id: 'm1', side: 'right', type: 'image_ref', refId: 'image-1' },
        { id: 'm2', side: 'left', type: 'text', text: '看着就很好吃。' },
        { id: 'm3', side: 'right', type: 'text', text: '味道也不错。' },
        { id: 'm4', side: 'left', type: 'text', text: '下次带我去。' },
        { id: 'm5', side: 'right', type: 'text', text: '可以呀。' },
        { id: 'm6', side: 'left', type: 'text', text: '说定了。' },
    ],
}

function arkResponse(content: string) {
    return new Response(JSON.stringify({
        choices: [{ message: { content } }],
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })
}

describe('chat draft provider', () => {
    it('calls only chat completions and returns the parsed draft', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            arkResponse(JSON.stringify(validDraft)),
        )
        const result = await generateChatDraft(request, {
            DOUBAO_API_KEY: 'secret',
            DOUBAO_CHAT_ENDPOINT: 'ep-chat',
        }, fetchMock)

        const [url, init] = fetchMock.mock.calls[0]
        const body = JSON.parse(String(init.body))
        expect(url).toBe(
            'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        )
        expect(body.model).toBe('ep-chat')
        expect(body.stream).toBe(false)
        expect(result.draft.messages).toHaveLength(6)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('repairs one invalid response and accepts the second', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(arkResponse('not json'))
            .mockResolvedValueOnce(
                arkResponse(JSON.stringify(validDraft)),
            )

        const result = await generateChatDraft(request, {
            DOUBAO_API_KEY: 'secret',
            DOUBAO_CHAT_ENDPOINT: 'ep-chat',
        }, fetchMock)

        expect(result.draft.contactName).toBe('小林')
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(JSON.parse(
            String(fetchMock.mock.calls[1][1].body),
        ).messages.at(-1).content).toContain('修复')
    })

    it('returns a stable error after a second invalid response', async () => {
        const fetchMock = vi.fn()
            .mockImplementation(async () => arkResponse('not json'))

        await expect(generateChatDraft(request, {
            DOUBAO_API_KEY: 'secret',
            DOUBAO_CHAT_ENDPOINT: 'ep-chat',
        }, fetchMock)).rejects.toMatchObject({
            code: 'INVALID_CHAT_DRAFT',
        })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})
