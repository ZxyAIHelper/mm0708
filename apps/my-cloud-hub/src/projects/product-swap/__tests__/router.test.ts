import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import {
    createProductSwapRouter,
    type ProductSwapTaskArchive,
} from '../router'
import {
    ProductSwapProviderError,
    type ProductSwapProvider,
} from '../provider'

const targetImage = 'data:image/png;base64,iVBORw0KGgo='

const noOpArchive: ProductSwapTaskArchive = {
    start: async () => ({
        taskId: 'task_test',
        complete: async () => null,
        fail: async () => undefined,
    }),
}

function createApp(
    provider: ProductSwapProvider,
    archive: ProductSwapTaskArchive = noOpArchive,
) {
    const app = new Hono()
    app.route(
        '/api/product-swap',
        createProductSwapRouter(() => provider, archive),
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
        expect(data.taskId).toBe('task_test')
        expect(data.archiveWarning).toBeNull()
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
        let failed: unknown
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => {
                throw new ProductSwapProviderError(
                    'PROVIDER_TIMEOUT',
                    '生成超时',
                )
            },
        }
        const archive: ProductSwapTaskArchive = {
            start: async () => ({
                taskId: 'task_failed',
                complete: async () => null,
                fail: async (code, message) => {
                    failed = { code, message }
                },
            }),
        }
        const response = await createApp(provider, archive).request(
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
        expect(failed).toEqual({
            code: 'PROVIDER_TIMEOUT',
            message: '生成超时',
        })
    })

    it('archives sanitized inputs and the generated output', async () => {
        let started: any
        let completed: any
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => ({ imageUrl: targetImage }),
        }
        const archive: ProductSwapTaskArchive = {
            start: async (_context, input) => {
                started = input
                return {
                    taskId: 'task_archived',
                    complete: async (result) => {
                        completed = result
                        return null
                    },
                    fail: async () => undefined,
                }
            },
        }
        const response = await createApp(provider, archive).request(
            '/api/product-swap/generate',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetImage,
                    productImage: targetImage,
                    requirements: '  淇濇寔鎺掑垪  ',
                }),
            },
        )
        const data = await response.json() as any

        expect(started.requirements).toBe('淇濇寔鎺掑垪')
        expect(started.targetImage).toBe(targetImage)
        expect(started.productImage).toBe(targetImage)
        expect(completed.imageUrl).toBe(targetImage)
        expect(completed.provider).toBe('fake')
        expect(data.taskId).toBe('task_archived')
    })

    it('keeps generation successful when output archiving fails', async () => {
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => ({ imageUrl: targetImage }),
        }
        const archive: ProductSwapTaskArchive = {
            start: async () => ({
                taskId: 'task_warning',
                complete: async () => '图片暂未保存到任务记录',
                fail: async () => undefined,
            }),
        }
        const response = await createApp(provider, archive).request(
            '/api/product-swap/generate',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetImage }),
            },
        )
        const data = await response.json() as any

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(data.archiveWarning).toBe('图片暂未保存到任务记录')
    })

    it('does not call the provider when input archiving fails', async () => {
        const consoleError = vi.spyOn(console, 'error')
            .mockImplementation(() => undefined)
        let providerCalled = false
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => {
                providerCalled = true
                return { imageUrl: targetImage }
            },
        }
        const archive: ProductSwapTaskArchive = {
            start: async () => {
                throw new Error('R2 unavailable')
            },
        }
        const response = await createApp(provider, archive).request(
            '/api/product-swap/generate',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetImage }),
            },
        )
        const data = await response.json() as any

        expect(response.status).toBe(503)
        expect(data.error.code).toBe('TASK_HISTORY_UNAVAILABLE')
        expect(providerCalled).toBe(false)
        consoleError.mockRestore()
    })

    it('returns a stable unavailable response before volcano is configured', async () => {
        const app = new Hono()
        app.route(
            '/api/product-swap',
            createProductSwapRouter(undefined, noOpArchive),
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
