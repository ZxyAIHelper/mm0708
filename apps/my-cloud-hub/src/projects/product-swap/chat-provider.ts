import {
    buildChatDraftMessages,
    ChatDraftValidationError,
    parseChatDraftContent,
    type ArkMessage,
    type ChatDraft,
    type ChatDraftRequest,
} from './chat-draft'
import type { ProductSwapEnv } from './provider'

const DEFAULT_ARK_BASE_URL =
    'https://ark.cn-beijing.volces.com/api/v3'
const MAX_CHAT_RESPONSE_BYTES = 1024 * 1024

export class ChatDraftProviderError extends Error {
    constructor(
        public readonly code:
            | 'CHAT_PROVIDER_NOT_CONFIGURED'
            | 'PROVIDER_REQUEST_FAILED'
            | 'PROVIDER_TIMEOUT'
            | 'INVALID_CHAT_DRAFT',
        message: string,
    ) {
        super(message)
        this.name = 'ChatDraftProviderError'
    }
}

function chatContent(value: unknown) {
    const data = value as {
        choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
        throw new ChatDraftProviderError(
            'PROVIDER_REQUEST_FAILED',
            '文本模型没有返回内容',
        )
    }
    return content.trim()
}

async function readBoundedJson(response: Response) {
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > MAX_CHAT_RESPONSE_BYTES) {
        throw new ChatDraftProviderError(
            'PROVIDER_REQUEST_FAILED',
            '文本模型返回内容过大',
        )
    }
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_CHAT_RESPONSE_BYTES) {
        throw new ChatDraftProviderError(
            'PROVIDER_REQUEST_FAILED',
            '文本模型返回内容过大',
        )
    }
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        data = null
    }
    if (!response.ok || !data) {
        throw new ChatDraftProviderError(
            'PROVIDER_REQUEST_FAILED',
            `文本模型请求失败（${response.status}）`,
        )
    }
    return data
}

async function callChat(
    url: string,
    endpoint: string,
    apiKey: string,
    messages: ArkMessage[],
    fetchImpl: typeof fetch,
) {
    try {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: endpoint,
                messages,
                stream: false,
            }),
            signal: AbortSignal.timeout(60_000),
        })
        return chatContent(await readBoundedJson(response))
    } catch (error) {
        if (error instanceof ChatDraftProviderError) throw error
        if (
            error instanceof Error
            && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ) {
            throw new ChatDraftProviderError(
                'PROVIDER_TIMEOUT',
                '文本生成超时，请稍后重试',
            )
        }
        throw new ChatDraftProviderError(
            'PROVIDER_REQUEST_FAILED',
            '文本生成请求失败',
        )
    }
}

export async function generateChatDraft(
    input: ChatDraftRequest,
    env: ProductSwapEnv,
    fetchImpl: typeof fetch = fetch,
): Promise<{
    draft: ChatDraft
    provider: 'volcano'
}> {
    if (!env.DOUBAO_API_KEY || !env.DOUBAO_CHAT_ENDPOINT) {
        throw new ChatDraftProviderError(
            'CHAT_PROVIDER_NOT_CONFIGURED',
            '聊天文本服务尚未配置',
        )
    }
    const baseUrl = (
        env.DOUBAO_ARK_BASE_URL || DEFAULT_ARK_BASE_URL
    ).replace(/\/+$/, '')
    const url = `${baseUrl}/chat/completions`
    const refs = {
        imageIds: input.images.map((image) => image.id),
        locationId: input.location?.id || null,
    }
    const messages = buildChatDraftMessages(input)
    let content = await callChat(
        url,
        env.DOUBAO_CHAT_ENDPOINT,
        env.DOUBAO_API_KEY,
        messages,
        fetchImpl,
    )
    try {
        return {
            draft: parseChatDraftContent(content, refs),
            provider: 'volcano',
        }
    } catch (error) {
        if (!(error instanceof ChatDraftValidationError)) throw error
        content = await callChat(
            url,
            env.DOUBAO_CHAT_ENDPOINT,
            env.DOUBAO_API_KEY,
            [...messages, {
                role: 'user',
                content: [
                    `上次输出无效：${error.message}`,
                    '请修复为严格符合原 schema 的 JSON；不要解释。',
                ].join('\n'),
            }],
            fetchImpl,
        )
    }
    try {
        return {
            draft: parseChatDraftContent(content, refs),
            provider: 'volcano',
        }
    } catch (error) {
        throw new ChatDraftProviderError(
            'INVALID_CHAT_DRAFT',
            error instanceof Error
                ? error.message
                : '模型返回的对话结构无效',
        )
    }
}
