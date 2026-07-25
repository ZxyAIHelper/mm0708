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

    function appendLabel(section, field, controlId) {
        const label = global.document.createElement('label');
        label.htmlFor = controlId;
        label.textContent = field.label;
        if (field.required) {
            const required = global.document.createElement('span');
            required.setAttribute('aria-hidden', 'true');
            required.textContent = ' *';
            label.appendChild(required);
        }
        section.appendChild(label);
    }

    function renderImageField(section, field, controlId) {
        section.classList.add('upload-field');
        appendLabel(section, field, controlId);

        const input = global.document.createElement('input');
        input.id = controlId;
        input.type = 'file';
        input.accept = (field.accept || [
            'image/jpeg',
            'image/png',
            'image/webp',
        ]).join(',');
        input.hidden = true;
        section.appendChild(input);

        const upload = global.document.createElement('button');
        upload.className = 'upload-box';
        upload.type = 'button';
        upload.dataset.upload = field.key;
        const hint = global.document.createElement('span');
        hint.textContent = '点击上传';
        upload.appendChild(hint);
        section.appendChild(upload);

        const remove = global.document.createElement('button');
        remove.className = 'remove-image';
        remove.type = 'button';
        remove.dataset.remove = field.key;
        remove.textContent = '删除';
        remove.hidden = true;
        section.appendChild(remove);
    }

    function renderChoiceField(section, field, controlId) {
        appendLabel(section, field, controlId);
        const group = global.document.createElement('div');
        group.id = controlId;
        group.setAttribute('role', 'radiogroup');
        for (const option of field.options || []) {
            const button = global.document.createElement('button');
            const selected = option.value === field.default;
            button.type = 'button';
            button.dataset.value = option.value;
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', String(selected));
            button.setAttribute('aria-pressed', String(selected));
            button.textContent = option.label;
            group.appendChild(button);
        }
        section.appendChild(group);
    }

    function renderBooleanField(section, field, controlId) {
        appendLabel(section, field, controlId);
        const button = global.document.createElement('button');
        button.id = controlId;
        button.type = 'button';
        button.setAttribute('role', 'switch');
        button.setAttribute('aria-checked', String(Boolean(field.default)));
        button.textContent = field.default ? '已开启' : '已关闭';
        section.appendChild(button);
    }

    function renderTextField(section, field, controlId) {
        appendLabel(section, field, controlId);
        const textarea = global.document.createElement('textarea');
        textarea.id = controlId;
        if (field.maxLength) textarea.maxLength = field.maxLength;
        if (field.placeholder) textarea.placeholder = field.placeholder;
        section.appendChild(textarea);
    }

    function renderTemplateFields(container, manifest) {
        if (!container || !global.document) return container;
        container.replaceChildren();
        for (const field of manifest?.fields || []) {
            const section = global.document.createElement('section');
            section.className =
                `template-field template-field-${field.type}`;
            section.dataset.fieldKey = field.key;
            const controlId = `template-field-${field.key}`;
            if (field.type === 'image') {
                renderImageField(section, field, controlId);
            } else if (field.type === 'choice') {
                renderChoiceField(section, field, controlId);
            } else if (field.type === 'boolean') {
                renderBooleanField(section, field, controlId);
            } else if (field.type === 'text') {
                renderTextField(section, field, controlId);
            }
            container.appendChild(section);
        }
        return container;
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
        renderTemplateFields,
    };
    global.CreatorMeta = creatorMeta;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = creatorMeta;
    }

    if (global.document) {
        global.document.addEventListener('DOMContentLoaded', () => {
            const template = applyCreatorTemplate();
            if (!template) {
                global.location.replace('/');
                return;
            }
            renderTemplateFields(
                global.document.getElementById('templateFields'),
                template,
            );
        });
    }
}(globalThis));
