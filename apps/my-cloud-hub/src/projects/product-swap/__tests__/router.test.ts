import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createProductSwapRouter } from '../router'
import {
    ProductSwapProviderError,
    type ProductSwapProvider,
} from '../provider'

const targetImage = 'data:image/png;base64,iVBORw0KGgo='

function createApp(provider: ProductSwapProvider) {
    const app = new Hono()
    app.route(
        '/api/product-swap',
        createProductSwapRouter(() => provider),
    )
    return app
}

describe('product swap router', () => {
    it('requires a target image', async () => {
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => ({ imageUrl: targetImage }),
        }
        const response = await createApp(provider).request(
            '/api/product-swap/generate',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            },
        )
        const data = await response.json() as any

        expect(response.status).toBe(400)
        expect(data.error.code).toBe('INVALID_INPUT')
    })

    it('returns the stable provider result', async () => {
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async (input) => {
                expect(input.requirements).toBe('保持排列')
                return { imageUrl: targetImage }
            },
        }
        const response = await createApp(provider).request(
            '/api/product-swap/generate',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetImage,
                    requirements: ' 保持排列 ',
                }),
            },
        )
        const data = await response.json() as any

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(data.provider).toBe('fake')
        expect(data.imageUrl).toBe(targetImage)
        expect(data.requestId).toMatch(/^swap_/)
        expect(data.conversationId).toMatch(/^conversation_/)
    })

    it('passes bounded conversation context for refinement', async () => {
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async (input) => {
                expect(input.previousImage).toBe(targetImage)
                expect(input.messages).toHaveLength(6)
                expect(input.messages[0].content).toBe('message 2')
                return {
                    imageUrl: targetImage,
                    assistantMessage: '已完成修正',
                }
            },
        }
        const response = await createApp(provider).request(
            '/api/product-swap/generate',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetImage,
                    previousImage: targetImage,
                    conversationId: 'conversation_existing',
                    requirements: '盘子改成白色',
                    messages: Array.from({ length: 8 }, (_, index) => ({
                        role: index % 2 ? 'assistant' : 'user',
                        content: `message ${index}`,
                    })),
                }),
            },
        )
        const data = await response.json() as any

        expect(response.status).toBe(200)
        expect(data.conversationId).toBe('conversation_existing')
        expect(data.assistantMessage).toBe('已完成修正')
    })

    it('maps provider timeouts to a stable gateway timeout', async () => {
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => {
                throw new ProductSwapProviderError(
                    'PROVIDER_TIMEOUT',
                    '生成超时',
                )
            },
        }
        const response = await createApp(provider).request(
            '/api/product-swap/generate',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetImage }),
            },
        )
        const data = await response.json() as any

        expect(response.status).toBe(504)
        expect(data.error.code).toBe('PROVIDER_TIMEOUT')
    })

    it('returns a stable unavailable response before volcano is configured', async () => {
        const app = new Hono()
        app.route(
            '/api/product-swap',
            createProductSwapRouter(),
        )
        const response = await app.request(
            '/api/product-swap/generate',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetImage }),
            },
        )
        const data = await response.json() as any

        expect(response.status).toBe(503)
        expect(data.error.code).toBe(
            'VOLCANO_PROVIDER_NOT_CONFIGURED',
        )
    })
})
