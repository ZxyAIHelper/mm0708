import { Hono, type Context } from 'hono'
import {
    ProductSwapProviderError,
    type ProductSwapEnv,
    type ProductSwapMessage,
    type ProductSwapProvider,
} from './provider'
import { volcanoProductSwapProvider } from './volcano-provider'

type Bindings = ProductSwapEnv

type GenerateBody = {
    targetImage?: unknown
    productImage?: unknown
    sceneImage?: unknown
    previousImage?: unknown
    requirements?: unknown
    conversationId?: unknown
    messages?: unknown
}

export type ProductSwapArchiveInput = {
    targetImage: string
    productImage?: string
    sceneImage?: string
    previousImage?: string
    requirements: string
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

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value
        ? value
        : undefined
}

function cleanMessages(value: unknown): ProductSwapMessage[] {
    if (!Array.isArray(value)) {
        return []
    }

    return value
        .filter((message): message is Record<string, unknown> =>
            Boolean(message) && typeof message === 'object',
        )
        .filter((message) =>
            (message.role === 'user'
                || message.role === 'assistant')
            && typeof message.content === 'string',
        )
        .slice(-6)
        .map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: String(message.content).trim().slice(0, 500),
        }))
        .filter((message) => Boolean(message.content))
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

        if (!body || typeof body.targetImage !== 'string') {
            return c.json(
                {
                    success: false,
                    error: {
                        code: 'INVALID_INPUT',
                        message: '请上传目标图',
                    },
                    requestId,
                },
                400,
            )
        }

        const requirements = typeof body.requirements === 'string'
            ? body.requirements.trim()
            : ''

        if (requirements.length > 500) {
            return c.json(
                {
                    success: false,
                    error: {
                        code: 'INVALID_INPUT',
                        message: '单次要求不能超过 500 字',
                    },
                    requestId,
                },
                400,
            )
        }

        const conversationId =
            typeof body.conversationId === 'string'
            && /^conversation_[\w-]{1,100}$/.test(
                body.conversationId,
            )
                ? body.conversationId
                : `conversation_${crypto.randomUUID()}`
        const provider = resolveProvider()
        const archiveInput: ProductSwapArchiveInput = {
            targetImage: body.targetImage,
            productImage: optionalString(body.productImage),
            sceneImage: optionalString(body.sceneImage),
            previousImage: optionalString(body.previousImage),
            requirements,
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
                    targetImage: archiveInput.targetImage,
                    productImage: archiveInput.productImage,
                    sceneImage: archiveInput.sceneImage,
                    previousImage: archiveInput.previousImage,
                    requirements,
                    requestId,
                    messages: cleanMessages(body.messages),
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
