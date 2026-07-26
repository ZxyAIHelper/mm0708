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
const MAX_LOCATION_SEARCH_BYTES = 512 * 1024
const MAP_UPSTREAM_REFERER = 'https://product-swap.mm0708.top/'
const FALLBACK_LOCATION = Object.freeze({
    id: 'fallback-shenzhen-hubeili',
    name: '深圳湖贝里',
    address: '深圳市罗湖区湖贝路1068号',
    city: '深圳市',
    lat: 22.546394,
    lng: 114.128133,
    fallback: true,
})

type LocationFallbackReason =
    | 'not_configured'
    | 'upstream_unavailable'
    | 'quota_exhausted'

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

function validMapCoordinates(lat: number, lng: number) {
    return Number.isFinite(lat)
        && Number.isFinite(lng)
        && lat >= 3.5
        && lat <= 53.6
        && lng >= 73.5
        && lng <= 135.1
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

    router.get('/location-search', async (c) => {
        const region = (c.req.query('region') || '').trim()
        const keyword = (c.req.query('keyword') || '').trim()
        const key = c.env?.TENCENT_MAP_KEY?.trim()
        if (
            !region
            || !keyword
            || region.length > 40
            || keyword.length > 40
        ) {
            return c.json({
                success: false,
                error: {
                    code: 'INVALID_INPUT',
                    message: '请填写有效的城市或区域和地点关键词',
                },
            }, 400)
        }

        const fallbackResponse = (reason: LocationFallbackReason) => {
            c.header('Cache-Control', 'no-store')
            return c.json({
                success: true,
                locations: [{ ...FALLBACK_LOCATION }],
                fallback: true,
                fallbackReason: reason,
            }, 200)
        }

        if (!key) {
            return fallbackResponse('not_configured')
        }

        const upstreamUrl = new URL(
            'https://apis.map.qq.com/ws/place/v1/search',
        )
        upstreamUrl.searchParams.set('boundary', `region(${region},1)`)
        upstreamUrl.searchParams.set('keyword', keyword)
        upstreamUrl.searchParams.set('page_size', '12')
        upstreamUrl.searchParams.set('page_index', '1')
        upstreamUrl.searchParams.set('output', 'json')
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
            return fallbackResponse('upstream_unavailable')
        }

        const contentLength = Number(
            upstream.headers.get('content-length'),
        )
        if (
            !upstream.ok
            || (
                Number.isFinite(contentLength)
                && contentLength > MAX_LOCATION_SEARCH_BYTES
            )
        ) {
            return fallbackResponse('upstream_unavailable')
        }
        const text = await upstream.text()
        if (
            new TextEncoder().encode(text).byteLength
                > MAX_LOCATION_SEARCH_BYTES
        ) {
            return fallbackResponse('upstream_unavailable')
        }
        let payload: unknown
        try {
            payload = JSON.parse(text)
        } catch {
            payload = null
        }
        const result = payload as {
            status?: unknown
            message?: unknown
            data?: unknown
        } | null
        if (
            !result
            || result.status !== 0
            || !Array.isArray(result.data)
        ) {
            console.warn('Tencent location search rejected', {
                upstreamStatus: upstream.status,
                resultStatus: result?.status,
                resultMessage: typeof result?.message === 'string'
                    ? result.message.slice(0, 120)
                    : undefined,
            })
            return fallbackResponse(
                result?.status === 121
                    ? 'quota_exhausted'
                    : 'upstream_unavailable',
            )
        }

        const locations = result.data.flatMap((item: unknown) => {
            const poi = item as {
                id?: unknown
                title?: unknown
                address?: unknown
                location?: { lat?: unknown; lng?: unknown }
                ad_info?: { city?: unknown }
            }
            const id = typeof poi?.id === 'string' ? poi.id.trim() : ''
            const name = typeof poi?.title === 'string'
                ? poi.title.trim()
                : ''
            const address = typeof poi?.address === 'string'
                ? poi.address.trim()
                : ''
            const city = typeof poi?.ad_info?.city === 'string'
                ? poi.ad_info.city.trim()
                : ''
            const lat = Number(poi?.location?.lat)
            const lng = Number(poi?.location?.lng)
            if (
                !id
                || !name
                || !address
                || !validMapCoordinates(lat, lng)
            ) {
                return []
            }
            return [{
                id,
                name,
                address,
                city,
                lat,
                lng,
            }]
        }).slice(0, 12)

        return c.json({
            success: true,
            locations,
        }, 200, {
            'Cache-Control': [
                'public',
                'max-age=3600',
                's-maxage=86400',
                'stale-if-error=604800',
            ].join(', '),
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
        upstreamUrl.searchParams.set('size', '640*260')
        upstreamUrl.searchParams.set('scale', '2')
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
