import { describe, expect, it, vi } from 'vitest'
import {
    buildProductSwapPrompt,
    buildPromptComposerMessages,
} from '../prompt-builder'
import { createVolcanoProductSwapProvider } from '../volcano-provider'

const targetImage = 'data:image/png;base64,dGFyZ2V0'
const productImage = 'data:image/png;base64,cHJvZHVjdA=='
const previousImage = 'data:image/png;base64,cHJldmlvdXM='

describe('product swap prompt builder', () => {
    it('describes the ordered source images for initial generation', () => {
        const prompt = buildProductSwapPrompt({
            targetImage,
            productImage,
            requirements: '保持三份排列',
            requestId: 'swap_1',
            messages: [],
        })

        expect(prompt).toContain('图 1 是目标模板')
        expect(prompt).toContain('图 2 是待换入产品')
        expect(prompt).toContain('保持三份排列')
        expect(prompt).toContain('只替换菜品或商品主体')
    })

    it('prioritizes the previous result during refinement', () => {
        const messages = buildPromptComposerMessages({
            targetImage,
            productImage,
            previousImage,
            requirements: '把盘子改成白色，产品不要变',
            requestId: 'swap_2',
            messages: [
                { role: 'user', content: '第一次生成' },
                { role: 'assistant', content: '已生成第一版' },
            ],
        })

        const lastMessage = messages[messages.length - 1]
        expect(lastMessage.content).toContain('把盘子改成白色')
        expect(lastMessage.content).toContain('上一版结果')
        expect(messages).toHaveLength(4)
    })
})

describe('volcano product swap provider', () => {
    it('uses Doubao to compose the edit prompt and Seedream to generate', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                choices: [{
                    message: {
                        content: '保留模板构图，将图 2 产品替换到图 1。',
                    },
                }],
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: [{ url: 'https://image.example/result.jpg' }],
            }), { status: 200 }))
        const provider = createVolcanoProductSwapProvider(fetchImpl)

        const result = await provider.generate({
            targetImage,
            productImage,
            previousImage,
            requirements: '背景更暗一点',
            requestId: 'swap_3',
            messages: [],
        }, {
            DOUBAO_API_KEY: 'secret',
            DOUBAO_CHAT_ENDPOINT: 'ep-chat',
            DOUBAO_IMAGE_ENDPOINT_ID: 'ep-image',
        })

        expect(result.imageUrl).toBe('https://image.example/result.jpg')
        expect(result.assistantMessage).toContain('已根据你的要求')
        expect(fetchImpl).toHaveBeenCalledTimes(2)

        const [chatUrl, chatInit] = fetchImpl.mock.calls[0]
        expect(chatUrl).toContain('/chat/completions')
        expect(chatInit.headers.Authorization).toBe('Bearer secret')

        const [, imageInit] = fetchImpl.mock.calls[1]
        const imageBody = JSON.parse(String(imageInit.body))
        expect(imageBody.model).toBe('ep-image')
        expect(imageBody.image).toEqual([
            previousImage,
            targetImage,
            productImage,
        ])
        expect(imageBody.response_format).toBe('url')
    })

    it('maps a base64 image response to a data URL', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: [{ b64_json: 'aW1hZ2U=' }],
            }), { status: 200 }))
        const provider = createVolcanoProductSwapProvider(fetchImpl)

        const result = await provider.generate({
            targetImage,
            requirements: '',
            requestId: 'swap_4',
            messages: [],
        }, {
            DOUBAO_API_KEY: 'secret',
            DOUBAO_IMAGE_ENDPOINT_ID: 'ep-image',
        })

        expect(result.imageUrl).toBe(
            'data:image/jpeg;base64,aW1hZ2U=',
        )
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
})
