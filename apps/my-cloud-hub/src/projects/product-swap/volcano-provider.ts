import {
    ProductSwapProviderError,
    type ProductSwapInput,
    type ProductSwapProvider,
} from './provider'
import {
    buildProductSwapPrompt,
    buildPromptComposerMessages,
} from './prompt-builder'

const DEFAULT_ARK_BASE_URL =
    'https://ark.cn-beijing.volces.com/api/v3'

type ArkChatResponse = {
    choices?: Array<{
        message?: { content?: string }
    }>
}

type ArkImageResponse = {
    data?: Array<{
        url?: string
        b64_json?: string
    }>
}

function imageInputs(input: ProductSwapInput): string[] {
    return [
        input.previousImage,
        input.targetImage,
        input.productImage,
        input.sceneImage,
    ].filter((image): image is string => Boolean(image))
}

async function parseArkResponse<T>(
    response: Response,
): Promise<T> {
    const data = await response.json().catch(() => null)

    if (!response.ok || !data) {
        throw new ProductSwapProviderError(
            'PROVIDER_REQUEST_FAILED',
            `火山方舟请求失败（${response.status}）`,
        )
    }

    return data as T
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
            let prompt = buildProductSwapPrompt(input)

            try {
                if (env.DOUBAO_CHAT_ENDPOINT) {
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
                    const chatData =
                        await parseArkResponse<ArkChatResponse>(
                            chatResponse,
                        )
                    const composed = chatData.choices?.[0]
                        ?.message?.content?.trim()

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
                            image: imageInputs(input),
                            sequential_image_generation: 'disabled',
                            response_format: 'url',
                            size: '2K',
                            stream: false,
                            watermark: false,
                        }),
                        signal: AbortSignal.timeout(180_000),
                    },
                )
                const imageData =
                    await parseArkResponse<ArkImageResponse>(
                        imageResponse,
                    )
                const firstImage = imageData.data?.[0]
                const imageUrl = firstImage?.url
                    || (firstImage?.b64_json
                        ? `data:image/jpeg;base64,${firstImage.b64_json}`
                        : '')

                if (!imageUrl) {
                    throw new ProductSwapProviderError(
                        'PROVIDER_REQUEST_FAILED',
                        '火山方舟没有返回结果图片',
                    )
                }

                return {
                    imageUrl,
                    assistantMessage: input.previousImage
                        ? '已根据你的要求完成新一版修正。'
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
