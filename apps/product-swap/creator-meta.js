(function (global) {
    const catalog = typeof module !== 'undefined' && module.exports
        ? require('./templates')
        : global.ContentTemplates;

    function resolveCreatorTemplate(search = '') {
        const templateId = new URLSearchParams(search)
            .get('template') || 'product-swap';
        const template = catalog?.getTemplate(templateId) || null;

        return template?.status === 'live' ? template : null;
    }

    function applyCreatorTemplate(
        search = global.location?.search || '',
    ) {
        const template = resolveCreatorTemplate(search);
        if (!template || !global.document) return template;

        global.document.title = template.name;
        global.document.getElementById('creatorTitle').textContent =
            template.name;
        global.document.getElementById('creatorSummary').textContent =
            template.summary;
        global.document.getElementById('generateButton').textContent =
            `${template.outputLabel}（消耗 ${template.creditCost} 豆额度）`;
        global.document.body.dataset.templateId = template.id;

        return template;
    }

    const creatorMeta = {
        resolveCreatorTemplate,
        applyCreatorTemplate,
    };
    global.CreatorMeta = creatorMeta;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = creatorMeta;
    }

    if (global.document) {
        global.document.addEventListener('DOMContentLoaded', () => {
            if (!applyCreatorTemplate()) {
                global.location.replace('/');
            }
        });
    }
}(globalThis));
