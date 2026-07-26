import {
    generateDishRankingDraft,
} from '../dish-ranking-provider'

const request = {
    templateId: 'dish-ranking-guide' as const,
    dishes: [
        {
            id: 'dish-0',
            image: 'data:image/png;base64,AA==',
            owned: true,
            source: 'user' as const,
        },
        {
            id: 'dish-1',
            image: 'data:image/png;base64,AQ==',
            owned: false,
            source: 'library' as const,
        },
    ],
}
const validDraft = {
    version: 1,
    items: [
        {
            refId: 'dish-0',
            tier: 'top',
            order: 0,
            comment: '闭眼冲',
        },
        {
            refId: 'dish-1',
            tier: 'good',
            order: 0,
            comment: '挺稳的',
        },
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

describe('dish ranking provider', () => {
    it('sends every dish to one multimodal chat request', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            arkResponse(JSON.stringify(validDraft)),
        )

        const result = await generateDishRankingDraft(request, {
            DOUBAO_API_KEY: 'secret',
            DOUBAO_CHAT_ENDPOINT: 'ep-vision',
        }, fetchMock)

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(
            'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        )
        expect(init.headers.Authorization).toBe('Bearer secret')
        const body = JSON.parse(String(init.body))
        expect(body.model).toBe('ep-vision')
        expect(body.stream).toBe(false)
        expect(body.messages[1].content.filter(
            (part: { type: string }) => part.type === 'image_url',
        )).toHaveLength(2)
        expect(result).toEqual({
            provider: 'volcano',
            draft: validDraft,
        })
    })

    it('does not retry an invalid model response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            arkResponse('not json'),
        )

        await expect(generateDishRankingDraft(request, {
            DOUBAO_API_KEY: 'secret',
            DOUBAO_CHAT_ENDPOINT: 'ep-vision',
        }, fetchMock)).rejects.toMatchObject({
            code: 'INVALID_DISH_RANKING_DRAFT',
        })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('requires server-side model configuration', async () => {
        await expect(generateDishRankingDraft(
            request,
            {},
            vi.fn(),
        )).rejects.toMatchObject({
            code: 'DISH_RANKING_PROVIDER_NOT_CONFIGURED',
        })
    })
})
