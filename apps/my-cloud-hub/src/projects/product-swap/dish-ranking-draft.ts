export const DISH_TIERS = [
    'top',
    'great',
    'good',
    'average',
    'poor',
] as const

export type DishTier = typeof DISH_TIERS[number]

export type DishRankingDraftDish = {
    id: string
    image: string
    owned: boolean
    source: 'user' | 'library'
}

export type DishRankingDraftRequest = {
    templateId: 'dish-ranking-guide'
    dishes: DishRankingDraftDish[]
}

export type DishRankingItem = {
    refId: string
    tier: DishTier
    order: number
    comment: string
}

export type DishRankingDraft = {
    version: 1
    items: DishRankingItem[]
}

export type DishRankingMessagePart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }

export type DishRankingMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: DishRankingMessagePart[] }

export class DishRankingDraftValidationError extends Error {
    readonly code = 'INVALID_DISH_RANKING_DRAFT'

    constructor(message: string) {
        super(message)
        this.name = 'DishRankingDraftValidationError'
    }
}

function invalid(message: string): never {
    throw new DishRankingDraftValidationError(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value)
        && typeof value === 'object'
        && !Array.isArray(value)
}

function hasOnlyKeys(
    value: Record<string, unknown>,
    keys: string[],
) {
    return Object.keys(value).length === keys.length
        && Object.keys(value).every((key) => keys.includes(key))
        && keys.every((key) => Object.hasOwn(value, key))
}

function validateDish(value: unknown): DishRankingDraftDish {
    if (
        !isRecord(value)
        || !hasOnlyKeys(value, ['id', 'image', 'owned', 'source'])
        || typeof value.id !== 'string'
        || !/^dish-(0|[1-9]\d*)$/.test(value.id)
        || typeof value.image !== 'string'
        || value.image.length > 14_000_000
        || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/
            .test(value.image)
        || typeof value.owned !== 'boolean'
        || !['user', 'library'].includes(String(value.source))
        || (value.source === 'library' && value.owned)
    ) {
        invalid('菜品素材无效')
    }
    return {
        id: value.id,
        image: value.image,
        owned: value.owned,
        source: value.source as 'user' | 'library',
    }
}

export function validateDishRankingDraftRequest(
    value: unknown,
): DishRankingDraftRequest {
    if (
        !isRecord(value)
        || !hasOnlyKeys(value, ['templateId', 'dishes'])
        || value.templateId !== 'dish-ranking-guide'
        || !Array.isArray(value.dishes)
        || value.dishes.length < 1
        || value.dishes.length > 12
    ) {
        invalid('菜品排序请求无效')
    }
    const dishes = value.dishes.map(validateDish)
    if (new Set(dishes.map((dish) => dish.id)).size !== dishes.length) {
        invalid('菜品 ID 不能重复')
    }
    if (!dishes.some((dish) => dish.owned)) {
        invalid('至少需要一道自家菜')
    }
    return {
        templateId: 'dish-ranking-guide',
        dishes,
    }
}

function parseItem(
    value: unknown,
    refIds: string[],
): DishRankingItem {
    if (
        !isRecord(value)
        || !hasOnlyKeys(value, [
            'refId',
            'tier',
            'order',
            'comment',
        ])
        || typeof value.refId !== 'string'
        || !refIds.includes(value.refId)
        || !DISH_TIERS.includes(value.tier as DishTier)
        || !Number.isInteger(value.order)
        || Number(value.order) < 0
        || Number(value.order) >= refIds.length
        || typeof value.comment !== 'string'
        || !/^\p{Script=Han}{2,6}$/u.test(value.comment.trim())
    ) {
        invalid('菜品排序项无效')
    }
    return {
        refId: value.refId,
        tier: value.tier as DishTier,
        order: Number(value.order),
        comment: value.comment.trim(),
    }
}

export function parseDishRankingDraft(
    value: unknown,
    refIds: string[],
): DishRankingDraft {
    if (
        !isRecord(value)
        || !hasOnlyKeys(value, ['version', 'items'])
        || value.version !== 1
        || !Array.isArray(value.items)
        || value.items.length !== refIds.length
    ) {
        invalid('菜品排序结构无效')
    }
    const items = value.items.map((item) => parseItem(item, refIds))
    if (
        new Set(items.map((item) => item.refId)).size !== refIds.length
        || refIds.some((refId) => !items.some((item) => item.refId === refId))
    ) {
        invalid('每道菜必须且只能评价一次')
    }
    const tierOrders = items.map((item) => `${item.tier}:${item.order}`)
    if (new Set(tierOrders).size !== tierOrders.length) {
        invalid('同档菜品顺序不能重复')
    }
    return { version: 1, items }
}

export function parseDishRankingDraftContent(
    content: string,
    refIds: string[],
) {
    const trimmed = content.trim()
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
    let value: unknown
    try {
        value = JSON.parse(fenced ? fenced[1] : trimmed)
    } catch {
        invalid('模型没有返回有效 JSON')
    }
    return parseDishRankingDraft(value, refIds)
}

export function buildDishRankingMessages(
    input: DishRankingDraftRequest,
): DishRankingMessage[] {
    const userContent: DishRankingMessagePart[] = [{
        type: 'text',
        text: [
            '请评价以下菜品图片。每个文字标签后的图片对应该引用 ID。',
            '图片只用于主观排序和短评，不得猜测具体菜名或食材。',
        ].join('\n'),
    }]
    for (const dish of input.dishes) {
        userContent.push({
            type: 'text',
            text: `${dish.id}（${dish.owned ? '自家菜' : '其他菜品'}）`,
        }, {
            type: 'image_url',
            image_url: { url: dish.image },
        })
    }
    return [{
        role: 'system',
        content: [
            '你是中文美食测评编辑。',
            '你的任务只有两个：为每道菜分档排序，以及写一条中文短评。',
            '只输出 JSON，不要 Markdown、解释或额外字段。',
            '严格格式：{"version":1,"items":[{"refId":"dish-0","tier":"top","order":0,"comment":"闭眼冲"}]}。',
            '每个输入引用必须且只能出现一次。',
            'tier 只能是 top、great、good、average、poor。',
            'order 是同档内从 0 开始的唯一非负整数。',
            'comment 只能包含 2 至 6 个中文汉字。',
            '不要设计页面、图片裁切、标签或视觉样式。',
            '不要编造店名、价格、地址、销量、优惠、菜名、配方或食材。',
        ].join('\n'),
    }, {
        role: 'user',
        content: userContent,
    }]
}
