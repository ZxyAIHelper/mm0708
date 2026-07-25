import {
    ProductSwapProviderError,
    type ProductSwapProvider,
} from './provider'
import {
    buildPromptComposerMessages,
} from './prompt-builder'

const DEFAULT_ARK_BASE_URL =
    'https://ark.cn-beijing.volces.com/api/v3'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_RESPONSE_BYTES =
    Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64 * 1024
const MAX_CHAT_RESPONSE_BYTES = 1024 * 1024

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return Boolean(value)
        && typeof value === 'object'
        && !Array.isArray(value)
}

async function readBoundedJson(
    response: Response,
    maxBytes: number,
): Promise<unknown> {
    const contentLength = Number(
        response.headers.get('content-length'),
    )
    if (
        Number.isFinite(contentLength)
        && contentLength > maxBytes
    ) {
        throw new ProductSwapProviderError(
            'PROVIDER_REQUEST_FAILED',
            '火山方舟返回内容过大',
        )
    }

    const reader = response.body?.getReader()
    if (!reader) {
        throw new ProductSwapProviderError(
            'PROVIDER_REQUEST_FAILED',
            `火山方舟请求失败（${response.status}）`,
        )
    }
    const chunks: Uint8Array[] = []
    let totalBytes = 0

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }
            totalBytes += value.byteLength
            if (totalBytes > maxBytes) {
                await reader.cancel()
                throw new ProductSwapProviderError(
                    'PROVIDER_REQUEST_FAILED',
                    '火山方舟返回内容过大',
                )
            }
            chunks.push(value)
        }
    } finally {
        reader.releaseLock()
    }

    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    }
    let data: unknown
    try {
        data = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
        data = null
    }

    if (!response.ok || !data) {
        throw new ProductSwapProviderError(
            'PROVIDER_REQUEST_FAILED',
            `火山方舟请求失败（${response.status}）`,
        )
    }

    return data
}

function chatContent(data: unknown): string | undefined {
    if (!isRecord(data) || !Array.isArray(data.choices)) {
        return undefined
    }
    const first = data.choices[0]
    if (!isRecord(first) || !isRecord(first.message)) {
        return undefined
    }
    return typeof first.message.content === 'string'
        ? first.message.content.trim()
        : undefined
}

function base64Value(character: string): number {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        .indexOf(character)
}

function isCanonicalBoundedBase64(value: unknown): value is string {
    if (
        typeof value !== 'string'
        || !value
        || value.length % 4 !== 0
        || value.length > MAX_IMAGE_RESPONSE_BYTES
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            value,
        )
    ) {
        return false
    }
    const padding = value.endsWith('==')
        ? 2
        : value.endsWith('=')
            ? 1
            : 0
    if (
        padding === 2
        && (base64Value(value[value.length - 3]) & 15) !== 0
    ) {
        return false
    }
    if (
        padding === 1
        && (base64Value(value[value.length - 2]) & 3) !== 0
    ) {
        return false
    }
    const decodedBytes = value.length / 4 * 3 - padding
    return decodedBytes <= MAX_IMAGE_BYTES
}

function imageBase64(data: unknown): string | undefined {
    if (!isRecord(data) || !Array.isArray(data.data)) {
        return undefined
    }
    const first = data.data[0]
    if (!isRecord(first)) {
        return undefined
    }
    return isCanonicalBoundedBase64(first.b64_json)
        ? first.b64_json
        : undefined
}

export function createVolcanoProductSwapProvider(
    fetchImpl: typeof fetch = fetch,
): ProductSwapProvider {
    return {
        name: 'volcano',

        async generate(input, env) {
            const endpointId =
                env?.DOUBAO_PRODUCT_SWAP_ENDPOINT_ID
                || env?.DOUBAO_IMAGE_ENDPOINT_ID

            if (!env?.DOUBAO_API_KEY || !endpointId) {
                throw new ProductSwapProviderError(
                    'VOLCANO_PROVIDER_NOT_CONFIGURED',
                    '火山换品服务尚未配置',
                )
            }

            const baseUrl = (
                env.DOUBAO_ARK_BASE_URL
                || DEFAULT_ARK_BASE_URL
            ).replace(/\/+$/, '')
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.DOUBAO_API_KEY}`,
            }
            let prompt = input.prompt

            try {
                if (
                    input.templateId === 'product-swap'
                    && env.DOUBAO_CHAT_ENDPOINT
                ) {
                    const chatResponse = await fetchImpl(
                        `${baseUrl}/chat/completions`,
                        {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                                model: env.DOUBAO_CHAT_ENDPOINT,
                                messages:
                                    buildPromptComposerMessages(input),
                                stream: false,
                            }),
                            signal: AbortSignal.timeout(60_000),
                        },
                    )
                    const chatData = await readBoundedJson(
                        chatResponse,
                        MAX_CHAT_RESPONSE_BYTES,
                    )
                    const composed = chatContent(chatData)

                    if (composed) {
                        prompt = composed
                    }
                }

                const imageResponse = await fetchImpl(
                    `${baseUrl}/images/generations`,
                    {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            model: endpointId,
                            prompt,
                            image: input.images,
                            sequential_image_generation: 'disabled',
                            response_format: 'b64_json',
                            n: 1,
                            size: '2K',
                            stream: false,
                            watermark: false,
                        }),
                        signal: AbortSignal.timeout(180_000),
                    },
                )
                const imageData = await readBoundedJson(
                    imageResponse,
                    MAX_IMAGE_RESPONSE_BYTES,
                )
                const encodedImage = imageBase64(imageData)

                if (!encodedImage) {
                    throw new ProductSwapProviderError(
                        'PROVIDER_REQUEST_FAILED',
                        '火山方舟没有返回结果图片',
                    )
                }

                return {
                    imageUrl:
                        `data:image/jpeg;base64,${encodedImage}`,
                    assistantMessage: input.previousImage
                        ? '已根据你的要求完成新一版修正。'
                        : input.templateId === 'food-copy-layout'
                            ? '已完成第一版文案配图，可以继续告诉我需要调整的地方。'
                            : '已完成第一版换品，可以继续告诉我需要调整的地方。',
                    metadata: { prompt },
                }
            } catch (error) {
                if (error instanceof ProductSwapProviderError) {
                    throw error
                }

                if (
                    error instanceof DOMException
                    && error.name === 'TimeoutError'
                ) {
                    throw new ProductSwapProviderError(
                        'PROVIDER_TIMEOUT',
                        '火山方舟生成超时，请稍后重试',
                    )
                }

                throw new ProductSwapProviderError(
                    'PROVIDER_REQUEST_FAILED',
                    '火山方舟请求失败',
                )
            }
        },
    }
}

export const volcanoProductSwapProvider =
    createVolcanoProductSwapProvider()
