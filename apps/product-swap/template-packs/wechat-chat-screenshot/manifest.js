'use strict';

module.exports = {
    id: 'wechat-chat-screenshot',
    taskType: 'wechat_chat_screenshot',
    name: '微信聊天截图',
    summary: '用店名、图片或真实地点，生成自然的微信单聊截图。',
    category: '聊天截图',
    platforms: ['小红书', '抖音图文'],
    tags: ['聊天', '微信风格', '探店', '种草'],
    status: 'live',
    href: '/create.html?template=wechat-chat-screenshot',
    cover: '/assets/wechat-chat-screenshot-cover.webp',
    outputLabel: '生成聊天对话',
    creditCost: 0,
    fields: [{
        key: 'chatSource',
        type: 'chat-materials',
        label: '聊天素材',
        required: true,
        minSources: 1,
        maxImages: 3,
        accept: ['image/jpeg', 'image/png', 'image/webp'],
    }],
    quickPrompts: [],
};
