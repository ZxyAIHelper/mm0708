'use strict';

(function bootTaskHistory() {
    const api = window.ProductSwapApi;
    const apiBase = api.resolveApiBase(
        window.API_BASE_URL || '',
        window.location.hostname,
    );
    const elements = {
        filters: document.getElementById('taskTypeFilters'),
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
    const state = {
        taskType: '',
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
        return !asset
            || Boolean(asset.deletedAt)
            || Number(asset.expiresAt) <= Date.now();
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
        taskId,
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
            const response = await api.apiFetch(
                `/api/tasks/${encodeURIComponent(taskId)}`
                    + `/assets/${encodeURIComponent(asset.id)}`,
                {},
                { apiBase },
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData?.error?.code === 'ASSET_EXPIRED') {
                    showExpired(container);
                    return null;
                }
                throw new Error('IMAGE_LOAD_FAILED');
            }
            const blobUrl = URL.createObjectURL(await response.blob());
            urlGroup.add(blobUrl);
            image.src = blobUrl;
            image.hidden = false;
            placeholder.hidden = true;
            return blobUrl;
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
            await api.apiJson(
                `/api/tasks/${encodeURIComponent(taskId)}`,
                { method: 'DELETE' },
                { apiBase },
            );
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
        const query = new URLSearchParams({ limit: '30' });
        if (state.taskType) {
            query.set('type', state.taskType);
        }
        if (state.cursor) {
            query.set('cursor', state.cursor);
        }
        try {
            const data = await api.apiJson(
                `/api/tasks?${query.toString()}`,
                {},
                { apiBase },
            );
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

        const output = document.createElement('section');
        output.className = 'detail-section';
        const outputHeading = document.createElement('h3');
        outputHeading.textContent = '输出';
        const outputGrid = document.createElement('div');
        outputGrid.className = 'detail-assets output-assets';
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
        output.append(outputHeading, outputGrid);

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
        elements.detailContent.append(summary, output, inputs, deleteButton);
    }

    async function openDetail(taskId) {
        revokeAll(detailBlobUrls);
        elements.detailContent.textContent = '正在加载任务详情…';
        elements.detailLayer.hidden = false;
        document.body.classList.add('detail-open');
        elements.detailClose.focus();
        try {
            const data = await api.apiJson(
                `/api/tasks/${encodeURIComponent(taskId)}`,
                {},
                { apiBase },
            );
            renderDetail(data.task);
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
        const button = event.target.closest('[data-task-type]');
        if (!button || state.loading) {
            return;
        }
        for (const item of elements.filters.querySelectorAll('button')) {
            item.classList.toggle('active', item === button);
        }
        state.taskType = button.dataset.taskType || '';
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

    api.ensureSession(apiBase)
        .then(() => loadTasks({ reset: true }))
        .catch(() => {
            elements.loading.hidden = true;
            elements.error.hidden = false;
        });
}());

