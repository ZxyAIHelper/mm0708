'use strict';

(function bootTaskHistory() {
    const history = window.LocalTaskHistory;
    const elements = {
        filters: document.getElementById('workStatusFilters'),
        list: document.getElementById('taskList'),
        loading: document.getElementById('historyLoading'),
        empty: document.getElementById('historyEmpty'),
        error: document.getElementById('historyError'),
        retry: document.getElementById('historyRetry'),
        loadMore: document.getElementById('loadMoreButton'),
        detailLayer: document.getElementById('taskDetailLayer'),
        detailClose: document.getElementById('taskDetailClose'),
        detailContent: document.getElementById('taskDetailContent'),
    };
    let activeStatus = '';
    const state = {
        cursor: null,
        loading: false,
        tasks: new Map(),
    };
    const cardBlobUrls = new Set();
    const detailBlobUrls = new Set();

    function formatTime(timestamp) {
        return new Intl.DateTimeFormat('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(timestamp));
    }

    function statusLabel(status) {
        if (status === 'completed') {
            return '已完成';
        }
        if (status === 'failed') {
            return '生成失败';
        }
        return '处理中';
    }

    function taskTypeLabel(type, fallback) {
        return type === 'product_swap'
            ? '一键换产品'
            : (fallback || 'AI 生成任务');
    }

    function requirementsOf(task) {
        const value = task?.input?.requirements;
        return typeof value === 'string' && value.trim()
            ? value.trim()
            : '未填写额外要求';
    }

    function assetExpired(asset) {
        return !asset || history.isExpired(asset);
    }

    function revokeAll(group) {
        for (const url of group) {
            URL.revokeObjectURL(url);
        }
        group.clear();
    }

    function showExpired(container, message = '图片已过期') {
        container.classList.add('asset-expired');
        const image = container.querySelector('img');
        if (image) {
            image.hidden = true;
        }
        const placeholder = container.querySelector('.asset-placeholder');
        if (placeholder) {
            placeholder.textContent = message;
            placeholder.hidden = false;
        }
    }

    async function loadProtectedImage(
        container,
        _taskId,
        asset,
        urlGroup,
    ) {
        if (assetExpired(asset)) {
            showExpired(container);
            return null;
        }
        const image = container.querySelector('img');
        const placeholder = container.querySelector('.asset-placeholder');
        try {
            let imageUrl = asset.sourceUrl || '';
            if (asset.blob) {
                const blobUrl = URL.createObjectURL(asset.blob);
                urlGroup.add(blobUrl);
                imageUrl = blobUrl;
            }
            if (!imageUrl) {
                showExpired(container);
                return null;
            }
            image.addEventListener('error', () => {
                showExpired(container);
            }, { once: true });
            image.src = imageUrl;
            image.hidden = false;
            placeholder.hidden = true;
            return imageUrl;
        } catch {
            showExpired(container, '图片暂时无法加载');
            return null;
        }
    }

    function createAssetFrame(className = 'task-preview') {
        const frame = document.createElement('div');
        frame.className = className;
        const image = document.createElement('img');
        image.alt = '';
        image.hidden = true;
        const placeholder = document.createElement('span');
        placeholder.className = 'asset-placeholder';
        placeholder.textContent = '正在加载图片…';
        frame.append(image, placeholder);
        return frame;
    }

    async function deleteTask(taskId, card) {
        if (!window.confirm('确定删除这条任务吗？相关图片也会被删除。')) {
            return;
        }
        try {
            await history.deleteTask(taskId);
            state.tasks.delete(taskId);
            card?.remove();
            if (!state.tasks.size) {
                elements.empty.hidden = false;
            }
            if (!elements.detailLayer.hidden) {
                closeDetail();
            }
        } catch {
            window.alert('删除失败，请稍后重试。');
        }
    }

    function createTaskCard(task) {
        const card = document.createElement('article');
        card.className = 'task-card';
        card.dataset.taskId = task.id;

        const preview = createAssetFrame();
        loadProtectedImage(
            preview,
            task.id,
            task.previewAsset,
            cardBlobUrls,
        );

        const body = document.createElement('div');
        body.className = 'task-card-body';
        const heading = document.createElement('div');
        heading.className = 'task-card-heading';
        const title = document.createElement('h2');
        title.textContent = taskTypeLabel(task.taskType, task.title);
        const status = document.createElement('span');
        status.className = `task-status status-${task.status}`;
        status.textContent = statusLabel(task.status);
        heading.append(title, status);

        const time = document.createElement('time');
        time.dateTime = new Date(task.createdAt).toISOString();
        time.textContent = formatTime(task.createdAt);
        const requirement = document.createElement('p');
        requirement.className = 'task-requirement';
        requirement.textContent = requirementsOf(task);

        const actions = document.createElement('div');
        actions.className = 'task-card-actions';
        const detailButton = document.createElement('button');
        detailButton.type = 'button';
        detailButton.textContent = '查看详情';
        detailButton.addEventListener('click', () => openDetail(task.id));
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'danger-button';
        deleteButton.textContent = '删除';
        deleteButton.addEventListener('click', () => {
            deleteTask(task.id, card);
        });
        actions.append(detailButton, deleteButton);
        body.append(heading, time, requirement, actions);
        card.append(preview, body);
        return card;
    }

    function setLoading(value) {
        state.loading = value;
        elements.loading.hidden = !value;
        elements.loadMore.disabled = value;
    }

    async function loadTasks({ reset = false } = {}) {
        if (state.loading) {
            return;
        }
        if (reset) {
            revokeAll(cardBlobUrls);
            state.cursor = null;
            state.tasks.clear();
            elements.list.replaceChildren();
        }
        setLoading(true);
        elements.error.hidden = true;
        elements.empty.hidden = true;
        elements.loadMore.hidden = true;
        try {
            const data = await history.listTasks({
                status: activeStatus,
                cursor: state.cursor,
                limit: 30,
            });
            for (const task of data.tasks || []) {
                state.tasks.set(task.id, task);
                elements.list.appendChild(createTaskCard(task));
            }
            state.cursor = data.nextCursor || null;
            elements.empty.hidden = state.tasks.size > 0;
            elements.loadMore.hidden = !state.cursor;
        } catch {
            elements.error.hidden = false;
        } finally {
            setLoading(false);
        }
    }

    function roleLabel(role) {
        return {
            target: '目标图',
            product: '产品图',
            scene: '场景图',
            previous: '上一版结果',
            output: '生成结果',
        }[role] || '任务图片';
    }

    function createDetailAsset(task, asset) {
        const item = document.createElement('article');
        item.className = 'detail-asset';
        const label = document.createElement('h4');
        label.textContent = roleLabel(asset.role);
        const frame = createAssetFrame('detail-asset-frame');
        const download = document.createElement('button');
        download.type = 'button';
        download.textContent = '下载图片';
        download.hidden = true;
        item.append(label, frame, download);
        loadProtectedImage(
            frame,
            task.id,
            asset,
            detailBlobUrls,
        ).then((url) => {
            if (!url) {
                return;
            }
            download.hidden = false;
            download.addEventListener('click', () => {
                const link = document.createElement('a');
                link.href = url;
                link.download = `${task.taskType}-${asset.role}.png`;
                link.click();
            });
        });
        return item;
    }

    function renderDetail(task) {
        elements.detailContent.replaceChildren();
        const summary = document.createElement('section');
        summary.className = 'detail-summary';
        const eyebrow = document.createElement('p');
        eyebrow.className = 'history-eyebrow';
        eyebrow.textContent = taskTypeLabel(task.taskType, task.title);
        const heading = document.createElement('h3');
        heading.textContent = `${statusLabel(task.status)} · ${formatTime(task.createdAt)}`;
        const requirements = document.createElement('p');
        requirements.textContent = `额外要求：${requirementsOf(task)}`;
        if (task.errorMessage) {
            const error = document.createElement('p');
            error.className = 'detail-error';
            error.textContent = task.errorMessage;
            summary.append(eyebrow, heading, requirements, error);
        } else {
            summary.append(eyebrow, heading, requirements);
        }

        const conversation = document.createElement('section');
        conversation.className = 'detail-section history-conversation';
        const conversationHeading = document.createElement('h3');
        conversationHeading.textContent = '输入对话';
        conversation.appendChild(conversationHeading);
        const messages = Array.isArray(task.input?.messages)
            ? task.input.messages
            : [];
        if (messages.length) {
            for (const message of messages) {
                const item = document.createElement('p');
                item.className = `chat-message ${message.role}`;
                item.textContent = message.content;
                conversation.appendChild(item);
            }
        } else {
            const emptyConversation = document.createElement('p');
            emptyConversation.className = 'muted-copy';
            emptyConversation.textContent = '本次任务没有前置对话。';
            conversation.appendChild(emptyConversation);
        }

        const output = document.createElement('section');
        output.className = 'detail-section';
        const outputHeading = document.createElement('h3');
        outputHeading.textContent = '输出';
        const outputGrid = document.createElement('div');
        outputGrid.className = 'detail-assets output-assets';
        let response = null;
        if (task.result?.assistantMessage) {
            response = document.createElement('p');
            response.className = 'detail-response';
            response.textContent = task.result.assistantMessage;
        }
        const outputs = task.assets.filter((asset) => asset.role === 'output');
        for (const asset of outputs) {
            outputGrid.appendChild(createDetailAsset(task, asset));
        }
        if (!outputs.length) {
            const missing = document.createElement('p');
            missing.className = 'muted-copy';
            missing.textContent = task.status === 'failed'
                ? '本次任务没有生成结果。'
                : '结果图片不可用。';
            outputGrid.appendChild(missing);
        }
        output.append(outputHeading);
        if (response) {
            output.append(response);
        }
        output.append(outputGrid);

        const inputs = document.createElement('section');
        inputs.className = 'detail-section';
        const inputHeading = document.createElement('h3');
        inputHeading.textContent = '输入';
        const inputGrid = document.createElement('div');
        inputGrid.className = 'detail-assets';
        for (const asset of task.assets.filter((item) => item.role !== 'output')) {
            inputGrid.appendChild(createDetailAsset(task, asset));
        }
        inputs.append(inputHeading, inputGrid);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'detail-delete danger-button';
        deleteButton.textContent = '删除任务';
        deleteButton.addEventListener('click', () => {
            const card = elements.list.querySelector(
                `[data-task-id="${CSS.escape(task.id)}"]`,
            );
            deleteTask(task.id, card);
        });
        elements.detailContent.append(
            summary,
            conversation,
            output,
            inputs,
            deleteButton,
        );
    }

    async function openDetail(taskId) {
        revokeAll(detailBlobUrls);
        elements.detailContent.textContent = '正在加载任务详情…';
        elements.detailLayer.hidden = false;
        document.body.classList.add('detail-open');
        elements.detailClose.focus();
        try {
            const task = await history.getTask(taskId);
            if (!task) {
                throw new Error('TASK_NOT_FOUND');
            }
            renderDetail(task);
        } catch {
            elements.detailContent.textContent = '任务详情加载失败，请关闭后重试。';
        }
    }

    function closeDetail() {
        elements.detailLayer.hidden = true;
        document.body.classList.remove('detail-open');
        revokeAll(detailBlobUrls);
        elements.detailContent.replaceChildren();
    }

    elements.filters.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-status]');
        if (!button || state.loading) {
            return;
        }
        for (const item of elements.filters.querySelectorAll('button')) {
            item.classList.toggle('active', item === button);
            item.setAttribute('aria-pressed', String(item === button));
        }
        activeStatus = button.dataset.status || '';
        loadTasks({ reset: true });
    });
    elements.retry.addEventListener('click', () => loadTasks({ reset: true }));
    elements.loadMore.addEventListener('click', () => loadTasks());
    elements.detailClose.addEventListener('click', closeDetail);
    elements.detailLayer.addEventListener('click', (event) => {
        if (event.target === elements.detailLayer) {
            closeDetail();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !elements.detailLayer.hidden) {
            closeDetail();
        }
    });
    window.addEventListener('beforeunload', () => {
        revokeAll(cardBlobUrls);
        revokeAll(detailBlobUrls);
    });

    history.recoverInterruptedTasks()
        .then(() => history.cleanupExpiredAssets())
        .then(() => loadTasks({ reset: true }))
        .catch(() => {
            elements.loading.hidden = true;
            elements.error.hidden = false;
        });
}());
