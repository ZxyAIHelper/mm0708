(function (global) {
    const templates = [
        {
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
                { key: 'target', required: true, type: 'image' },
                { key: 'product', required: false, type: 'image' },
                { key: 'scene', required: false, type: 'image' },
                { key: 'requirements', required: false, type: 'text' },
            ],
        },
        {
            id: 'summer-seeding',
            name: '夏日产品种草',
            summary: '生成清爽的夏日产品种草封面。',
            category: '种草推荐',
            platforms: ['小红书'],
            tags: ['夏日', '种草', '产品'],
            status: 'coming_soon',
            href: '',
            cover: '/assets/example-product.jpg',
            outputLabel: '生成 3 张种草图',
            creditCost: 0,
            fields: [],
        },
        {
            id: 'store-promotion',
            name: '周末到店活动',
            summary: '把门店信息整理成周末活动宣传图。',
            category: '优惠活动',
            platforms: ['小红书', '抖音图文'],
            tags: ['门店', '活动', '周末'],
            status: 'coming_soon',
            href: '',
            cover: '/assets/example-template.jpg',
            outputLabel: '生成活动发布包',
            creditCost: 0,
            fields: [],
        },
        {
            id: 'before-after',
            name: '产品前后对比',
            summary: '用清晰的前后变化展示产品效果。',
            category: '前后对比',
            platforms: ['小红书', '抖音图文'],
            tags: ['对比', '效果', '案例'],
            status: 'coming_soon',
            href: '',
            cover: '/assets/example-result.jpg',
            outputLabel: '生成 1 张对比图',
            creditCost: 0,
            fields: [],
        },
    ];

    function normalize(value) {
        return String(value || '').trim().toLocaleLowerCase('zh-CN');
    }

    function getTemplate(id) {
        return templates.find((template) => template.id === id) || null;
    }

    function listTemplates({ category = '' } = {}) {
        if (!category) return templates.slice();
        return templates.filter((template) => template.category === category);
    }

    function searchTemplates(query) {
        const normalizedQuery = normalize(query);
        if (!normalizedQuery) return listTemplates();

        return templates.filter((template) => [
            template.name,
            template.summary,
            template.category,
            ...template.platforms,
            ...template.tags,
        ].some((value) => normalize(value).includes(normalizedQuery)));
    }

    const catalog = { getTemplate, listTemplates, searchTemplates };
    global.ContentTemplates = catalog;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = catalog;
    }
}(globalThis));
