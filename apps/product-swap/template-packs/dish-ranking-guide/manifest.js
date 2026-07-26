'use strict';

module.exports = {
    id: 'dish-ranking-guide',
    taskType: 'dish_ranking_guide',
    name: '菜品测评攻略图',
    summary: '上传多道菜并标记自家菜品，生成从拉到夯等测评攻略排版。',
    category: '种草推荐',
    platforms: ['小红书', '抖音图文'],
    tags: ['美食', '测评', '攻略', '排行'],
    status: 'live',
    href: '/create.html?template=dish-ranking-guide',
    cover: '/assets/dish-ranking-guide-cover.webp',
    outputLabel: '生成测评攻略图',
    creditCost: 0,
    fields: [
        {
            key: 'dishes',
            type: 'dish-list',
            role: 'dish',
            label: '菜品图片',
            required: true,
            minItems: 1,
            maxItems: 12,
            minOwned: 1,
            accept: ['image/jpeg', 'image/png', 'image/webp'],
        },
        {
            key: 'layout',
            type: 'choice',
            label: '排布方式',
            required: true,
            default: 'tier',
            options: [
                { value: 'tier', label: '从拉到夯' },
            ],
        },
        {
            key: 'aspectRatio',
            type: 'choice',
            label: '画布比例',
            required: true,
            default: '3:4',
            options: [
                { value: '3:4', label: '3:4' },
                { value: '1:1', label: '1:1' },
                { value: '9:16', label: '9:16' },
            ],
        },
    ],
    quickPrompts: [],
};
