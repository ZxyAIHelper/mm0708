import { Hono, type Context } from 'hono'
import {
    ProductSwapProviderError,
    type ProductSwapEnv,
    type ProductSwapProvider,
} from './provider'
import {
    buildTemplateGeneration,
    TemplateValidationError,
    validateTemplateRequest,
    type SupportedTemplateId,
    type TemplateGeneration,
} from './template-strategies'
import { volcanoProductSwapProvider } from './volcano-provider'
import {
    ChatDraftValidationError,
    validateChatDraftRequest,
    type ChatDraftRequest,
} from './chat-draft'
import {
    ChatDraftProviderError,
    generateChatDraft,
} from './chat-provider'

type Bindings = ProductSwapEnv

type GenerateBody = {
    templateId?: unknown
    targetImage?: unknown
    productImage?: unknown
    sceneImage?: unknown
    previousImage?: unknown
    requirements?: unknown
    aspectRatio?: unknown
    showDateTime?: unknown
    generatedAt?: unknown
    conversationId?: unknown
    messages?: unknown
    dishes?: unknown
    layout?: unknown
}

export type ProductSwapArchiveInput = {
    templateId: SupportedTemplateId
    targetImage: string
    productImage?: string
    sceneImage?: string
    previousImage?: string
    requirements: string
    aspectRatio?: '3:4' | '1:1' | 'original' | '9:16'
    showDateTime?: boolean
    generatedAt?: string
    layout?: 'tier' | 'grid' | 'quad' | 'collage'
    dishCount?: number
    ownedDishCount?: number
}

export type ProductSwapArchiveResult = {
    imageUrl: string
    provider: string
    conversationId: string
    assistantMessage?: string
}

export type ProductSwapArchiveHandle = {
    taskId: string
    complete(result: ProductSwapArchiveResult): Promise<string | null>
    fail(code: string, message: string): Promise<void>
}

export type ProductSwapTaskArchive = {
    start(
        context: Context<{ Bindings: Bindings }>,
        input: ProductSwapArchiveInput,
    ): Promise<ProductSwapArchiveHandle>
}

const defaultTaskArchive: ProductSwapTaskArchive = {
    async start() {
        return {
            taskId: '',
            complete: async () => null,
            fail: async () => undefined,
        }
    },
}

type ProductSwapRouterOptions = {
    chatGenerator?: typeof generateChatDraft
    fetchImpl?: typeof fetch
}

const MAX_MAP_BYTES = 2 * 1024 * 1024
const MAP_UPSTREAM_REFERER = 'https://product-swap.mm0708.top/'

function chatProviderStatus(code: ChatDraftProviderError['code']) {
    if (code === 'CHAT_PROVIDER_NOT_CONFIGURED') return 503 as const
    if (code === 'PROVIDER_TIMEOUT') return 504 as const
    return 502 as const
}

function mapCoordinates(c: Context<{ Bindings: Bindings }>) {
    const lat = Number(c.req.query('lat'))
    const lng = Number(c.req.query('lng'))
    if (
        !Number.isFinite(lat)
        || !Number.isFinite(lng)
        || lat < 3.5
        || lat > 53.6
        || lng < 73.5
        || lng > 135.1
    ) {
        return null
    }
    return { lat, lng }
}

function providerStatus(code: ProductSwapProviderError['code']) {
    if (code === 'VOLCANO_PROVIDER_NOT_CONFIGURED') {
        return 503 as const
    }
    if (code === 'PROVIDER_TIMEOUT') {
        return 504 as const
    }
    return 502 as const
}

