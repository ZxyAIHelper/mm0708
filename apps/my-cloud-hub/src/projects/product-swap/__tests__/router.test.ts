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
import type {
    ChatDraftRequest,
} from '../chat-draft'

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
    it('returns a structured chat draft', async () => {
        const chatGenerator = vi.fn(async (
            input: ChatDraftRequest,
        ) => ({
            provider: 'volcano' as const,
            draft: {
                version: 1 as const,
                contactName: '小林',
                messages: [
                    { id: 'm1', side: 'right' as const, type: 'text' as const, text: input.storeName },
                    { id: 'm2', side: 'left' as const, type: 'text' as const, text: '看着不错。' },
                    { id: 'm3', side: 'right' as const, type: 'text' as const, text: '味道也很好。' },
                    { id: 'm4', side: 'left' as const, type: 'text' as const, text: '下次一起去。' },
                    { id: 'm5', side: 'right' as const, type: 'text' as const, text: '好呀。' },
                    { id: 'm6', side: 'left' as const, type: 'text' as const, text: '说定了。' },
                ],
            },
        }))
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => ({ imageUrl: targetImage }),
        }
        const app = new Hono()
        app.route('/api/product-swap', createProductSwapRouter(
            () => provider,
            noOpArchive,
            { chatGenerator },
        ))
        const response = await app.request(
            '/api/product-swap/chat-draft',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: 'wechat-chat-screenshot',
                    storeName: '三山山',
                    images: [],
                    location: null,
                    requirements: '',
                }),
            },
        )
        const data = await response.json() as any

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(data.provider).toBe('volcano')
        expect(data.draft.messages).toHaveLength(6)
        expect(data.requestId).toMatch(/^chat_/)
        expect(chatGenerator).toHaveBeenCalledOnce()
    })

    it('returns public Tencent picker configuration', async () => {
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => ({ imageUrl: targetImage }),
        }
        const response = await createApp(provider).request(
            '/api/product-swap/map-config',
            undefined,
            {
                TENCENT_MAP_KEY: 'map-key',
                TENCENT_MAP_REFERER: 'product-swap',
            },
        )

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            success: true,
            key: 'map-key',
            referer: 'product-swap',
        })
    })

    it('proxies only a fixed Tencent static map request', async () => {
        const fetchMock = vi.fn(async () => new Response(
            new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
            {
                status: 200,
                headers: { 'Content-Type': 'image/png' },
            },
        ))
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => ({ imageUrl: targetImage }),
        }
        const app = new Hono()
        app.route('/api/product-swap', createProductSwapRouter(
            () => provider,
            noOpArchive,
            { fetchImpl: fetchMock },
        ))
        const response = await app.request(
            '/api/product-swap/map-preview?lat=39.998766&lng=116.273938',
            undefined,
            {
                TENCENT_MAP_KEY: 'map-key',
                TENCENT_MAP_REFERER: 'product-swap',
            },
        )
        const url = new URL(fetchMock.mock.calls[0][0] as string)

        expect(response.status).toBe(200)
        expect(url.origin).toBe('https://apis.map.qq.com')
        expect(url.pathname).toBe('/ws/staticmap/v2/')
        expect(url.searchParams.get('zoom')).toBe('16')
        expect(url.searchParams.get('size')).toBe('720*260')
        expect(url.searchParams.get('maptype')).toBe('roadmap')
        expect(url.searchParams.get('key')).toBe('map-key')
        expect(url.searchParams.get('markers')).toContain(
            '39.998766,116.273938',
        )
        expect(response.headers.get('Cache-Control')).toBe(
            'public, max-age=86400',
        )
    })

    it.each([
        '',
        '?lat=abc&lng=116',
        '?lat=90&lng=116',
        '?lat=39&lng=200',
    ])('rejects invalid map coordinates %s', async (query) => {
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => ({ imageUrl: targetImage }),
        }
        const response = await createApp(provider).request(
            `/api/product-swap/map-preview${query}`,
            undefined,
            {
                TENCENT_MAP_KEY: 'map-key',
                TENCENT_MAP_REFERER: 'product-swap',
            },
        )
        expect(response.status).toBe(400)
    })

    it('routes a browser-shaped dish ranking guide request', async () => {
        const ownedDishImage =
            'data:image/png;base64,b3duZWQ='
        const otherDishImage =
            'data:image/png;base64,b3RoZXI='
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async (input) => {
                expect(input.templateId).toBe('dish-ranking-guide')
                expect(input.images).toEqual([
                    ownedDishImage,
                    otherDishImage,
                ])
                expect(input.prompt).toContain(
                    '自家菜品必须获得最高档位或最强视觉权重',
                )
                return { imageUrl: targetImage }
            },
        }
        const response = await createApp(provider).request(
            '/api/product-swap/generate',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: 'dish-ranking-guide',
                    dishes: [
                        {
                            image: ownedDishImage,
                            owned: true,
                            source: 'user',
                        },
                        {
                            image: otherDishImage,
                            owned: false,
                            source: 'library',
                        },
                    ],
                    layout: 'tier',
                    aspectRatio: '3:4',
                    requirements: '标题醒目一点',
                    messages: [],
                }),
            },
        )

        expect(response.status).toBe(200)
    })

    it('routes a browser-shaped food copy layout request', async () => {
        let archived: unknown
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async (input) => {
                expect(input.templateId).toBe('food-copy-layout')
                expect(input.prompt).toContain('真实随手分享')
                expect(input.prompt).toContain('2026-07-25 18:00')
                expect(input.prompt).toContain(
                    '不得编造店名、价格、地点、菜名或食材',
                )
                expect(input.images).toEqual([targetImage])
                expect(input.requirements).toBe('突出分量足')
                return { imageUrl: targetImage }
            },
        }
        const archive: ProductSwapTaskArchive = {
            start: async (_context, input) => {
                archived = input
                return {
                    taskId: 'food_initial',
                    complete: async () => null,
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
                    templateId: 'food-copy-layout',
                    targetImage,
                    aspectRatio: '3:4',
                    showDateTime: true,
                    generatedAt: '2026-07-25T10:00:00.000Z',
                    requirements: '  突出分量足  ',
                    messages: [],
                }),
            },
        )

        expect(response.status).toBe(200)
        expect(archived).toMatchObject({
            templateId: 'food-copy-layout',
            aspectRatio: '3:4',
            showDateTime: true,
            generatedAt: '2026-07-25T10:00:00.000Z',
            requirements: '突出分量足',
        })
        expect(archived).not.toHaveProperty('images')
    })

    it('keeps the legacy product-swap fallback', async () => {
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async (input) => {
                expect(input.templateId).toBe('product-swap')
                expect(input.prompt).toContain('只替换菜品或商品主体')
                expect(input.images).toEqual([targetImage])
                return { imageUrl: targetImage }
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

        expect(response.status).toBe(200)
    })

    it.each([
        [
            { templateId: 'coming-soon', targetImage },
            'INVALID_TEMPLATE',
            '模板不可用',
        ],
        [
            {
                templateId: 'food-copy-layout',
                targetImage,
                aspectRatio: '1:1',
            },
            'INVALID_INPUT',
            '画布比例无效',
        ],
        [
            {
                templateId: 'food-copy-layout',
                targetImage,
                showDateTime: 'true',
            },
            'INVALID_INPUT',
            '显示日期时间无效',
        ],
        [
            {
                templateId: 'food-copy-layout',
                targetImage,
                generatedAt: '2026-07-25T10:00:00',
            },
            'INVALID_INPUT',
            '日期时间无效',
        ],
        [
            {
                templateId: 'food-copy-layout',
                targetImage: 42,
            },
            'INVALID_INPUT',
            '菜品图片无效',
        ],
        [
            { templateId: 'food-copy-layout' },
            'INVALID_INPUT',
            '请上传菜品图片',
        ],
        [
            {
                templateId: 'food-copy-layout',
                targetImage,
                messages: 'invalid',
            },
            'INVALID_INPUT',
            'messages 无效',
        ],
    ])(
        'rejects invalid template input %#',
        async (body, code, message) => {
            const provider: ProductSwapProvider = {
                name: 'fake',
                generate: async () => ({ imageUrl: targetImage }),
            }
            const response = await createApp(provider).request(
                '/api/product-swap/generate',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                },
            )
            const data = await response.json() as {
                error: { code: string; message: string }
            }

            expect(response.status).toBe(400)
            expect(data.error).toEqual({ code, message })
        },
    )

    it('orders food refinement images and archives its settings', async () => {
        let archived: unknown
        const previousImage =
            'data:image/jpeg;base64,cHJldmlvdXM='
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async (input) => {
                expect(input.images).toEqual([
                    previousImage,
                    targetImage,
                ])
                expect(input.prompt).toContain(
                    '只修改用户明确指定的内容',
                )
                expect(input.messages).toHaveLength(6)
                return { imageUrl: targetImage }
            },
        }
        const archive: ProductSwapTaskArchive = {
            start: async (_context, input) => {
                archived = input
                return {
                    taskId: 'food_refinement',
                    complete: async () => null,
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
                    templateId: 'food-copy-layout',
                    targetImage,
                    previousImage,
                    aspectRatio: 'original',
                    showDateTime: false,
                    requirements: '文案短一点',
                    messages: Array.from(
                        { length: 8 },
                        (_, index) => ({
                            role: index % 2 ? 'assistant' : 'user',
                            content: `message ${index}`,
                        }),
                    ),
                }),
            },
        )

        expect(response.status).toBe(200)
        expect(archived).toMatchObject({
            templateId: 'food-copy-layout',
            aspectRatio: 'original',
            showDateTime: false,
            requirements: '文案短一点',
        })
        expect(archived).not.toHaveProperty('images')
    })

    it('generates without any task storage bindings by default', async () => {
        const provider: ProductSwapProvider = {
            name: 'fake',
            generate: async () => ({ imageUrl: targetImage }),
        }
        const app = new Hono()
        app.route(
            '/api/product-swap',
            createProductSwapRouter(() => provider),
        )
        const response = await app.request('/api/product-swap/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetImage }),
        })

        expect(response.status).toBe(200)
        expect((await response.json() as any).success).toBe(true)
    })

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
