'use strict';

(function (global) {
    function invalid(message) {
        throw new Error(message);
    }

    function normalizeMessage(message) {
        if (
            !message
            || typeof message !== 'object'
            || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(message.id || '')
            || !['left', 'right'].includes(message.side)
        ) {
            invalid('AI 返回的消息无效');
        }
        if (message.type === 'text') {
            const text = String(message.text || '').trim();
            if (!text || text.length > 120) {
                invalid('AI 返回的消息文字无效');
            }
            return {
                id: message.id,
                side: message.side,
                type: 'text',
                text,
            };
        }
        if (!['image_ref', 'location_ref'].includes(message.type)) {
            invalid('AI 返回的消息类型无效');
        }
        const refId = String(message.refId || '').trim();
        if (!refId) invalid('AI 返回的素材引用无效');
        return {
            id: message.id,
            side: message.side,
            type: message.type,
            refId,
        };
    }

    function normalizeChatDraftResponse(value, materials) {
        const draft = value?.draft;
        if (
            !value?.success
            || !draft
            || draft.version !== 1
            || typeof draft.contactName !== 'string'
            || !draft.contactName.trim()
            || draft.contactName.trim().length > 12
            || !Array.isArray(draft.messages)
            || draft.messages.length < 10
            || draft.messages.length > 16
        ) {
            invalid('AI 返回的对话结构无效');
        }
        const messages = draft.messages.map(normalizeMessage);
        const totalText = messages.reduce(
            (total, message) => (
                total + (message.type === 'text' ? message.text.length : 0)
            ),
            0,
        );
        if (
            new Set(messages.map((message) => message.id)).size
                !== messages.length
            || !messages.some((message) => message.side === 'left')
            || !messages.some((message) => message.side === 'right')
            || totalText > 1000
        ) {
            invalid('AI 返回的对话双方、消息 ID 或文字总量无效');
        }
        const expectedRefs = [
            ...(materials?.images || []).map((image) => image.id),
            ...(materials?.location ? [materials.location.id] : []),
        ];
        const actualRefs = messages
            .filter((message) => message.type !== 'text')
            .map((message) => message.refId);
        if (
            expectedRefs.some((refId) => (
                actualRefs.filter((value) => value === refId).length !== 1
            ))
            || actualRefs.some((refId) => !expectedRefs.includes(refId))
        ) {
            invalid('AI 返回的素材引用不完整');
        }
        return {
            version: 1,
            contactName: draft.contactName.trim(),
            messages,
        };
    }

    async function requestChatDraft(
        materials,
        {
            apiJson = global.ProductSwapApi?.apiJson,
        } = {},
    ) {
        if (typeof apiJson !== 'function') {
            throw new Error('聊天生成接口不可用');
        }
        const normalized = global.ChatMaterials
            ? global.ChatMaterials.normalizeChatMaterials(materials)
            : materials;
        const requestMaterials = {
            ...normalized,
            location: normalized.location ? {
                id: normalized.location.id,
                name: normalized.location.name,
                address: normalized.location.address,
                city: normalized.location.city,
                lat: normalized.location.lat,
                lng: normalized.location.lng,
            } : null,
        };
        const data = await apiJson('/api/product-swap/chat-draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                templateId: 'wechat-chat-screenshot',
                ...requestMaterials,
            }),
        });
        return normalizeChatDraftResponse(data, normalized);
    }

    const api = {
        normalizeChatDraftResponse,
        requestChatDraft,
    };
    global.ChatDraftClient = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
