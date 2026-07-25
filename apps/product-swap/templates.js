(function (global) {
    const templates = Array.isArray(global.__TEMPLATE_CATALOG__)
        ? global.__TEMPLATE_CATALOG__
        : (
            typeof module !== 'undefined'
                ? require('./server/template-registry').publicCatalog()
                : []
        );

    function normalize(value) {
        return String(value || '').trim().toLocaleLowerCase('zh-CN');
    }

    function getTemplate(id) {
        return templates.find((template) => template.id === id) || null;
    }

    function listTemplates({ category = '' } = {}) {
        return category
            ? templates.filter((template) => template.category === category)
            : templates.slice();
    }

    function searchTemplates(query) {
        const normalized = normalize(query);
        if (!normalized) return listTemplates();

        return templates.filter((template) => [
            template.name,
            template.summary,
            template.category,
            ...template.platforms,
            ...template.tags,
        ].some((value) => normalize(value).includes(normalized)));
    }

    const catalog = { getTemplate, listTemplates, searchTemplates };
    global.ContentTemplates = catalog;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = catalog;
    }
}(globalThis));
