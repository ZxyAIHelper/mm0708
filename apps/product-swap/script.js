'use strict';

const CLIENT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const CLIENT_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);

function resolveApiBase(explicitBase, hostname) {
    if (explicitBase) {
        return String(explicitBase).replace(/\/+$/, '');
    }

    if (
        hostname === 'localhost'
        || hostname === '127.0.0.1'
    ) {
        return '';
    }

    return 'https://api.mm0708.top';
}

function validateClientFileMeta(file, acceptedTypes = CLIENT_IMAGE_TYPES) {
    const allowedTypes = acceptedTypes instanceof Set
        ? acceptedTypes
        : new Set(acceptedTypes);
    if (!allowedTypes.has(file.type)) {
        return {
            code: 'UNSUPPORTED_IMAGE',
            message: '仅支持 JPG、PNG、WebP',
        };
    }

    if (file.size > CLIENT_MAX_IMAGE_BYTES) {
        return {
            code: 'FILE_TOO_LARGE',
            message: '单张图片不能超过 10MB',
        };
    }

    return null;
}

function buildGeneratePayload(state) {
    return {
        targetImage: state.target || '',
        productImage: state.product || '',
        sceneImage: state.scene || '',
        requirements: String(
            state.requirements || '',
        ).trim(),
    };
}

function buildRefinePayload(
    initialPayloadOrState,
    stateOrRequirements,
    maybeRequirements,
) {
    const isSchemaCall = maybeRequirements !== undefined;
    const state = isSchemaCall
        ? stateOrRequirements
        : initialPayloadOrState;
    const initialPayload = isSchemaCall
        ? initialPayloadOrState
        : buildGeneratePayload(state);
    const requirements = isSchemaCall
        ? maybeRequirements
        : stateOrRequirements;
    return {
        ...initialPayload,
        previousImage: state.result || '',
        conversationId: state.conversationId || '',
        messages: Array.isArray(state.messages)
            ? state.messages.slice(-6)
            : [],
        requirements: String(requirements || '').trim(),
    };
}

function appendQuickPrompt(existingValue, prompt, maxLength = 500) {
    const limit = Number.isInteger(maxLength) && maxLength > 0
        ? maxLength
        : 500;
    const current = String(existingValue || '').trim();
    const next = String(prompt || '').trim();
    if (!next) return current.slice(0, limit);
    const tail = current.split(/[，,]/).at(-1)?.trim();
    if (tail === next) return current.slice(0, limit);
    return [current, next]
        .filter(Boolean)
        .join('，')
        .slice(0, limit);
}

const ACTIVE_TASK_KEY = 'product_swap_active_task_id';

function activeTaskStorageKey(template) {
    const identity = [
        template?.id || 'product-swap',
        template?.taskType || 'product_swap',
    ].join(':');
    return `${ACTIVE_TASK_KEY}:${identity}`;
}

function taskMatchesTemplate(task, template) {
    if (!task || !template || task.taskType !== template.taskType) {
        return false;
    }
    const templateId = task.input?.templateId;
    if (templateId) return templateId === template.id;
    return template.id === 'product-swap';
}

function safeHistoryPrimitive(value) {
    if (typeof value === 'string') {
        return !value.trimStart().toLowerCase().startsWith('data:');
    }
    return (
        typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value))
        || value === null
    );
}

function historyInputFromPayload(
    manifestOrPayload,
    payloadOrIsRefinement,
    isRefinement = false,
) {
    const hasManifest = Array.isArray(manifestOrPayload?.fields);
    const manifest = hasManifest ? manifestOrPayload : null;
    const payload = hasManifest ? payloadOrIsRefinement : manifestOrPayload;
    const refinement = hasManifest
        ? isRefinement
        : Boolean(payloadOrIsRefinement);
    const input = {};

    if (manifest) {
        input.templateId = String(payload?.templateId || manifest.id || '');
        for (const field of manifest.fields) {
            if (field.type === 'image') continue;
            const value = payload?.[field.key];
            if (!safeHistoryPrimitive(value)) continue;
            input[field.key] = typeof value === 'string'
                ? value.trim()
                : value;
        }
    } else {
        for (const key of [
            'templateId',
            'aspectRatio',
            'showDateTime',
            'requirements',
        ]) {
            const value = payload?.[key];
            if (!safeHistoryPrimitive(value)) continue;
            input[key] = typeof value === 'string'
                ? value.trim()
                : value;
        }
        if (!('requirements' in input)) input.requirements = '';
    }
    if (safeHistoryPrimitive(payload?.generatedAt)) {
        input.generatedAt = String(payload.generatedAt);
    }
    input.isRefinement = refinement;
    input.conversationId = String(payload?.conversationId || '');
    input.messages = Array.isArray(payload?.messages)
        ? payload.messages.slice(-6).map((message) => ({
            role: String(message?.role || ''),
            content: String(message?.content || ''),
        }))
        : [];
    return input;
}

