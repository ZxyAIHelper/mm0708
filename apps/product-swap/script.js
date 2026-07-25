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

function validateClientFileMeta(file) {
    if (!CLIENT_IMAGE_TYPES.has(file.type)) {
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

function buildRefinePayload(state, requirements) {
    return {
        targetImage: state.target || '',
        productImage: state.product || '',
        sceneImage: state.scene || '',
        previousImage: state.result || '',
        conversationId: state.conversationId || '',
        messages: Array.isArray(state.messages)
            ? state.messages.slice(-6)
            : [],
        requirements: String(requirements || '').trim(),
    };
}

function historyInputFromPayload(payload, isRefinement = false) {
    return {
        requirements: String(payload?.requirements || '').trim(),
        isRefinement: Boolean(isRefinement),
        conversationId: String(payload?.conversationId || ''),
        messages: Array.isArray(payload?.messages)
            ? payload.messages.map((message) => ({
                role: String(message?.role || ''),
                content: String(message?.content || ''),
            }))
            : [],
    };
}

const ACTIVE_TASK_KEY = 'product_swap_active_task_id';

function createGenerationMessage(taskId, payload, apiBase, origin) {
    const base = apiBase || origin;
    return {
        type: 'product-swap:start',
        version: 1,
        taskId,
        apiUrl: new URL(
            `${String(base).replace(/\/$/, '')}/api/product-swap/generate`,
            origin,
        ).toString(),
        payload,
    };
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

function boot() {
    const activeTemplate = window.CreatorMeta.resolveCreatorTemplate(window.location.search);
    const state = {
        target: '',
        product: '',
        scene: '',
        requirements: '',
        result: '',
        conversationId: '',
        messages: [],
        isGenerating: false,
        isRefining: false,
    };
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
    const requirementsInput =
        document.getElementById('requirementsInput');
    const refineForm = document.getElementById('refineForm');
    const refineInput = document.getElementById('refineInput');
    const refineButton = document.getElementById('refineButton');
    const chatTimeline = document.getElementById('chatTimeline');
    const slots = {
        target: document.querySelector(
            '[data-slot="target"]',
        ),
        product: document.querySelector(
            '[data-slot="product"]',
        ),
        scene: document.querySelector(
            '[data-slot="scene"]',
        ),
    };
    const inputs = {
        target: document.getElementById('targetInput'),
        product: document.getElementById('productInput'),
        scene: document.getElementById('sceneInput'),
    };

    function showError(message) {
        formError.textContent = message;
        formError.hidden = !message;
    }

    function showArchiveNotice(message) {
        archiveNotice.textContent = message;
        archiveNotice.hidden = !message;
    }

    Promise.all([
        localHistory.cleanupExpiredAssets(),
        localHistory.recoverInterruptedTasks(),
    ]).catch(() => undefined);

    async function startLocalTask(payload, isRefinement = false) {
        try {
            return await localHistory.startTask({
                taskType: activeTemplate?.taskType || 'product_swap',
                title: activeTemplate?.name || '爆款场景同款图',
                input: {
                    ...historyInputFromPayload(payload, isRefinement),
                    templateId: activeTemplate?.id || 'product-swap',
                },
                images: [
                    { role: 'target', source: payload.targetImage },
                    { role: 'product', source: payload.productImage },
                    { role: 'scene', source: payload.sceneImage },
                    { role: 'previous', source: payload.previousImage },
                ],
            });
        } catch {
            showArchiveNotice('生成会继续，但本次任务无法保存到浏览器');
            return null;
        }
    }

    function rememberActiveTask(taskId) {
        try {
            window.sessionStorage.setItem(ACTIVE_TASK_KEY, taskId);
        } catch {
            // IndexedDB polling still works in the current page.
        }
    }

    function clearActiveTask(taskId) {
        try {
            if (window.sessionStorage.getItem(ACTIVE_TASK_KEY) === taskId) {
                window.sessionStorage.removeItem(ACTIVE_TASK_KEY);
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
        if (!registration?.active) {
            return false;
        }
        registration.active.postMessage(createGenerationMessage(
            localTask.id,
            payload,
            apiBase,
            window.location.origin,
        ));
        return true;
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

        for (const input of Object.values(inputs)) {
            input.disabled = value;
        }

        for (const slot of Object.values(slots)) {
            slot.classList.toggle('is-disabled', value);
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

    function renderSlot(name) {
        const slot = slots[name];
        const box = slot.querySelector('.upload-box');
        const removeButton =
            slot.querySelector('.remove-image');
        const value = state[name];

        slot.classList.toggle(
            'has-preview',
            Boolean(value),
        );
        removeButton.hidden = !value;
        box.replaceChildren();

        if (value) {
            const preview = document.createElement('img');
            preview.src = value;
            preview.alt = `${name} 图片预览`;
            box.appendChild(preview);
        } else {
            const hint = document.createElement('span');
            hint.textContent = '点击上传';
            box.appendChild(hint);
        }
    }

    async function sourceForAsset(asset) {
        if (asset?.blob) {
            return readFileAsDataUrl(asset.blob);
        }
        return asset?.sourceUrl || '';
    }

    async function hydrateTaskState(task) {
        for (const role of ['target', 'product', 'scene']) {
            const asset = task.assets?.find((item) => item.role === role);
            state[role] = await sourceForAsset(asset);
            renderSlot(role);
        }
        state.requirements = task.input?.requirements || '';
        requirementsInput.value = state.requirements;
        state.conversationId = task.input?.conversationId || '';
        state.messages = Array.isArray(task.input?.messages)
            ? task.input.messages.map((message) => ({ ...message }))
            : [];

        const previous = task.assets?.find((item) => item.role === 'previous');
        if (previous) {
            state.result = await sourceForAsset(previous);
        }
        if (task.status === 'completed' && task.result?.imageUrl) {
            state.result = task.result.imageUrl;
            state.conversationId = task.result.conversationId
                || state.conversationId;
            if (state.requirements.trim()) {
                state.messages.push({
                    role: 'user',
                    content: state.requirements.trim(),
                });
            }
            state.messages.push({
                role: 'assistant',
                content: task.result.assistantMessage || '已完成本次生成。',
            });
            state.messages = state.messages.slice(-6);
        }
        if (state.result) {
            resultImage.src = state.result;
            resultSection.hidden = false;
        }
        renderMessages();
    }

    async function restoreActiveTask() {
        setGenerating(true);
        setRefining(true);
        let rememberedTask = null;
        try {
            const rememberedId = window.sessionStorage.getItem(ACTIVE_TASK_KEY);
            if (rememberedId) {
                rememberedTask = await localHistory.getTask(rememberedId);
            }
        } catch {
            rememberedTask = null;
        }
        const processingTask = await localHistory
            .latestProcessingTask('product_swap');
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
                const payload = isRefinement
                    ? buildRefinePayload(state, state.requirements)
                    : buildGeneratePayload(state);
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

    async function acceptFile(name, file) {
        if (!file || state.isGenerating) {
            return;
        }

        const validation = validateClientFileMeta(file);
        if (validation) {
            showError(validation.message);
            return;
        }

        try {
            state[name] = await readFileAsDataUrl(file);
            inputs[name].value = '';
            renderSlot(name);
            showError('');
        } catch (error) {
            showError(error.message || '图片读取失败');
        }
    }

    for (const [name, input] of Object.entries(inputs)) {
        input.addEventListener('change', () => {
            acceptFile(name, input.files[0]);
        });

        const slot = slots[name];
        const box = slot.querySelector('.upload-box');

        box.addEventListener('click', () => {
            input.click();
        });
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
            acceptFile(
                name,
                event.dataTransfer.files[0],
            );
        });

        slot.querySelector('.remove-image')
            .addEventListener('click', () => {
                state[name] = '';
                input.value = '';
                renderSlot(name);
            });

        renderSlot(name);
    }

    async function submitGeneration() {
        if (state.isGenerating) {
            return;
        }

        state.requirements = requirementsInput.value;

        if (!state.target) {
            showError('请上传目标图');
            slots.target.querySelector('.upload-box').focus();
            return;
        }

        if (state.requirements.trim().length > 200) {
            showError('额外要求不能超过 200 字');
            requirementsInput.focus();
            return;
        }

        showError('');
        showArchiveNotice('');
        setGenerating(true);
        let localTask = null;

        try {
            const payload = buildGeneratePayload(state);
            localTask = await startLocalTask(payload);
            const data = await runGeneration(localTask, payload);

            state.result = data.imageUrl;
            state.conversationId = data.conversationId || '';
            state.messages = [];
            if (state.requirements.trim()) {
                state.messages.push({
                    role: 'user',
                    content: state.requirements.trim(),
                });
            }
            state.messages.push({
                role: 'assistant',
                content: data.assistantMessage
                    || '已完成第一版，可以继续告诉我需要调整的地方。',
            });
            resultImage.src = state.result;
            resultSection.hidden = false;
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

    refineForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (state.isRefining || state.isGenerating) {
            return;
        }

        const correction = refineInput.value.trim();
        if (!correction) {
            showError('请输入这次要修改的内容');
            refineInput.focus();
            return;
        }

        showError('');
        showArchiveNotice('');
        setRefining(true);
        let localTask = null;

        try {
            const payload = buildRefinePayload(state, correction);
            localTask = await startLocalTask(payload, true);
            const data = await runGeneration(localTask, payload);

            state.messages.push({
                role: 'user',
                content: correction,
            });
            state.messages.push({
                role: 'assistant',
                content: data.assistantMessage
                    || '已完成新一版修正。',
            });
            state.messages = state.messages.slice(-6);
            state.result = data.imageUrl;
            state.conversationId = data.conversationId
                || state.conversationId;
            resultImage.src = state.result;
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

    document
        .getElementById('downloadButton')
        .addEventListener('click', () => {
            if (!state.result) {
                return;
            }

            const link = document.createElement('a');
            link.href = state.result;
            link.download = `product-swap-${Date.now()}.png`;
            link.click();
        });

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
        resolveApiBase,
        validateClientFileMeta,
        buildGeneratePayload,
        buildRefinePayload,
        historyInputFromPayload,
        createGenerationMessage,
        pollLocalTask,
        mapErrorCode,
    };
}
