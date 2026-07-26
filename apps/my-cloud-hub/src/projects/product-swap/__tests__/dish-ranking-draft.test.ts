import {
    buildDishRankingMessages,
    DishRankingDraftValidationError,
    parseDishRankingDraft,
    parseDishRankingDraftContent,
    validateDishRankingDraftRequest,
} from '../dish-ranking-draft'

const image = 'data:image/png;base64,AA=='
const validRequest = {
    templateId: 'dish-ranking-guide',
    dishes: [
        {
            id: 'dish-0',
            image,
            owned: true,
            source: 'user',
        },
        {
            id: 'dish-1',
            image,
            owned: false,
            source: 'library',
        },
    ],
}
const validDraft = {
    version: 1,
    items: [
        {
            refId: 'dish-0',
            tier: 'top',
            order: 0,
            comment: '闭眼冲',
        },
        {
            refId: 'dish-1',
            tier: 'good',
            order: 0,
            comment: '挺稳的',
        },
    ],
}

describe('dish ranking draft contract', () => {
    it('validates a strict request with owned and library dishes', () => {
        expect(validateDishRankingDraftRequest(validRequest))
            .toEqual(validRequest)
    })

    it.each([
        ['unknown request key', { ...validRequest, extra: true }],
        ['missing owned dish', {
            ...validRequest,
            dishes: validRequest.dishes.map((dish) => ({
                ...dish,
                owned: false,
            })),
        }],
        ['owned library dish', {
            ...validRequest,
            dishes: validRequest.dishes.map((dish, index) => (
                index === 1 ? { ...dish, owned: true } : dish
            )),
        }],
        ['duplicate dish id', {
            ...validRequest,
            dishes: validRequest.dishes.map((dish) => ({
                ...dish,
                id: 'dish-0',
            })),
        }],
        ['unknown dish key', {
            ...validRequest,
            dishes: [{ ...validRequest.dishes[0], name: 'dish' }],
        }],
        ['too many dishes', {
            ...validRequest,
            dishes: Array.from({ length: 13 }, (_, index) => ({
                id: `dish-${index}`,
                image,
                owned: index === 0,
                source: 'user',
            })),
        }],
    ])('rejects %s', (_label, value) => {
        expect(() => validateDishRankingDraftRequest(value))
            .toThrow(DishRankingDraftValidationError)
    })

    it('parses a complete strict ranking', () => {
        expect(parseDishRankingDraft(validDraft, ['dish-0', 'dish-1']))
            .toEqual(validDraft)
    })

    it.each([
        ['unknown top-level key', { ...validDraft, explanation: 'no' }],
        ['unknown item key', {
            ...validDraft,
            items: validDraft.items.map((item, index) => (
                index === 0 ? { ...item, score: 9 } : item
            )),
        }],
        ['unknown ref', {
            ...validDraft,
            items: validDraft.items.map((item, index) => (
                index === 0 ? { ...item, refId: 'dish-9' } : item
            )),
        }],
        ['duplicate ref', {
            ...validDraft,
            items: validDraft.items.map((item) => ({
                ...item,
                refId: 'dish-0',
            })),
        }],
        ['missing ref', {
            ...validDraft,
            items: validDraft.items.slice(0, 1),
        }],
        ['unknown tier', {
            ...validDraft,
            items: validDraft.items.map((item, index) => (
                index === 0 ? { ...item, tier: 'best' } : item
            )),
        }],
        ['duplicate tier order', {
            ...validDraft,
            items: validDraft.items.map((item) => ({
                ...item,
                tier: 'top',
                order: 0,
            })),
        }],
        ['non-integer order', {
            ...validDraft,
            items: validDraft.items.map((item, index) => (
                index === 0 ? { ...item, order: 0.5 } : item
            )),
        }],
        ['non-Chinese comment', {
            ...validDraft,
            items: validDraft.items.map((item, index) => (
                index === 0 ? { ...item, comment: 'great' } : item
            )),
        }],
        ['long comment', {
            ...validDraft,
            items: validDraft.items.map((item, index) => (
                index === 0 ? { ...item, comment: '真的非常值得推荐' } : item
            )),
        }],
    ])('rejects %s', (_label, value) => {
        expect(() => parseDishRankingDraft(
            value,
            ['dish-0', 'dish-1'],
        )).toThrow(DishRankingDraftValidationError)
    })

    it('accepts raw and fenced JSON model content', () => {
        const content = JSON.stringify(validDraft)
        expect(parseDishRankingDraftContent(
            content,
            ['dish-0', 'dish-1'],
        )).toEqual(validDraft)
        expect(parseDishRankingDraftContent(
            `\`\`\`json\n${content}\n\`\`\``,
            ['dish-0', 'dish-1'],
        )).toEqual(validDraft)
    })

    it('builds a multimodal prompt limited to sorting and comments', () => {
        const messages = buildDishRankingMessages(
            validateDishRankingDraftRequest(validRequest),
        )
        expect(messages).toHaveLength(2)
        expect(messages[0].content).toContain('排序')
        expect(messages[0].content).toContain('短评')
        expect(messages[0].content).toContain('不要设计页面')
        const content = messages[1].content
        expect(Array.isArray(content)).toBe(true)
        if (!Array.isArray(content)) throw new Error('expected content array')
        expect(content.filter((part) => part.type === 'image_url'))
            .toHaveLength(2)
        expect(JSON.stringify(content)).toContain('dish-0')
        expect(JSON.stringify(content)).toContain('dish-1')
    })
})