function createGenerationMessage(taskId, payload, apiBase, origin) {
    const base = apiBase || origin;
    return {
        type: 'product-swap:start',
        version: 2,
        taskId,
        apiUrl: new URL(
            `${String(base).replace(/\/$/, '')}/api/product-swap/generate`,
            origin,
        ).toString(),
        payload,
    };
}

function exchangeWorkerMessage(
    worker,
    serviceWorkers,
    outbound,
    accepts,
    timeoutMs,
) {
    return new Promise((resolve) => {
        let timer = null;
        let settled = false;
        let posted = false;
        const finish = (response) => {
            if (settled) return;
            settled = true;
            if (timer !== null) clearTimeout(timer);
            serviceWorkers.removeEventListener('message', onMessage);
            resolve({ posted, response });
        };
        const onMessage = (event) => {
            if (accepts(event?.data)) finish(event.data);
        };
        serviceWorkers.addEventListener('message', onMessage);
        timer = setTimeout(() => finish(null), timeoutMs);
        try {
            worker.postMessage(outbound);
            posted = true;
        } catch {
            finish(null);
        }
    });
}

async function dispatchGenerationMessage(
    worker,
    serviceWorkers,
    message,
    {
        timeoutMs = 300,
        requestId = `cap_${Date.now()}_${
            Math.random().toString(36).slice(2)
        }`,
    } = {},
) {
    if (typeof worker?.postMessage !== 'function'
        || typeof serviceWorkers?.addEventListener !== 'function'
        || typeof serviceWorkers?.removeEventListener !== 'function') {
        return false;
    }
    const boundedTimeout = Math.max(
        0,
        Math.min(1000, Number(timeoutMs) || 0),
    );
    const capabilityExchange = await exchangeWorkerMessage(
        worker,
        serviceWorkers,
        {
            type: 'product-swap:capabilities:request',
            requestId,
        },
        (value) => (
            value?.type === 'product-swap:capabilities:response'
            && value.requestId === requestId
            && Array.isArray(value.supportedGenerationVersions)
        ),
        boundedTimeout,
    );
    if (!capabilityExchange.posted) {
        return false;
    }
    const capabilities = capabilityExchange.response;
    if (!capabilities?.supportedGenerationVersions.includes(2)) {
        try {
            worker.postMessage({
                ...message,
                version: 1,
            });
            return true;
        } catch {
            return false;
        }
    }
    const startExchange = await exchangeWorkerMessage(
        worker,
        serviceWorkers,
        message,
        (value) => (
            value?.type === 'product-swap:start:ack'
            && value.taskId === message.taskId
            && value.version === 2
        ),
        boundedTimeout,
    );
    return startExchange.posted;
}

function pollingDelay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pollLocalTask(
    taskId,
    {
        history,
        intervalMs = 1000,
        delay = pollingDelay,
        onUpdate = () => undefined,
    },
) {
    while (true) {
        const task = await history.getTask(taskId);
        if (!task) {
            throw new Error('TASK_NOT_FOUND');
        }
        onUpdate(task);
        if (task.status === 'completed') {
            return task;
        }
        let receipt = null;
        if (history.getGenerationReceipt) {
            try {
                receipt = await history.getGenerationReceipt(taskId);
            } catch {
                // IndexedDB polling continues when Cache Storage is unavailable.
            }
        }
        if (receipt?.imageUrl) {
            let persisted = false;
            if (history.completeTask) {
                try {
                    await history.completeTask(taskId, receipt);
                    persisted = true;
                } catch {
                    // Try the smaller metadata-only write below.
                }
            }
            if (!persisted && history.completeTaskMetadata) {
                try {
                    await history.completeTaskMetadata(taskId, receipt);
                    persisted = true;
                } catch {
                    // The receipt itself is sufficient to return the success.
                }
            }
            if (persisted) {
                await history.deleteGenerationReceipt?.(taskId).catch(
                    () => undefined,
                );
            }
            return {
                ...task,
                status: 'completed',
                result: receipt,
                errorCode: null,
                errorMessage: null,
            };
        }
        if (task.status === 'failed') {
            return task;
        }
        if (history.isStaleProcessingTask?.(task)) {
            await history.failTask(
                taskId,
                'GENERATION_INTERRUPTED',
                '页面后台生成已中断',
            );
            continue;
        }
        await delay(intervalMs);
    }
}

