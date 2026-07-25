'use strict';

module.exports = {
    id: 'food-copy-layout',
    taskType: 'food_copy_layout',
    name: '文案配图（整桌菜或单品）',
    summary: '上传一张菜品图，AI 自动写文案并完成社交平台风格排版。',
    category: '种草推荐',
    platforms: ['小红书', '抖音图文'],
    tags: ['美食', '文案', '排版', '探店'],
    status: 'live',
    href: '/create.html?template=food-copy-layout',
    cover: '/assets/example-result.jpg',
    outputLabel: '生成 1 张文案配图',
    creditCost: 3,
    fields: [
        {
            key: 'targetImage',
            type: 'image',
            role: 'target',
            label: '菜品图片',
            required: true,
            accept: ['image/jpeg', 'image/png', 'image/webp'],
        },
        {
            key: 'aspectRatio',
            type: 'choice',
            label: '画布比例',
            required: true,
            default: '3:4',
            options: [
                { value: '3:4', label: '3:4' },
                { value: 'original', label: '原图' },
                { value: '9:16', label: '9:16' },
            ],
        },
        {
            key: 'showDateTime',
            type: 'boolean',
            label: '显示日期时间',
            default: true,
        },
        {
            key: 'requirements',
            type: 'text',
            label: '补充想法',
            required: false,
            maxLength: 200,
            placeholder: '例如：突出分量足，像朋友随手记录',
        },
    ],
    quickPrompts: [
        '文案短一点',
        '换到右上角',
        '字号大一点',
        '改成白底黑字',
        '更像随手分享',
    ],
};
