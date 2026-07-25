'use strict';

module.exports = {
    id: 'product-swap',
    taskType: 'product_swap',
    name: '爆款场景同款图',
    summary: '保留参考图的构图，把画面主体替换成你的产品。',
    category: '改造图片',
    platforms: ['小红书', '抖音图文'],
    tags: ['换背景', '产品图', '同款'],
    status: 'live',
    href: '/create.html?template=product-swap',
    cover: '/assets/example-result.jpg',
    outputLabel: '生成 1 张场景图',
    creditCost: 3,
    fields: [
        {
            key: 'targetImage',
            type: 'image',
            role: 'target',
            label: '目标图（样图模板）',
            required: true,
        },
        {
            key: 'productImage',
            type: 'image',
            role: 'product',
            label: '产品图',
            required: false,
        },
        {
            key: 'sceneImage',
            type: 'image',
            role: 'scene',
            label: '场景图',
            required: false,
        },
        {
            key: 'requirements',
            type: 'text',
            label: '额外要求',
            required: false,
            maxLength: 200,
        },
    ],
    quickPrompts: [],
};