const ERROR_MESSAGES = {
    INVALID_INPUT: '请检查上传图片和额外要求',
    FILE_TOO_LARGE: '单张图片不能超过 10MB',
    UNSUPPORTED_IMAGE: '仅支持 JPG、PNG、WebP',
    CODEX_CLI_UNAVAILABLE: '本机没有可用的 Codex CLI',
    CODEX_GENERATION_FAILED: '本地生成失败，请稍后重试',
    CODEX_TIMEOUT: '生成超时，请稍后重试',
    RESULT_IMAGE_NOT_FOUND: 'Codex 没有生成结果图片',
    VOLCANO_PROVIDER_NOT_CONFIGURED: '火山换品服务尚未配置',
    PROVIDER_REQUEST_FAILED: '图片服务请求失败',
    PROVIDER_TIMEOUT: '图片生成超时，请稍后重试',
    AGENT_LOOP_GUARD: '检测到嵌套生成，已阻止 agent 循环',
};

function mapErrorCode(code) {
    return ERROR_MESSAGES[code] || '生成失败，请稍后重试';
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
    });
}

function readImageDimensions(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({
            width: image.naturalWidth,
            height: image.naturalHeight,
        });
        image.onerror = () => reject(
            new Error('图片无法识别，请重新上传'),
        );
        image.src = source;
    });
}

