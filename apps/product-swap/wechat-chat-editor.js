'use strict';

(function (global) {
    const ChatMaterials = (
        typeof module !== 'undefined'
        && module.exports
        && typeof require === 'function'
    )
        ? require('./chat-materials')
        : global.ChatMaterials;

    function clone(value) {
        return value === null || value === undefined
            ? value
            : JSON.parse(JSON.stringify(value));
    }

    function validateEditableDraft(draft) {
        if (
            !draft
            || draft.version !== 1
            || typeof draft.contactName !== 'string'
            || !draft.contactName.trim()
            || !Array.isArray(draft.messages)
            || draft.messages.length < 2
        ) {
            throw new Error('对话至少保留 2 条消息');
        }
        if (
            !draft.messages.some((message) => message.side === 'left')
            || !draft.messages.some((message) => message.side === 'right')
        ) {
            throw new Error('对话必须保留左右双方');
        }
        for (const message of draft.messages) {
            if (
                message.type === 'text'
                && (
                    !String(message.text || '').trim()
                    || String(message.text).trim().length > 120
                )
            ) {
                throw new Error('单条消息不能超过 120 字');
            }
        }
        return draft;
    }

    function createChatEditorState(initial = {}) {
        let materials = ChatMaterials.normalizeChatMaterials(
            initial.materials,
        );
        let draft = initial.draft ? clone(initial.draft) : null;

        function setDraft(value) {
            draft = clone(validateEditableDraft(clone(value)));
            return draft;
        }

        return {
            snapshot() {
                return clone({ materials, draft });
            },
            setStoreName(value) {
                materials.storeName = String(value || '').trim();
            },
            setRequirements(value) {
                materials.requirements = String(value || '').trim();
            },
            setImages(value) {
                const images = ChatMaterials.normalizeImages(value);
                if (images.length > 3) {
                    throw new Error('店铺图片不能超过 3 张');
                }
                materials.images = images;
            },
            setLocation(value) {
                materials.location = ChatMaterials.normalizeLocation(value);
            },
            setDraft,
            editText(id, value) {
                const text = String(value || '').trim();
                if (!text || text.length > 120) {
                    throw new Error('单条消息不能超过 120 字');
                }
                const message = draft?.messages.find(
                    (item) => item.id === id,
                );
                if (!message || message.type !== 'text') {
                    throw new Error('文字消息不存在');
                }
                message.text = text;
            },
            toggleSide(id) {
                const next = clone(draft);
                const message = next?.messages.find(
                    (item) => item.id === id,
                );
                if (!message) throw new Error('消息不存在');
                message.side = message.side === 'left' ? 'right' : 'left';
                setDraft(next);
            },
            removeMessage(id) {
                const next = clone(draft);
                if (!next || next.messages.length <= 2) {
                    throw new Error('对话至少保留 2 条消息');
                }
                next.messages = next.messages.filter(
                    (message) => message.id !== id,
                );
                if (next.messages.length === draft.messages.length) {
                    throw new Error('消息不存在');
                }
                setDraft(next);
            },
            async regenerate(generator) {
                const nextDraft = await generator(clone(materials));
                setDraft(nextDraft);
                return clone(draft);
            },
        };
    }

    function createSafeExampleDraft(input) {
        const materials = ChatMaterials.normalizeChatMaterials(input);
        const store = materials.storeName || '刚才说的那家店';
        const rawMessages = [
            {
                side: 'right',
                type: 'text',
                text: `我刚去了${store}，比预想中舒服。`,
            },
        ];
        for (const image of materials.images) {
            rawMessages.push({
                side: rawMessages.length % 2 ? 'left' : 'right',
                type: 'image_ref',
                refId: image.id,
            });
        }
        if (materials.location) {
            rawMessages.push({
                side: rawMessages.length % 2 ? 'left' : 'right',
                type: 'location_ref',
                refId: materials.location.id,
            });
        }
        rawMessages.push(
            {
                side: 'left',
                type: 'text',
                text: '看起来很不错，氛围也挺自然的。',
            },
            {
                side: 'right',
                type: 'text',
                text: '对，聊天坐一会儿很合适。',
            },
            {
                side: 'left',
                type: 'text',
                text: '那下次带我一起去。',
            },
            {
                side: 'right',
                type: 'text',
                text: '可以呀，周末约。',
            },
            {
                side: 'left',
                type: 'text',
                text: '说定了。',
            },
        );
        return {
            version: 1,
            contactName: '小林',
            messages: rawMessages.slice(0, 10).map(
                (message, index) => ({
                    id: `example-${index + 1}`,
                    ...message,
                }),
            ),
        };
    }

    function element(tag, className, text) {
        const node = global.document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('图片读取失败'));
            reader.readAsDataURL(file);
        });
    }

    function mountWechatChatEditor({
        section,
        field,
        api = global.ChatDraftClient,
        map = global.TencentMapPicker,
        renderer = global.WechatChatRenderer,
    }) {
        const state = createChatEditorState();
        state.setDraft(createSafeExampleDraft({}));
        section.replaceChildren();
        section.classList.add('wechat-chat-editor-host');

        const root = element('div', 'wechat-chat-editor');
        const inputs = element('div', 'chat-material-panel');
        const previewPanel = element('div', 'chat-preview-panel');
        const heading = element('div', 'chat-editor-heading');
        heading.append(
            element('h2', '', '准备聊天素材'),
            element(
                'p',
                '',
                '店铺名称、图片、真实地点任选一个，AI 会生成完整对话。',
            ),
        );

        const nameLabel = element('label', '', '店铺名称（选填）');
        const nameInput = element('input', 'chat-store-name');
        nameInput.type = 'text';
        nameInput.maxLength = 60;
        nameInput.placeholder = '例如：三山山';
        nameLabel.appendChild(nameInput);

        const imageLabel = element('label', '', '店铺图片（选填，最多 3 张）');
        const imageInput = element('input', 'chat-image-input');
        imageInput.type = 'file';
        imageInput.multiple = true;
        imageInput.accept = (field.accept || []).join(',');
        const imageList = element('div', 'chat-image-list');
        imageLabel.append(imageInput, imageList);

        const locationRow = element('div', 'chat-location-field');
        locationRow.appendChild(element('span', '', '真实地点（选填）'));
        const locationButton = element(
            'button',
            'chat-location-button',
            '选择店铺位置',
        );
        locationButton.type = 'button';
        const locationSummary = element(
            'div',
            'chat-location-summary',
            '尚未选择地点',
        );
        const mapStatus = element(
            'p',
            'chat-map-status',
            '正在读取腾讯地图配置…',
        );
        locationRow.append(locationButton, locationSummary, mapStatus);

        const requirementsLabel = element(
            'label',
            '',
            '补充要求（选填）',
        );
        const requirementsInput = element(
            'textarea',
            'chat-requirements',
        );
        requirementsInput.maxLength = 200;
        requirementsInput.placeholder =
            '例如：像朋友刚吃完后随手分享，语气自然一点';
        requirementsLabel.appendChild(requirementsInput);

        const error = element('p', 'chat-editor-error');
        error.setAttribute('role', 'alert');
        error.hidden = true;
        const actions = element('div', 'chat-editor-actions');
        const generate = element(
            'button',
            'chat-generate-button',
            '用 AI 生成对话',
        );
        generate.type = 'button';
        const fallback = element(
            'button',
            'chat-example-button',
            '载入可编辑示例',
        );
        fallback.type = 'button';
        fallback.hidden = true;
        actions.append(generate, fallback);
        inputs.append(
            heading,
            nameLabel,
            imageLabel,
            locationRow,
            requirementsLabel,
            error,
            actions,
        );

        previewPanel.appendChild(element('h2', '', '微信单聊预览'));
        const canvasWrap = element('div', 'chat-canvas-wrap');
        const messagesEditor = element('div', 'chat-message-editor');
        const previewActions = element('div', 'chat-preview-actions');
        const downloadAll = element(
            'button',
            'chat-download-button chat-download-all-button',
            '下载全部截图',
        );
        downloadAll.type = 'button';
        previewActions.appendChild(downloadAll);
        previewPanel.append(canvasWrap, messagesEditor, previewActions);
        root.append(inputs, previewPanel);
        section.appendChild(root);

        const dialog = element('dialog', 'chat-map-dialog');
        const dialogBar = element('div', 'chat-map-dialog-bar');
        dialogBar.appendChild(element('strong', '', '选择真实店铺位置'));
        const closeDialog = element('button', '', '关闭');
        closeDialog.type = 'button';
        dialogBar.appendChild(closeDialog);
        const mapFrame = element('iframe', 'chat-map-frame');
        mapFrame.title = '腾讯地图选点';
        dialog.append(dialogBar, mapFrame);
        section.appendChild(dialog);

        let pickerConfig = null;
        let renderedPages = [];
        let renderVersion = 0;

        function showError(message) {
            error.textContent = message || '';
            error.hidden = !message;
        }

        function renderImageList() {
            imageList.replaceChildren();
            for (const [index, image] of (
                state.snapshot().materials.images
            ).entries()) {
                const card = element('div', 'chat-image-card');
                const preview = element('img');
                preview.src = image.dataUrl;
                preview.alt = `店铺图片 ${index + 1}`;
                const remove = element('button', '', '删除');
                remove.type = 'button';
                remove.addEventListener('click', () => {
                    const images = state.snapshot().materials.images;
                    images.splice(index, 1);
                    state.setImages(images);
                    renderImageList();
                });
                card.append(preview, remove);
                imageList.appendChild(card);
            }
        }

        function renderLocation() {
            const location = state.snapshot().materials.location;
            locationSummary.replaceChildren();
            if (!location) {
                locationSummary.textContent = '尚未选择地点';
                return;
            }
            locationSummary.append(
                element('strong', '', location.name),
                element('span', '', location.address),
            );
            const clear = element('button', '', '清除');
            clear.type = 'button';
            clear.addEventListener('click', () => {
                state.setLocation(null);
                renderLocation();
            });
            locationSummary.appendChild(clear);
        }

        function renderMessageEditor() {
            messagesEditor.replaceChildren();
            const draft = state.snapshot().draft;
            for (const message of draft?.messages || []) {
                const row = element(
                    'article',
                    `chat-edit-message is-${message.side}`,
                );
                const meta = element(
                    'span',
                    'chat-edit-side',
                    message.side === 'left' ? '朋友' : '我',
                );
                let content;
                if (message.type === 'text') {
                    content = element('textarea', 'chat-edit-text');
                    content.maxLength = 80;
                    content.value = message.text;
                    content.addEventListener('change', () => {
                        try {
                            state.editText(message.id, content.value);
                            showError('');
                            refreshPreview();
                        } catch (editError) {
                            showError(editError.message);
                            content.value = message.text;
                        }
                    });
                } else {
                    content = element(
                        'span',
                        'chat-edit-reference',
                        message.type === 'image_ref'
                            ? '图片消息'
                            : '地点卡片',
                    );
                }
                const controls = element('div', 'chat-edit-controls');
                const toggle = element('button', '', '切换左右');
                toggle.type = 'button';
                toggle.addEventListener('click', () => {
                    try {
                        state.toggleSide(message.id);
                        showError('');
                        renderMessageEditor();
                        refreshPreview();
                    } catch (toggleError) {
                        showError(toggleError.message);
                    }
                });
                const remove = element('button', '', '删除');
                remove.type = 'button';
                remove.addEventListener('click', () => {
                    try {
                        state.removeMessage(message.id);
                        showError('');
                        renderMessageEditor();
                        refreshPreview();
                    } catch (removeError) {
                        showError(removeError.message);
                    }
                });
                controls.append(toggle, remove);
                row.append(meta, content, controls);
                messagesEditor.appendChild(row);
            }
        }

        async function refreshPreview() {
            const version = ++renderVersion;
            const snapshot = state.snapshot();
            if (!snapshot.draft) return;
            try {
                const next = await renderer.renderChatPages(
                    snapshot.draft,
                    snapshot.materials,
                );
                if (version !== renderVersion) {
                    next.forEach((page) => URL.revokeObjectURL(page.url));
                    return;
                }
                renderedPages.forEach(
                    (page) => URL.revokeObjectURL(page.url),
                );
                renderedPages = next;
                canvasWrap.replaceChildren();
                for (const page of renderedPages) {
                    const pagePreview = element(
                        'div',
                        'chat-page-preview',
                    );
                    const pageLabel = element(
                        'span',
                        'chat-page-label',
                        `第 ${page.layout.pageNumber} / ${
                            page.layout.pageCount
                        } 张`,
                    );
                    page.canvas.className = 'chat-preview-canvas';
                    page.canvas.setAttribute(
                        'aria-label',
                        `微信聊天截图第 ${page.layout.pageNumber} 张`,
                    );
                    const pageDownload = element(
                        'button',
                        'chat-page-download',
                        `下载第 ${page.layout.pageNumber} 张`,
                    );
                    pageDownload.type = 'button';
                    pageDownload.addEventListener('click', () => {
                        const anchor = element('a');
                        anchor.href = page.url;
                        anchor.download = page.fileName;
                        anchor.click();
                    });
                    pagePreview.append(
                        pageLabel,
                        page.canvas,
                        pageDownload,
                    );
                    canvasWrap.appendChild(pagePreview);
                }
                downloadAll.disabled = false;
                showError('');
            } catch (renderError) {
                downloadAll.disabled = renderedPages.length === 0;
                showError(renderError.message || '预览生成失败');
            }
        }

        async function generateDraft() {
            const validation = ChatMaterials.validateChatMaterials(
                state.snapshot().materials,
            );
            if (validation) {
                showError(validation.message);
                return;
            }
            generate.disabled = true;
            generate.textContent = 'AI 正在生成…';
            fallback.hidden = true;
            try {
                await state.regenerate((materials) => (
                    api.requestChatDraft(materials)
                ));
                renderMessageEditor();
                await refreshPreview();
            } catch (generateError) {
                showError(generateError.message || 'AI 对话暂时不可用');
                fallback.hidden = false;
            } finally {
                generate.disabled = false;
                generate.textContent = '重新生成整段对话';
            }
        }

        nameInput.addEventListener('input', () => {
            state.setStoreName(nameInput.value);
        });
        requirementsInput.addEventListener('input', () => {
            state.setRequirements(requirementsInput.value);
        });
        imageInput.addEventListener('change', async () => {
            try {
                const existing = state.snapshot().materials.images;
                const files = Array.from(imageInput.files || []);
                if (existing.length + files.length > 3) {
                    throw new Error('店铺图片不能超过 3 张');
                }
                const next = [...existing];
                for (const file of files) {
                    next.push({
                        id: `image-${next.length + 1}`,
                        dataUrl: await readFile(file),
                    });
                }
                state.setImages(next);
                renderImageList();
                showError('');
            } catch (uploadError) {
                showError(uploadError.message);
            } finally {
                imageInput.value = '';
            }
        });
        generate.addEventListener('click', generateDraft);
        fallback.addEventListener('click', () => {
            state.setDraft(createSafeExampleDraft(
                state.snapshot().materials,
            ));
            fallback.hidden = true;
            showError('');
            renderMessageEditor();
            refreshPreview();
        });
        downloadAll.addEventListener('click', async () => {
            if (renderedPages.length === 0) await refreshPreview();
            renderedPages.forEach((page, index) => {
                global.setTimeout(() => {
                    const anchor = element('a');
                    anchor.href = page.url;
                    anchor.download = page.fileName;
                    anchor.click();
                }, index * 180);
            });
        });
        closeDialog.addEventListener('click', () => dialog.close());
        locationButton.disabled = true;
        locationButton.addEventListener('click', () => {
            if (!pickerConfig) return;
            mapFrame.src = map.buildPickerUrl(pickerConfig);
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
        });
        const pickerListener = (event) => {
            const location = map.normalizePickerMessage(event);
            if (!location) return;
            state.setLocation(location);
            renderLocation();
            dialog.close();
        };
        global.addEventListener('message', pickerListener);

        Promise.resolve(map.getMapConfig())
            .then((config) => {
                pickerConfig = config;
                locationButton.disabled = false;
                mapStatus.textContent = '由腾讯地图提供真实地点搜索';
            })
            .catch(() => {
                mapStatus.textContent = '腾讯地图 Key 待配置';
                locationButton.disabled = true;
            });

        renderImageList();
        renderLocation();
        renderMessageEditor();
        refreshPreview();

        return {
            state,
            refreshPreview,
            destroy() {
                global.removeEventListener('message', pickerListener);
                renderedPages.forEach(
                    (page) => URL.revokeObjectURL(page.url),
                );
                dialog.remove();
                root.remove();
            },
        };
    }

    const api = {
        createChatEditorState,
        createSafeExampleDraft,
        mountWechatChatEditor,
    };
    global.WechatChatEditor = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
