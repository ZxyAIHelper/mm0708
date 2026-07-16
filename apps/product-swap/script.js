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
    const state = {
        target: '',
        product: '',
        scene: '',
        requirements: '',
        result: '',
        isGenerating: false,
    };
    const apiBase = resolveApiBase(
        window.API_BASE_URL || '',
        window.location.hostname,
    );
    const form = document.getElementById('swapForm');
    const generateButton =
        document.getElementById('generateButton');
    const formError = document.getElementById('formError');
    const resultSection =
        document.getElementById('resultSection');
    const resultImage =
        document.getElementById('resultImage');
    const requirementsInput =
        document.getElementById('requirementsInput');
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

    function setGenerating(value) {
        state.isGenerating = value;
        generateButton.disabled = value;
        generateButton.classList.toggle(
            'is-loading',
            value,
        );
        generateButton.textContent = value
            ? '生成中…'
            : '生成（消耗 3 豆额度）';

        for (const input of Object.values(inputs)) {
            input.disabled = value;
        }

        for (const slot of Object.values(slots)) {
            slot.classList.toggle('is-disabled', value);
        }
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
        setGenerating(true);

        try {
            const response = await fetch(
                `${apiBase}/api/product-swap/generate`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(
                        buildGeneratePayload(state),
                    ),
                },
            );
            const data = await response
                .json()
                .catch(() => ({}));

            if (
                !response.ok
                || !data.success
                || !data.imageUrl
            ) {
                const code =
                    data?.error?.code
                    || 'PROVIDER_REQUEST_FAILED';
                const error = new Error(
                    data?.error?.message
                    || mapErrorCode(code),
                );
                error.code = code;
                throw error;
            }

            state.result = data.imageUrl;
            resultImage.src = state.result;
            resultSection.hidden = false;
            resultSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        } catch (error) {
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
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', boot);
}

if (typeof module !== 'undefined') {
    module.exports = {
        resolveApiBase,
        validateClientFileMeta,
        buildGeneratePayload,
        mapErrorCode,
    };
}
