'use strict';

(function (global) {
    const TIER_ORDER = Object.freeze([
        'top',
        'great',
        'good',
        'average',
        'poor',
    ]);
    const NON_TOP_TIERS = TIER_ORDER.slice(1);
    const COMMENT_POOLS = Object.freeze({
        top: Object.freeze(['闭眼冲', '真能打', '很惊喜']),
        great: Object.freeze(['值得点', '挺出彩', '有水准']),
        good: Object.freeze(['挺稳的', '还不错', '可以点']),
        average: Object.freeze(['还可以', '中规中矩', '看喜好']),
        poor: Object.freeze(['一般般', '可略过', '没必要']),
    });

    function dishRef(index) {
        return `dish-${index}`;
    }

    function fallbackComment(tier, refId) {
        const pool = COMMENT_POOLS[tier] || COMMENT_POOLS.average;
        let hash = 0;
        for (const char of String(refId)) {
            hash = (hash * 31 + char.codePointAt(0)) >>> 0;
        }
        return pool[hash % pool.length];
    }

    function validComment(value) {
        return typeof value === 'string'
            && /^[\p{Script=Han}]{2,6}$/u.test(value.trim());
    }

    function validAiItem(value, knownRefs) {
        return value
            && typeof value === 'object'
            && !Array.isArray(value)
            && typeof value.refId === 'string'
            && knownRefs.has(value.refId)
            && TIER_ORDER.includes(value.tier)
            && Number.isInteger(value.order)
            && value.order >= 0
            && validComment(value.comment);
    }

    function normalizeRanking(dishes, draft) {
        const source = Array.isArray(dishes) ? dishes : [];
        const normalizedDishes = source.map((dish, index) => ({
            refId: dishRef(index),
            dish,
            inputIndex: index,
        }));
        const knownRefs = new Set(
            normalizedDishes.map((entry) => entry.refId),
        );
        const accepted = new Map();
        if (draft?.version === 1 && Array.isArray(draft.items)) {
            for (const item of draft.items) {
                if (
                    accepted.has(item?.refId)
                    || !validAiItem(item, knownRefs)
                ) {
                    continue;
                }
                accepted.set(item.refId, {
                    tier: item.tier,
                    order: item.order,
                    comment: item.comment.trim(),
                });
            }
        }

        const counts = Object.fromEntries(
            NON_TOP_TIERS.map((tier) => [tier, 0]),
        );
        for (const entry of normalizedDishes) {
            if (entry.dish?.owned) continue;
            const item = accepted.get(entry.refId);
            if (item && NON_TOP_TIERS.includes(item.tier)) {
                counts[item.tier] += 1;
            }
        }

        const items = normalizedDishes.map((entry) => {
            const ai = accepted.get(entry.refId);
            let tier;
            if (entry.dish?.owned) {
                tier = 'top';
            } else if (ai) {
                tier = ai.tier;
            } else {
                tier = NON_TOP_TIERS.reduce((best, candidate) => (
                    counts[candidate] < counts[best] ? candidate : best
                ), NON_TOP_TIERS[0]);
                counts[tier] += 1;
            }
            return {
                refId: entry.refId,
                tier,
                order: entry.dish?.owned
                    ? entry.inputIndex
                    : (ai?.order ?? entry.inputIndex),
                comment: ai?.tier === tier && validComment(ai.comment)
                    ? ai.comment.trim()
                    : fallbackComment(tier, entry.refId),
                owned: Boolean(entry.dish?.owned),
                inputIndex: entry.inputIndex,
            };
        });

        items.sort((left, right) => (
            TIER_ORDER.indexOf(left.tier)
            - TIER_ORDER.indexOf(right.tier)
            || Number(right.owned) - Number(left.owned)
            || left.order - right.order
            || left.inputIndex - right.inputIndex
        ));
        return { version: 1, items };
    }

    function fallbackRanking(dishes) {
        return normalizeRanking(dishes, null);
    }

    async function requestDishRankingDraft(
        dishes,
        {
            apiJson = global.ProductSwapApi?.apiJson,
        } = {},
    ) {
        if (typeof apiJson !== 'function') {
            throw new Error('菜品评价接口不可用');
        }
        const payloadDishes = (Array.isArray(dishes) ? dishes : [])
            .map((dish, index) => ({
                id: dishRef(index),
                image: dish.image,
                owned: Boolean(dish.owned),
                source: dish.source,
            }));
        const data = await apiJson(
            '/api/product-swap/dish-ranking-draft',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: 'dish-ranking-guide',
                    dishes: payloadDishes,
                }),
            },
        );
        if (
            !data?.success
            || data.draft?.version !== 1
            || !Array.isArray(data.draft.items)
        ) {
            throw new Error('AI 返回的菜品评价结构无效');
        }
        return data.draft;
    }

    const api = {
        COMMENT_POOLS,
        TIER_ORDER,
        fallbackRanking,
        normalizeRanking,
        requestDishRankingDraft,
    };
    global.DishRankingClient = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
