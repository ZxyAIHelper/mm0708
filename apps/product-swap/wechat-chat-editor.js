'use strict';

(function (global) {
    const ChatMaterials = (
        typeof module !== 'undefined'
        && module.exports
        && typeof require === 'function'
    )
        ? require('./chat-materials')
        : global.ChatMaterials;
    const CHAT_AVATARS = [
        { id: 'cat', label: '橘猫', src: '/assets/chat-avatars/cat.svg' },
        { id: 'bear', label: '棕熊', src: '/assets/chat-avatars/bear.svg' },
        { id: 'rabbit', label: '白兔', src: '/assets/chat-avatars/rabbit.svg' },
        { id: 'penguin', label: '企鹅', src: '/assets/chat-avatars/penguin.svg' },
        { id: 'fox', label: '狐狸', src: '/assets/chat-avatars/fox.svg' },
        { id: 'panda', label: '熊猫', src: '/assets/chat-avatars/panda.svg' },
        { id: 'chick', label: '小鸡', src: '/assets/chat-avatars/chick.svg' },
        { id: 'dog', label: '小狗', src: '/assets/chat-avatars/dog.svg' },
    ];

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
        const avatarSelection = {
            left: CHAT_AVATARS[0].src,
            right: CHAT_AVATARS[3].src,
        };
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

        const avatarSettings = element('div', 'chat-avatar-settings');
        avatarSettings.appendChild(
            element('span', 'chat-avatar-title', '聊天头像'),
        );
        for (const [side, label] of [
            ['left', '好友头像'],
            ['right', '我的头像'],
        ]) {
            const group = element('div', 'chat-avatar-group');
            group.appendChild(element('span', '', label));
            const choices = element('div', 'chat-avatar-choices');
            for (const avatar of CHAT_AVATARS) {
                const choice = element(
                    'button',
                    'chat-avatar-choice',
                );
                choice.type = 'button';
                choice.title = avatar.label;
                choice.setAttribute(
                    'aria-label',
                    `${label}：${avatar.label}`,
                );
                choice.setAttribute(
                    'aria-pressed',
                    String(avatarSelection[side] === avatar.src),
                );
                const image = element('img');
                image.src = avatar.src;
                image.alt = '';
                choice.appendChild(image);
                choice.addEventListener('click', () => {
                    avatarSelection[side] = avatar.src;
                    for (const button of choices.children) {
                        button.setAttribute(
                            'aria-pressed',
                            String(button === choice),
                        );
                    }
                    refreshPreview();
                });
                choices.appendChild(choice);
            }
            group.appendChild(choices);
            avatarSettings.appendChild(group);
        }

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
            avatarSettings,
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
        const mapSearch = element('div', 'chat-map-search');
        const regionLabel = element('label', '', '城市或区域');
        const regionInput = element('input', 'chat-map-region');
        regionInput.type = 'text';
        regionInput.maxLength = 40;
        regionInput.placeholder = '例如：北京';
        regionLabel.appendChild(regionInput);
        const keywordLabel = element('label', '', '店铺或地点名称');
        const keywordInput = element('input', 'chat-map-keyword');
        keywordInput.type = 'search';
        keywordInput.maxLength = 40;
        keywordInput.placeholder = '例如：颐和园';
        keywordLabel.appendChild(keywordInput);
        const searchButton = element(
            'button',
            'chat-map-search-button',
            '搜索真实地点',
        );
        searchButton.type = 'button';
        const searchStatus = element(
            'p',
            'chat-map-search-status',
            '填写城市和地点名称后搜索',
        );
        searchStatus.setAttribute('role', 'status');
        const searchResults = element('div', 'chat-map-results');
        mapSearch.append(
            regionLabel,
            keywordLabel,
            searchButton,
            searchStatus,
            searchResults,
        );
        dialog.append(dialogBar, mapSearch);
        section.appendChild(dialog);

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
            const title = element('div', 'chat-location-title');
            title.appendChild(element('strong', '', location.name));
            if (location.fallback) {
                title.appendChild(element(
                    'span',
                    'chat-location-fallback-badge',
                    '备用位置',
                ));
            }
            locationSummary.append(
                title,
                element('span', '', location.address),
            );
            const mapPreview = element(
                'div',
                'chat-location-map-state',
                '正在加载地图…',
            );
            locationSummary.appendChild(mapPreview);
            if (typeof map?.loadMapPreviewImage === 'function') {
                map.loadMapPreviewImage(location).then((image) => {
                    const current =
                        state.snapshot().materials.location;
                    if (
                        !current
                        || current.lat !== location.lat
                        || current.lng !== location.lng
                    ) {
                        return;
                    }
                    if (!image) {
                        mapPreview.textContent = '地图暂不可用';
                        return;
                    }
                    image.className = 'chat-location-map-preview';
                    image.alt = `${location.name}地图`;
                    mapPreview.replaceChildren(image);
                });
            } else {
                mapPreview.textContent = '地图暂不可用';
            }
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
                    { avatars: avatarSelection },
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
        locationButton.addEventListener('click', () => {
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
            regionInput.focus();
        });
        async function runLocationSearch() {
            searchButton.disabled = true;
            searchStatus.textContent = '正在搜索腾讯地图…';
            searchResults.replaceChildren();
            try {
                const locations = await map.searchLocations({
                    region: regionInput.value,
                    keyword: keywordInput.value,
                });
                if (locations.length === 0) {
                    searchStatus.textContent =
                        '没有找到地点，请尝试更具体的名称';
                    return;
                }
                searchStatus.textContent = locations.some(
                    (location) => location.fallback,
                )
                    ? '地图暂不可用，已提供备用地点'
                    : `找到 ${locations.length} 个真实地点`;
                for (const location of locations) {
                    const item = element(
                        'button',
                        'chat-map-result',
                    );
                    item.type = 'button';
                    item.append(
                        element('strong', '', location.name),
                        element(
                            'span',
                            '',
                            [location.city, location.address]
                                .filter(Boolean)
                                .join(' · '),
                        ),
                    );
                    if (location.fallback) {
                        item.appendChild(element(
                            'span',
                            'chat-location-fallback-badge',
                            '备用位置',
                        ));
                    }
                    item.addEventListener('click', () => {
                        state.setLocation(location);
                        renderLocation();
                        dialog.close();
                    });
                    searchResults.appendChild(item);
                }
            } catch (searchError) {
                searchStatus.textContent = searchError.message
                    || '地点搜索暂时不可用';
            } finally {
                searchButton.disabled = false;
            }
        }
        searchButton.addEventListener('click', runLocationSearch);
        keywordInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                runLocationSearch();
            }
        });
        mapStatus.textContent = '由腾讯地图提供真实地点搜索';

        renderImageList();
        renderLocation();
        renderMessageEditor();
        refreshPreview();

        return {
            state,
            refreshPreview,
            destroy() {
                renderedPages.forEach(
                    (page) => URL.revokeObjectURL(page.url),
                );
                dialog.remove();
                root.remove();
            },
        };
    }

    const api = {
        CHAT_AVATARS,
        createChatEditorState,
        createSafeExampleDraft,
        mountWechatChatEditor,
    };
    global.WechatChatEditor = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
