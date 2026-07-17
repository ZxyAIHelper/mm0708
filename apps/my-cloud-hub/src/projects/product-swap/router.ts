import { Hono } from 'hono'
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

        try {
            const result = await provider.generate(
                {
                    targetImage: body.targetImage,
                    productImage:
                        optionalString(body.productImage),
                    sceneImage:
                        optionalString(body.sceneImage),
                    previousImage:
                        optionalString(body.previousImage),
                    requirements,
                    requestId,
                    messages: cleanMessages(body.messages),
                },
                c.env,
            )

            return c.json({
                success: true,
                imageUrl: result.imageUrl,
                assistantMessage:
                    result.assistantMessage
                    || '已完成本次生成。',
                conversationId,
                provider: provider.name,
                requestId,
            })
        } catch (error) {
            if (error instanceof ProductSwapProviderError) {
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

            throw error
        }
    })

    return router
}

export default createProductSwapRouter()
