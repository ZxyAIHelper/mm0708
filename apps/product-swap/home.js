(function (globalScope) {
    function templateCardModel(template) {
        return {
            ...template,
            href: template.status === 'live' ? template.href : '',
            statusLabel: template.status === 'live' ? '立即套用' : '即将上线',
            platformLabel: (template.platforms || []).join(' · '),
        };
    }

    function categoryNames(templates) {
        return [
            '全部',
            ...new Set(templates.map((template) => template.category)),
        ];
    }

    function readShopSummary(createStore) {
        try {
            const profile = createStore().loadProfile();
            return profile.shop.name || '完善店铺';
        } catch {
            return '完善店铺';
        }
    }

    function syncCategoryButton(button, isActive) {
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    }

    function createTemplateCard(template) {
        const model = templateCardModel(template);
        const card = document.createElement(model.href ? 'a' : 'article');
        card.className = 'template-card';

        if (model.href) {
            card.href = model.href;
        } else {
            card.classList.add('is-unavailable');
            card.setAttribute('aria-disabled', 'true');
        }

        const image = document.createElement('img');
        image.src = model.cover;
        image.alt = `${model.name}模板效果`;
        image.loading = 'lazy';

        const body = document.createElement('div');
        body.className = 'template-card-body';

        const category = document.createElement('span');
        category.className = 'template-category';
        category.textContent = model.category;

        const title = document.createElement('h3');
        title.textContent = model.name;

        const platform = document.createElement('p');
        platform.textContent = model.platformLabel || '图片内容';

        const status = document.createElement('strong');
        status.textContent = model.statusLabel;

        body.append(category, title, platform, status);
        card.append(image, body);
        return card;
    }

    function boot() {
        const catalog = globalScope.ContentTemplates;
        const merchant = globalScope.MerchantStore;
        if (!catalog) return;

        const shopSummary = document.querySelector('#shopSummary');
        const searchForm = document.querySelector('#templateSearch');
        const searchInput = document.querySelector('#templateSearchInput');
        const hotTemplates = document.querySelector('#hotTemplates');
        const categoryList = document.querySelector('#templateCategories');
        const templateGrid = document.querySelector('#templateGrid');
        const emptyState = document.querySelector('#homeEmpty');
        const templates = catalog.listTemplates();
        let activeCategory = '全部';

        shopSummary.textContent = readShopSummary(
            () => merchant.createMerchantStore(),
        );

        function render() {
            const matches = catalog.searchTemplates(searchInput.value);
            const filtered = activeCategory === '全部'
                ? matches
                : matches.filter((template) => template.category === activeCategory);
            templateGrid.replaceChildren(...filtered.map(createTemplateCard));
            emptyState.hidden = filtered.length > 0;
        }

        function setCategory(category) {
            activeCategory = category;
            for (const button of categoryList.querySelectorAll('button')) {
                syncCategoryButton(
                    button,
                    button.dataset.category === category,
                );
            }
            render();
        }

        const categoryButtons = categoryNames(templates).map((category) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'category-pill';
            button.dataset.category = category;
            button.textContent = category;
            syncCategoryButton(button, category === activeCategory);
            button.addEventListener('click', () => setCategory(category));
            return button;
        });
        categoryList.replaceChildren(...categoryButtons);

        const hotCards = templates.slice(0, 3).map(createTemplateCard);
        for (const card of hotCards) card.classList.add('hot-template-card');
        hotTemplates.replaceChildren(...hotCards);

        searchForm.addEventListener('submit', (event) => {
            event.preventDefault();
            setCategory('全部');
            templateGrid.closest('.templates-section').scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });

        render();
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', boot);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            templateCardModel,
            categoryNames,
            readShopSummary,
            syncCategoryButton,
        };
    }
}(globalThis));
