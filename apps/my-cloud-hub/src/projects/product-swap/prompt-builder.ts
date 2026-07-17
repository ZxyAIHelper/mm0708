import type {
    ProductSwapInput,
    ProductSwapMessage,
} from './provider'

const SYSTEM_PROMPT = `你是商业食品摄影图像编辑提示词专家。
把用户的换品或修正要求整理成一段可直接交给图像编辑模型的中文提示词。
必须保持目标模板的构图、机位、透视、数量、排列、背景和光线，只替换菜品或商品主体。
产品的形状、颜色、包装、餐具及可识别特征必须准确，不增加文字、Logo、水印或额外商品。
只输出最终提示词，不解释。`

function cleanMessages(
    messages: ProductSwapMessage[] = [],
): ProductSwapMessage[] {
    return messages
        .filter((message) =>
            (message.role === 'user'
                || message.role === 'assistant')
            && typeof message.content === 'string'
            && message.content.trim(),
        )
        .slice(-6)
        .map((message) => ({
            role: message.role,
            content: message.content.trim().slice(0, 500),
        }))
}

export function buildProductSwapPrompt(
    input: ProductSwapInput,
): string {
    const imageNotes = input.previousImage
        ? [
            '图 1 是上一版结果，以它作为本次编辑底图。',
            '图 2 是最初目标模板，仅用于校准构图、数量、排列和环境。',
            input.productImage
                ? '图 3 是待换入产品，产品主体和识别特征不得改变。'
                : '',
            input.sceneImage
                ? `图 ${input.productImage ? 4 : 3} 是场景参考，只吸收环境氛围。`
                : '',
        ]
        : [
            '图 1 是目标模板，保持其宽高比、机位、构图、数量、排列、背景和光线。',
            input.productImage
                ? '图 2 是待换入产品，保留形状、颜色、包装、餐具和关键识别特征。'
                : '没有产品图，根据用户要求生成需要换入的商品。',
            input.sceneImage
                ? `图 ${input.productImage ? 3 : 2} 是场景参考，只吸收环境氛围。`
                : '',
        ]

    return [
        ...imageNotes,
        '只替换菜品或商品主体，不改变模板中的其他结构。',
        '保持真实商业摄影质感、自然接触阴影和一致的透视尺度。',
        '不要添加文字、Logo、水印、边框或额外商品。',
        input.requirements
            ? `用户本轮要求：${input.requirements}`
            : '用户本轮要求：自然、准确地完成换品。',
    ].filter(Boolean).join('\n')
}

export function buildPromptComposerMessages(
    input: ProductSwapInput,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const refinementContext = input.previousImage
        ? '这是对上一版结果的继续修正。必须优先执行本轮要求，同时保持产品主体一致。\n'
        : ''

    return [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        ...cleanMessages(input.messages),
        {
            role: 'user' as const,
            content: refinementContext + buildProductSwapPrompt(input),
        },
    ]
}