export function createProductSwapRouter(
    resolveProvider: () => ProductSwapProvider =
        () => volcanoProductSwapProvider,
    taskArchive: ProductSwapTaskArchive = defaultTaskArchive,
    options: ProductSwapRouterOptions = {},
) {
    const router = new Hono<{ Bindings: Bindings }>()
    const chatGenerator = options.chatGenerator || generateChatDraft
    const fetchImpl = options.fetchImpl || fetch

    router.post('/chat-draft', async (c) => {
        const requestId = `chat_${crypto.randomUUID()}`
        let input: ChatDraftRequest
        try {
            input = validateChatDraftRequest(
                await c.req.json().catch(() => null),
            )
        } catch (error) {
            if (!(error instanceof ChatDraftValidationError)) throw error
            return c.json({
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                },
                requestId,
            }, 400)
        }
        try {
            const result = await chatGenerator(input, c.env)
            return c.json({
                success: true,
                draft: result.draft,
                provider: result.provider,
                requestId,
            })
        } catch (error) {
            if (!(error instanceof ChatDraftProviderError)) throw error
            return c.json({
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                },
                requestId,
            }, chatProviderStatus(error.code))
        }
    })

    router.get('/map-config', (c) => {
        const key = c.env?.TENCENT_MAP_KEY?.trim()
        const referer = c.env?.TENCENT_MAP_REFERER?.trim()
        if (!key || !referer) {
            return c.json({
                success: false,
                error: {
                    code: 'TENCENT_MAP_NOT_CONFIGURED',
                    message: '腾讯地图尚未配置',
                },
            }, 503)
        }
        return c.json({
            success: true,
            key,
            referer,
        }, 200, {
            'Cache-Control': 'public, max-age=300',
        })
    })

    router.get('/map-preview', async (c) => {
        const coordinates = mapCoordinates(c)
        const key = c.env?.TENCENT_MAP_KEY?.trim()
        if (!coordinates) {
            return c.json({
                success: false,
                error: {
                    code: 'INVALID_INPUT',
                    message: '地图坐标无效',
                },
            }, 400)
        }
        if (!key) {
            return c.json({
                success: false,
                error: {
                    code: 'TENCENT_MAP_NOT_CONFIGURED',
                    message: '腾讯地图尚未配置',
                },
            }, 503)
        }
        const upstreamUrl = new URL(
            'https://apis.map.qq.com/ws/staticmap/v2/',
        )
        const center = `${coordinates.lat},${coordinates.lng}`
        upstreamUrl.searchParams.set('center', center)
        upstreamUrl.searchParams.set('zoom', '16')
        upstreamUrl.searchParams.set('size', '720*260')
        upstreamUrl.searchParams.set('maptype', 'roadmap')
        upstreamUrl.searchParams.set(
            'markers',
            `size:large|color:0x07C160|${center}`,
        )
        upstreamUrl.searchParams.set('key', key)

        let upstream: Response
        try {
            upstream = await fetchImpl(upstreamUrl.toString(), {
                headers: {
                    Referer: MAP_UPSTREAM_REFERER,
                },
                signal: AbortSignal.timeout(15_000),
            })
        } catch {
            return c.json({
                success: false,
                error: {
                    code: 'MAP_PREVIEW_FAILED',
                    message: '地图预览暂时不可用',
                },
            }, 502)
        }
        const contentLength = Number(
            upstream.headers.get('content-length'),
        )
        const contentType = (
            upstream.headers.get('content-type') || ''
        ).toLowerCase()
        if (
            !upstream.ok
            || !contentType.startsWith('image/')
            || (
                Number.isFinite(contentLength)
                && contentLength > MAX_MAP_BYTES
            )
        ) {
            return c.json({
                success: false,
                error: {
                    code: 'MAP_PREVIEW_FAILED',
                    message: '地图预览暂时不可用',
                },
            }, 502)
        }
        const bytes = await upstream.arrayBuffer()
        if (bytes.byteLength > MAX_MAP_BYTES) {
            return c.json({
                success: false,
                error: {
                    code: 'MAP_PREVIEW_FAILED',
                    message: '地图预览暂时不可用',
                },
            }, 502)
        }
        return new Response(bytes, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
            },
        })
    })

    router.post('/generate', async (c) => {
        const requestId = `swap_${crypto.randomUUID()}`
        const body = await c.req.json<GenerateBody>()
            .catch(() => null)
        let generation: TemplateGeneration

        try {
            generation = buildTemplateGeneration(
                validateTemplateRequest(body),
            )
        } catch (error) {
            if (!(error instanceof TemplateValidationError)) {
                throw error
            }
            return c.json(
                {
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message,
                    },
                    requestId,
                },
                400,
            )
        }

        const conversationId = generation.conversationId
            || `conversation_${crypto.randomUUID()}`
        const provider = resolveProvider()
        const archiveInput: ProductSwapArchiveInput = {
            templateId: generation.templateId,
            targetImage: generation.targetImage,
            productImage: generation.templateId === 'product-swap'
                ? generation.productImage
                : undefined,
            sceneImage: generation.templateId === 'product-swap'
                ? generation.sceneImage
                : undefined,
            previousImage: generation.previousImage,
            requirements: generation.requirements,
            aspectRatio:
                generation.templateId === 'food-copy-layout'
                || generation.templateId === 'dish-ranking-guide'
                    ? generation.aspectRatio
                    : undefined,
            showDateTime:
                generation.templateId === 'food-copy-layout'
                    ? generation.showDateTime
                    : undefined,
            generatedAt:
                generation.templateId === 'food-copy-layout'
                    ? generation.generatedAt
                    : undefined,
            layout:
                generation.templateId === 'dish-ranking-guide'
                    ? generation.layout
                    : undefined,
            dishCount:
                generation.templateId === 'dish-ranking-guide'
                    ? generation.dishes.length
                    : undefined,
            ownedDishCount:
                generation.templateId === 'dish-ranking-guide'
                    ? generation.dishes.filter(
                        (dish) => dish.owned,
                    ).length
                    : undefined,
        }
        let archive: ProductSwapArchiveHandle

        try {
            archive = await taskArchive.start(c, archiveInput)
        } catch (error) {
            console.error(JSON.stringify({
                event: 'product_swap_input_archive_failed',
                requestId,
                error: error instanceof Error
                    ? error.message
                    : 'unknown',
            }))
            return c.json({
                success: false,
                error: {
                    code: 'TASK_HISTORY_UNAVAILABLE',
                    message: '任务记录暂时不可用，请稍后重试',
                },
                conversationId,
                requestId,
            }, 503)
        }

        try {
            const result = await provider.generate(
                {
                    ...generation,
                    requestId,
                },
                c.env,
            )
            const archiveWarning = await archive.complete({
                imageUrl: result.imageUrl,
                provider: provider.name,
                conversationId,
                assistantMessage: result.assistantMessage,
            })

            return c.json({
                success: true,
                imageUrl: result.imageUrl,
                assistantMessage:
                    result.assistantMessage
                    || '已完成本次生成。',
                conversationId,
                provider: provider.name,
                requestId,
                taskId: archive.taskId,
                archiveWarning,
            })
        } catch (error) {
            if (error instanceof ProductSwapProviderError) {
                await archive.fail(error.code, error.message)
                    .catch(() => undefined)
                return c.json(
                    {
                        success: false,
                        error: {
                            code: error.code,
                            message: error.message,
                        },
                        conversationId,
                        requestId,
                    },
                    providerStatus(error.code),
                )
            }

            await archive.fail(
                'PROVIDER_REQUEST_FAILED',
                error instanceof Error
                    ? error.message
                    : '图片生成失败',
            ).catch(() => undefined)
            throw error
        }
    })

    return router
}

export default createProductSwapRouter()