function boot() {
    const activeTemplate = window.CreatorMeta?.resolveCreatorTemplate(window.location.search);
    if (!activeTemplate) return;
    const CreatorForm = window.CreatorForm;
    const versions = VersionHistory.createVersionHistory();
    let selectedVersionIndex = -1;
    const activeTaskKey = activeTaskStorageKey(activeTemplate);
    const uploadOperations = CreatorForm.createUploadOperations();
    const state = {
        values: CreatorForm.initialValues(activeTemplate),
        result: '',
        conversationId: '',
        messages: [],
        isGenerating: false,
        isRefining: false,
    };
    let lastInitialPayload = null;
    const apiBase = resolveApiBase(
        window.API_BASE_URL || '',
        window.location.hostname,
    );
    const apiClient = window.ProductSwapApi;
    const localHistory = window.LocalTaskHistory;
    const workerRegistration = 'serviceWorker' in navigator
        ? navigator.serviceWorker.register('/generation-worker.js', {
            scope: '/',
        }).then(() => navigator.serviceWorker.ready)
            .catch(() => null)
        : Promise.resolve(null);
    const form = document.getElementById('swapForm');
    const generateButton =
        document.getElementById('generateButton');
    const formError = document.getElementById('formError');
    const archiveNotice =
        document.getElementById('archiveNotice');
    const resultSection =
        document.getElementById('resultSection');
    const resultImage =
        document.getElementById('resultImage');
    const versionRail = document.getElementById('versionRail');
    const templateFields =
        document.getElementById('templateFields');
    const refineForm = document.getElementById('refineForm');
    const refineInput = document.getElementById('refineInput');
    const refineButton = document.getElementById('refineButton');
    const chatTimeline = document.getElementById('chatTimeline');
    const quickPrompts = document.getElementById('quickPrompts');
    const fields = Array.isArray(activeTemplate?.fields)
        ? activeTemplate.fields
        : [];
    const fieldSections = Object.fromEntries(
        Array.from(templateFields.children).map((section) => [
            section.dataset.fieldKey,
            section,
        ]),
    );

    function showError(message) {
        formError.textContent = message;
        formError.hidden = !message;
    }

    function showArchiveNotice(message) {
        archiveNotice.textContent = message;
        archiveNotice.hidden = !message;
    }

    function showVersion(version) {
        if (!version) return;
        state.result = version.imageUrl;
        state.conversationId = version.conversationId;
        state.messages = version.messages.map((message) => ({
            ...message,
        }));
        resultImage.src = version.imageUrl;
        resultSection.hidden = false;
        renderMessages();
        renderVersions();
    }

    function renderVersions() {
        const items = versions.list();
        versionRail.replaceChildren();
        versionRail.hidden = items.length === 0;

        items.forEach((version, index) => {
            const item = document.createElement('div');
            item.className = 'version-item';

            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'version-select';
            selectButton.setAttribute(
                'aria-label',
                `查看版本 ${index + 1}：${version.instruction}`,
            );
            if (index === selectedVersionIndex) {
                selectButton.setAttribute('aria-current', 'true');
            }
            selectButton.addEventListener('click', () => {
                const selected = versions.select(index);
                if (!selected) return;
                selectedVersionIndex = index;
                showVersion(selected);
            });

            const thumbnail = document.createElement('img');
            thumbnail.src = version.imageUrl;
            thumbnail.alt = '';
            selectButton.appendChild(thumbnail);

            const restoreButton = document.createElement('button');
            restoreButton.type = 'button';
            restoreButton.className = 'restore-version';
            restoreButton.textContent = '恢复';
            restoreButton.setAttribute(
                'aria-label',
                `恢复版本 ${index + 1}：${version.instruction}`,
            );
            restoreButton.addEventListener('click', () => {
                const restored = versions.restore(index);
                if (!restored) return;
                selectedVersionIndex = versions.list().length - 1;
                showVersion(restored);
            });

            item.append(selectButton, restoreButton);
            versionRail.appendChild(item);
        });
    }

    function addVersion(input) {
        versions.add(input);
        selectedVersionIndex = versions.list().length - 1;
        const current = versions.current();
        showVersion(current);
        return current;
    }

    function renderQuickPrompts() {
        const prompts = Array.isArray(activeTemplate?.quickPrompts)
            ? activeTemplate.quickPrompts
            : [];
        quickPrompts.replaceChildren();
        quickPrompts.hidden = prompts.length === 0;

        for (const prompt of prompts) {
            const quickPrompt = document.createElement('button');
            quickPrompt.type = 'button';
            quickPrompt.className = 'quick-prompt';
            quickPrompt.textContent = prompt;
            quickPrompt.addEventListener('click', () => {
                refineInput.value = appendQuickPrompt(
                    refineInput.value,
                    prompt,
                    refineInput.maxLength > 0
                        ? refineInput.maxLength
                        : 500,
                );
                refineInput.focus();
            });
            quickPrompts.appendChild(quickPrompt);
        }
    }

    Promise.all([
        localHistory.cleanupExpiredAssets(),
        localHistory.recoverInterruptedTasks(),
    ]).catch(() => undefined);

    async function startLocalTask(
        payload,
        isRefinement = false,
        versionContext = {},
    ) {
        try {
            return await localHistory.startTask({
                taskType: activeTemplate?.taskType || 'product_swap',
                title: activeTemplate?.name || '爆款场景同款图',
                input: {
                    ...historyInputFromPayload(
                        activeTemplate,
                        payload,
                        isRefinement,
                    ),
                    templateId: activeTemplate?.id || 'product-swap',
                    baseVersionId: String(
                        versionContext.baseVersionId || '',
                    ),
                },
                images: [
                    ...fields
                        .filter((field) => field.type === 'image')
                        .map((field) => ({
                            role: field.role || field.key,
                            source: payload[field.key],
                        })),
                    ...(payload.previousImage
                        ? [{
                            role: 'previous',
                            source: payload.previousImage,
                        }]
                        : []),
                ],
            });
        } catch {
            showArchiveNotice('生成会继续，但本次任务无法保存到浏览器');
            return null;
        }
    }

    function rememberActiveTask(taskId) {
        try {
            window.sessionStorage.setItem(activeTaskKey, taskId);
        } catch {
            // IndexedDB polling still works in the current page.
        }
    }

    function clearActiveTask(taskId) {
        try {
            if (window.sessionStorage.getItem(activeTaskKey) === taskId) {
                window.sessionStorage.removeItem(activeTaskKey);
            }
        } catch {
            // Storage can be unavailable in strict privacy modes.
        }
    }

    async function dispatchBackgroundGeneration(localTask, payload) {
        if (!localTask) {
            return false;
        }
        rememberActiveTask(localTask.id);
        const registration = await workerRegistration;
        const worker = registration?.active
            || navigator.serviceWorker.controller;
        if (!worker) {
            return false;
        }
        return dispatchGenerationMessage(
            worker,
            navigator.serviceWorker,
            createGenerationMessage(
                localTask.id,
                payload,
                apiBase,
                window.location.origin,
            ),
        );
    }

    function taskFailure(task) {
        const error = new Error(
            task.errorMessage || mapErrorCode(task.errorCode),
        );
        error.code = task.errorCode || 'PROVIDER_REQUEST_FAILED';
        return error;
    }

    async function runGeneration(localTask, payload) {
        if (await dispatchBackgroundGeneration(localTask, payload)) {
            showArchiveNotice('后台生成中，刷新页面后可继续查看进度');
            const task = await pollLocalTask(localTask.id, {
                history: localHistory,
            });
            clearActiveTask(localTask.id);
            if (task.status === 'failed') {
                throw taskFailure(task);
            }
            return {
                success: true,
                imageUrl: task.result?.imageUrl || '',
                conversationId: task.result?.conversationId || '',
                assistantMessage: task.result?.assistantMessage || '',
                archiveWarning: null,
            };
        }
        if (localTask) {
            clearActiveTask(localTask.id);
        }

        const response = await apiClient.apiFetch(
            '/api/product-swap/generate',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            },
            { apiBase },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !data.imageUrl) {
            const error = new Error(
                data?.error?.message
                || mapErrorCode(data?.error?.code),
            );
            error.code = data?.error?.code || 'PROVIDER_REQUEST_FAILED';
            throw error;
        }
        if (localTask) {
            await localHistory.completeTask(localTask.id, {
                imageUrl: data.imageUrl,
                conversationId: data.conversationId || '',
                assistantMessage: data.assistantMessage || '',
            });
        }
        return data;
    }

    function setGenerating(value) {
        state.isGenerating = value;
        generateButton.disabled = value;
        generateButton.classList.toggle(
            'is-loading',
            value,
        );
        generateButton.textContent = value
            ? '生成中…'
            : `${activeTemplate?.outputLabel || '生成 1 张场景图'}（消耗 ${
                activeTemplate?.creditCost ?? 3
            } 豆额度）`;

        for (const control of templateFields.querySelectorAll(
            'input, button, textarea',
        )) {
            control.disabled = value;
        }
        for (const section of Object.values(fieldSections)) {
            section.classList.toggle('is-disabled', value);
        }
    }

    function setRefining(value) {
        state.isRefining = value;
        refineInput.disabled = value;
        refineButton.disabled = value;
        refineButton.textContent = value
            ? '正在生成新版本…'
            : '发送并生成新版本';
    }

    function renderMessages() {
        chatTimeline.replaceChildren();

        for (const message of state.messages.slice(-6)) {
            const item = document.createElement('p');
            item.className = `chat-message ${message.role}`;
            item.textContent = message.content;
            chatTimeline.appendChild(item);
        }

        chatTimeline.scrollTop = chatTimeline.scrollHeight;
    }

    function renderImageField(field) {
        const section = fieldSections[field.key];
        const box = section.querySelector('.upload-box');
        const removeButton =
            section.querySelector('.remove-image');
        const value = state.values[field.key];

        section.classList.toggle(
            'has-preview',
            Boolean(value),
        );
        removeButton.hidden = !value;
        box.replaceChildren();

        if (value) {
            const preview = document.createElement('img');
            preview.src = value;
            preview.alt = `${field.label}预览`;
            box.appendChild(preview);
        } else {
            const hint = document.createElement('span');
            hint.textContent = '点击或拖拽上传';
            box.appendChild(hint);
        }
    }

    async function sourceForAsset(asset) {
        if (asset?.blob) {
            return readFileAsDataUrl(asset.blob);
        }
        return asset?.sourceUrl || '';
    }

    function renderNonImageField(field) {
        const section = fieldSections[field.key];
        if (field.type === 'choice') {
            const buttons = Array.from(
                section.querySelectorAll('[data-value]'),
            );
            for (const [index, button] of buttons.entries()) {
                const selected =
                    button.dataset.value === state.values[field.key];
                button.setAttribute('aria-checked', String(selected));
                button.setAttribute('aria-pressed', String(selected));
                button.tabIndex = CreatorForm.choiceTabIndex(
                    button.dataset.value,
                    state.values[field.key],
                    index,
                );
            }
        } else if (field.type === 'boolean') {
            const button = section.querySelector('[role="switch"]');
            const checked = Boolean(state.values[field.key]);
            button.setAttribute('aria-checked', String(checked));
            button.firstElementChild.textContent =
                checked ? '已开启' : '已关闭';
        } else if (field.type === 'text') {
            section.querySelector('textarea').value =
                state.values[field.key] || '';
        }
    }

    async function hydrateTaskState(task) {
        for (const field of fields) {
            if (field.type === 'image') {
                const role = field.role || field.key;
                const asset = task.assets?.find(
                    (item) => item.role === role,
                );
                state.values[field.key] = await sourceForAsset(asset);
                renderImageField(field);
            } else if (task.input?.[field.key] !== undefined) {
                state.values[field.key] = task.input[field.key];
                renderNonImageField(field);
            }
        }
        lastInitialPayload = CreatorForm.buildTemplatePayload(
            activeTemplate,
            state.values,
            task.input?.generatedAt || new Date().toISOString(),
        );
        const inputConversationId = task.input?.conversationId || '';
        const inputMessages = Array.isArray(task.input?.messages)
            ? task.input.messages.map((message) => ({ ...message }))
            : [];

        const previous = task.assets?.find((item) => item.role === 'previous');
        const previousSource = previous
            ? await sourceForAsset(previous)
            : '';
        const baseVersionId = String(task.input?.baseVersionId || '');
        let parentVersion = null;
        if (baseVersionId || previousSource) {
            parentVersion = VersionHistory.hydrateVersion(versions, {
                ...(baseVersionId ? { id: baseVersionId } : {}),
                imageUrl: previousSource,
                instruction: '恢复的基础版本',
                conversationId: inputConversationId,
                messages: inputMessages,
            });
        }

        state.conversationId = inputConversationId;
        state.messages = inputMessages;
        if (previous) {
            state.result = previousSource;
        }
        if (task.status === 'completed' && task.result?.imageUrl) {
            state.result = task.result.imageUrl;
            state.conversationId = task.result.conversationId
                || state.conversationId;
            const requirements = String(
                state.values.requirements || '',
            ).trim();
            if (requirements) {
                state.messages.push({
                    role: 'user',
                    content: requirements,
                });
            }
            state.messages.push({
                role: 'assistant',
                content: task.result.assistantMessage || '已完成本次生成。',
            });
            state.messages = state.messages.slice(-6);
            const childVersion = VersionHistory.hydrateVersion(versions, {
                imageUrl: state.result,
                instruction: task.input?.isRefinement
                    ? String(task.input.requirements || '继续修改')
                    : '首次生成',
                conversationId: state.conversationId,
                messages: state.messages,
                baseVersionId: parentVersion?.id || null,
                sourceTaskId: task.id,
            });
            selectedVersionIndex = versions.list().findIndex(
                (version) => version.id === childVersion.id,
            );
            showVersion(childVersion);
        } else if (parentVersion && previousSource) {
            selectedVersionIndex = versions.list().findIndex(
                (version) => version.id === parentVersion.id,
            );
            showVersion(parentVersion);
        }
        renderMessages();
    }

    async function restoreActiveTask() {
        setGenerating(true);
        setRefining(true);
        let rememberedTask = null;
        try {
            const rememberedId = window.sessionStorage.getItem(activeTaskKey);
            if (rememberedId) {
                rememberedTask = await localHistory.getTask(rememberedId);
            }
            if (
                rememberedTask
                && !taskMatchesTemplate(rememberedTask, activeTemplate)
            ) {
                window.sessionStorage.removeItem(activeTaskKey);
                rememberedTask = null;
            }
        } catch {
            rememberedTask = null;
        }
        const processingTaskCandidate = await localHistory
            .latestProcessingTask(activeTemplate?.taskType || 'product_swap');
        const processingTask = taskMatchesTemplate(
            processingTaskCandidate,
            activeTemplate,
        ) ? processingTaskCandidate : null;
        let task = rememberedTask?.status === 'processing'
            ? rememberedTask
            : (processingTask || rememberedTask);
        if (!task) {
            setGenerating(false);
            setRefining(false);
            return;
        }

        rememberActiveTask(task.id);
        await hydrateTaskState(task);
        const isRefinement = Boolean(task.input?.isRefinement);
        if (task.status === 'processing') {
            if (!task.dispatchedAt) {
                const restoredInitialPayload =
                    CreatorForm.buildTemplatePayload(
                        activeTemplate,
                        state.values,
                        task.input?.generatedAt || new Date().toISOString(),
                    );
                const payload = isRefinement
                    ? buildRefinePayload(
                        restoredInitialPayload,
                        {
                            ...state,
                            result: versions.current()?.imageUrl || '',
                        },
                        state.values.requirements,
                    )
                    : restoredInitialPayload;
                const dispatched = await dispatchBackgroundGeneration(
                    task,
                    payload,
                );
                if (!dispatched) {
                    await localHistory.failTask(
                        task.id,
                        'BACKGROUND_UNAVAILABLE',
                        '后台生成不可用，请重新提交',
                    );
                }
            }
            if (isRefinement) {
                setRefining(true);
                setGenerating(false);
            } else {
                setGenerating(true);
                setRefining(false);
            }
            showArchiveNotice('正在恢复生成进度，刷新页面不会重复提交');
            task = await pollLocalTask(task.id, { history: localHistory });
            setGenerating(false);
            setRefining(false);
            await hydrateTaskState(task);
        }
        clearActiveTask(task.id);
        if (task.status === 'failed') {
            showError(taskFailure(task).message);
        } else {
            showArchiveNotice('');
        }
        setGenerating(false);
        setRefining(false);
    }

    async function acceptFile(field, file) {
        const input = fieldSections[field.key]
            .querySelector('input[type="file"]');
        input.value = '';
        const operation = uploadOperations.begin(field.key);
        if (!file || state.isGenerating) {
            uploadOperations.complete(operation);
            return;
        }

        const validation = validateClientFileMeta(file, field.accept || [
            ...CLIENT_IMAGE_TYPES,
        ]);
        if (validation) {
            uploadOperations.complete(operation);
            if (uploadOperations.isLatestFeedback(operation)) {
                showError(validation.message);
            }
            return;
        }

        try {
            const source = await readFileAsDataUrl(file);
            if (!uploadOperations.isFieldCurrent(
                field.key,
                operation,
            )) return;
            const dimensions = await readImageDimensions(source);
            if (!uploadOperations.isFieldCurrent(
                field.key,
                operation,
            )) return;
            const dimensionError = CreatorForm.validateImageDimensions(
                dimensions.width,
                dimensions.height,
            );
            if (dimensionError) {
                if (uploadOperations.isLatestFeedback(operation)) {
                    showError(dimensionError.message);
                }
                return;
            }
            state.values[field.key] = source;
            renderImageField(field);
            if (uploadOperations.isLatestFeedback(operation)) {
                showError('');
            }
        } catch (error) {
            if (uploadOperations.isLatestFeedback(operation)) {
                showError(error.message || '图片读取失败');
            }
        } finally {
            uploadOperations.complete(operation);
        }
    }

    function focusField(fieldKey) {
        const section = fieldSections[fieldKey];
        section?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
        section?.querySelector(
            '.upload-box, textarea, button',
        )?.focus();
    }

    for (const field of fields) {
        const section = fieldSections[field.key];
        if (field.type === 'image') {
            const input = section.querySelector('input[type="file"]');
            const box = section.querySelector('.upload-box');
            input.addEventListener('change', () => {
                acceptFile(field, input.files[0]);
            });
            box.addEventListener('click', () => input.click());
            box.addEventListener('dragover', (event) => {
                event.preventDefault();
                box.classList.add('dragover');
            });
            box.addEventListener('dragleave', () => {
                box.classList.remove('dragover');
            });
            box.addEventListener('drop', (event) => {
                event.preventDefault();
                box.classList.remove('dragover');
                acceptFile(field, event.dataTransfer.files[0]);
            });
            section.querySelector('.remove-image')
                .addEventListener('click', () => {
                    uploadOperations.cancel(field.key);
                    state.values[field.key] = '';
                    input.value = '';
                    renderImageField(field);
                    showError('');
                });
            renderImageField(field);
        } else if (field.type === 'choice') {
            const buttons = Array.from(
                section.querySelectorAll('[data-value]'),
            );
            for (const button of buttons) {
                button.addEventListener('click', () => {
                    state.values[field.key] = button.dataset.value;
                    renderNonImageField(field);
                });
                button.addEventListener('keydown', (event) => {
                    const current = buttons.indexOf(button);
                    const next = CreatorForm.nextChoiceIndex(
                        current,
                        buttons.length,
                        event.key,
                    );
                    if (next === current) return;
                    event.preventDefault();
                    state.values[field.key] =
                        buttons[next].dataset.value;
                    renderNonImageField(field);
                    buttons[next].focus();
                });
            }
            renderNonImageField(field);
        } else if (field.type === 'boolean') {
            section.querySelector('[role="switch"]')
                .addEventListener('click', () => {
                    state.values[field.key] =
                        !state.values[field.key];
                    renderNonImageField(field);
                });
            renderNonImageField(field);
        } else if (field.type === 'text') {
            section.querySelector('textarea')
                .addEventListener('input', (event) => {
                    state.values[field.key] = event.target.value;
                });
            renderNonImageField(field);
        }
    }

    async function submitGeneration() {
        if (state.isGenerating) {
            return;
        }
        uploadOperations.claimFeedback('form-validation');
        if (uploadOperations.hasPending()) {
            showError('图片处理中，请稍候');
            return;
        }

        const validation = CreatorForm.validateValues(
            activeTemplate,
            state.values,
        );
        if (validation) {
            showError(validation.message);
            focusField(validation.field);
            return;
        }

        showError('');
        showArchiveNotice('');
        setGenerating(true);
        let localTask = null;

        try {
            const payload = CreatorForm.buildTemplatePayload(
                activeTemplate,
                state.values,
                new Date().toISOString(),
            );
            lastInitialPayload = payload;
            localTask = await startLocalTask(payload);
            const data = await runGeneration(localTask, payload);

            state.conversationId = data.conversationId || '';
            state.messages = [];
            const requirements = String(
                state.values.requirements || '',
            ).trim();
            if (requirements) {
                state.messages.push({
                    role: 'user',
                    content: requirements,
                });
            }
            state.messages.push({
                role: 'assistant',
                content: data.assistantMessage
                    || '已完成第一版，可以继续告诉我需要调整的地方。',
            });
            addVersion({
                imageUrl: data.imageUrl,
                instruction: '首次生成',
                conversationId: state.conversationId,
                messages: state.messages,
                sourceTaskId: localTask?.id || null,
            });
            showArchiveNotice(data.archiveWarning || '');
            renderMessages();
            resultSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        } catch (error) {
            if (localTask) {
                await localHistory.failTask(
                    localTask.id,
                    error.code,
                    error.message,
                ).catch(() => undefined);
            }
            showError(
                error.message || mapErrorCode(error.code),
            );
        } finally {
            setGenerating(false);
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitGeneration();
    });

    renderQuickPrompts();

    refineForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (state.isRefining || state.isGenerating) {
            return;
        }
        uploadOperations.claimFeedback('refine-validation');
        if (uploadOperations.hasPending()) {
            showError('图片处理中，请稍候');
            return;
        }

        const correction = refineInput.value.trim();
        if (!correction) {
            showError('请输入这次要修改的内容');
            refineInput.focus();
            return;
        }
        const baseVersion = versions.current();
        if (!baseVersion) {
            showError('请先生成一个版本');
            return;
        }

        showError('');
        showArchiveNotice('');
        setRefining(true);
        let localTask = null;

        try {
            const payload = buildRefinePayload(
                lastInitialPayload || CreatorForm.buildTemplatePayload(
                    activeTemplate,
                    state.values,
                    new Date().toISOString(),
                ),
                {
                    result: baseVersion.imageUrl,
                    conversationId: baseVersion.conversationId,
                    messages: baseVersion.messages,
                },
                correction,
            );
            localTask = await startLocalTask(payload, true, {
                baseVersionId: baseVersion.id,
            });
            const data = await runGeneration(localTask, payload);

            state.messages = [...baseVersion.messages, {
                role: 'user',
                content: correction,
            }, {
                role: 'assistant',
                content: data.assistantMessage
                    || '已完成新一版修正。',
            }].slice(-6);
            state.conversationId = data.conversationId
                || baseVersion.conversationId;
            addVersion({
                imageUrl: data.imageUrl,
                instruction: correction,
                baseVersionId: baseVersion.id,
                conversationId: state.conversationId,
                messages: state.messages,
                sourceTaskId: localTask?.id || null,
            });
            showArchiveNotice(data.archiveWarning || '');
            refineInput.value = '';
            renderMessages();
            resultImage.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        } catch (error) {
            if (localTask) {
                await localHistory.failTask(
                    localTask.id,
                    error.code,
                    error.message,
                ).catch(() => undefined);
            }
            showError(error.message || mapErrorCode(error.code));
        } finally {
            setRefining(false);
        }
    });

    document
        .getElementById('regenerateButton')
        .addEventListener('click', submitGeneration);

    async function downloadCurrentVersion() {
        const current = versions.current();
        if (!current) return;

        let objectUrl = '';
        let revokeScheduled = false;
        let abortNetworkDownload = () => undefined;
        try {
            const request = VersionHistory.createDownloadRequest(
                current.imageUrl,
                window.location.origin,
            );
            let blob;
            let extension = request.extension || 'png';
            if (request.kind === 'data') {
                const bytes = request.bytes;
                if (request.mimeType === 'image/jpeg') {
                    VersionHistory.validateJpegBytes(bytes);
                } else {
                    VersionHistory.validatePngBytes(bytes);
                }
                blob = new Blob([bytes], { type: request.mimeType });
                await VersionHistory.ensureBrowserDecodablePng(blob);
            } else {
                const networkPng = await VersionHistory.fetchValidatedPng(
                    request,
                );
                blob = networkPng.blob;
                abortNetworkDownload = networkPng.abort;
            }
            objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download =
                `${activeTemplate.id}-${Date.now()}.${extension}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => {
                URL.revokeObjectURL(objectUrl);
            }, 0);
            revokeScheduled = true;
        } catch {
            abortNetworkDownload();
            showError('下载失败，请保留当前页面后重试');
        } finally {
            if (objectUrl && !revokeScheduled) {
                URL.revokeObjectURL(objectUrl);
            }
        }
    }

    document
        .getElementById('downloadButton')
        .addEventListener('click', downloadCurrentVersion);

    document
        .getElementById('backButton')
        .addEventListener('click', () => {
            window.history.back();
        });

    restoreActiveTask().catch(() => {
        showError('恢复生成进度失败，请到所有任务中查看记录');
        setGenerating(false);
        setRefining(false);
    });
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', boot);
}

if (typeof module !== 'undefined') {
    module.exports = {
        appendQuickPrompt,
        resolveApiBase,
        activeTaskStorageKey,
        taskMatchesTemplate,
        validateClientFileMeta,
        buildGeneratePayload,
        buildRefinePayload,
        historyInputFromPayload,
        createGenerationMessage,
        dispatchGenerationMessage,
        pollLocalTask,
        mapErrorCode,
    };
}
