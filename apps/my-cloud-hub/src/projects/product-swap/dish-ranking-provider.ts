import {
    buildDishRankingMessages,
    DishRankingDraftValidationError,
    parseDishRankingDraftContent,
    type DishRankingDraft,
    type DishRankingDraftRequest,
} from './dish-ranking-draft'
import type { ProductSwapEnv } from './provider'

const DEFAULT_ARK_BASE_URL =
    'https://ark.cn-beijing.volces.com/api/v3'
const MAX_DISH_RANKING_RESPONSE_BYTES = 1024 * 1024

export class DishRankingProviderError extends Error {
    constructor(
        public readonly code:
            | 'DISH_RANKING_PROVIDER_NOT_CONFIGURED'
            | 'PROVIDER_REQUEST_FAILED'
            | 'PROVIDER_TIMEOUT'
            | 'INVALID_DISH_RANKING_DRAFT',
        message: string,
    ) {
        super(message)
        this.name = 'DishRankingProviderError'
    }
}

function rankingContent(value: unknown) {
    const data = value as {
        choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
        throw new DishRankingProviderError(
            'PROVIDER_REQUEST_FAILED',
            '评价模型没有返回内容',
        )
    }
    return content.trim()
}

async function readBoundedJson(response: Response) {
    const length = Number(response.headers.get('content-length'))
    if (
        Number.isFinite(length)
        && length > MAX_DISH_RANKING_RESPONSE_BYTES
    ) {
        throw new DishRankingProviderError(
            'PROVIDER_REQUEST_FAILED',
            '评价模型返回内容过大',
        )
    }
    const text = await response.text()
    if (
        new TextEncoder().encode(text).byteLength
        > MAX_DISH_RANKING_RESPONSE_BYTES
    ) {
        throw new DishRankingProviderError(
            'PROVIDER_REQUEST_FAILED',
            '评价模型返回内容过大',
        )
    }
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        data = null
    }
    if (!response.ok || !data) {
        throw new DishRankingProviderError(
            'PROVIDER_REQUEST_FAILED',
            `评价模型请求失败（${response.status}）`,
        )
    }
    return data
}

export async function generateDishRankingDraft(
    input: DishRankingDraftRequest,
    env: ProductSwapEnv,
    fetchImpl: typeof fetch = fetch,
): Promise<{
    draft: DishRankingDraft
    provider: 'volcano'
}> {
    if (!env.DOUBAO_API_KEY || !env.DOUBAO_CHAT_ENDPOINT) {
        throw new DishRankingProviderError(
            'DISH_RANKING_PROVIDER_NOT_CONFIGURED',
            '菜品评价服务尚未配置',
        )
    }
    const baseUrl = (
        env.DOUBAO_ARK_BASE_URL || DEFAULT_ARK_BASE_URL
    ).replace(/\/+$/, '')
    let content: string
    try {
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.DOUBAO_API_KEY}`,
            },
            body: JSON.stringify({
                model: env.DOUBAO_CHAT_ENDPOINT,
                messages: buildDishRankingMessages(input),
                stream: false,
            }),
            signal: AbortSignal.timeout(60_000),
        })
        content = rankingContent(await readBoundedJson(response))
    } catch (error) {
        if (error instanceof DishRankingProviderError) throw error
        if (
            error instanceof Error
            && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ) {
            throw new DishRankingProviderError(
                'PROVIDER_TIMEOUT',
                '菜品评价超时，请稍后重试',
            )
        }
        throw new DishRankingProviderError(
            'PROVIDER_REQUEST_FAILED',
            '菜品评价请求失败',
        )
    }
    try {
        return {
            draft: parseDishRankingDraftContent(
                content,
                input.dishes.map((dish) => dish.id),
            ),
            provider: 'volcano',
        }
    } catch (error) {
        if (!(error instanceof DishRankingDraftValidationError)) throw error
        throw new DishRankingProviderError(
            'INVALID_DISH_RANKING_DRAFT',
            error.message,
        )
    }
}
