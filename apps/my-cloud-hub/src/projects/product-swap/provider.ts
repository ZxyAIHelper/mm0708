export type ProductSwapInput = {
    templateId: 'product-swap' | 'food-copy-layout'
    prompt: string
    images: string[]
    targetImage: string
    productImage?: string
    sceneImage?: string
    previousImage?: string
    requirements: string
    requestId: string
    messages: ProductSwapMessage[]
}

export type ProductSwapMessage = {
    role: 'user' | 'assistant'
    content: string
}

export type ProductSwapResult = {
    imageUrl: string
    assistantMessage?: string
    metadata?: Record<string, unknown>
}

export type ProductSwapEnv = {
    DOUBAO_API_KEY?: string
    DOUBAO_IMAGE_ENDPOINT_ID?: string
    DOUBAO_PRODUCT_SWAP_ENDPOINT_ID?: string
    DOUBAO_CHAT_ENDPOINT?: string
    DOUBAO_ARK_BASE_URL?: string
}

export type ProductSwapProvider = {
    name: string
    generate(
        input: ProductSwapInput,
        env?: ProductSwapEnv,
    ): Promise<ProductSwapResult>
}

export class ProductSwapProviderError extends Error {
    constructor(
        public readonly code:
            | 'VOLCANO_PROVIDER_NOT_CONFIGURED'
            | 'PROVIDER_REQUEST_FAILED'
            | 'PROVIDER_TIMEOUT',
        message: string,
    ) {
        super(message)
        this.name = 'ProductSwapProviderError'
    }
}
