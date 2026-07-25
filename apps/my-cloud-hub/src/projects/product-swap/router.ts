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
}

export type ProductSwapArchiveInput = {
    templateId: SupportedTemplateId
    targetImage: string
    productImage?: string
    sceneImage?: string
    previousImage?: string
    requirements: string
    aspectRatio?: '3:4' | 'original' | '9:16'
    showDateTime?: boolean
    generatedAt?: string
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
) {
    const router = new Hono<{ Bindings: Bindings }>()

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
