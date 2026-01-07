// 默认提示词配置
const defaultPrompts = {
    cartoon: [
        "将图片转换为可爱的卡通风格表情包，色彩鲜艳，表情生动",
        "卡通化处理，添加有趣的表情元素，适合社交媒体分享",
        "Q版卡通风格，圆润可爱，表情夸张"
    ],
    "sci-fi": [
        "将图片转换为未来科幻风格表情包，霓虹效果，赛博朋克风",
        "科幻化处理，添加科技感元素，如全息效果、机械纹理",
        "未来主义风格，高对比度，霓虹色彩，科技感十足"
    ]
};

// 全局变量
let selectedMode = 'cartoon';
let uploadedImage = null;
let generatedImage = null;

// 显示消息
function showMessage(message, type) {
    const container = document.getElementById('messageContainer');
    container.innerHTML = `<div class="${type}-message">${message}</div>`;

    // 3秒后自动隐藏
    setTimeout(() => {
        container.innerHTML = '';
    }, 3000);
}

// 更新提示词
function updatePrompt() {
    const prompts = defaultPrompts[selectedMode];
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    document.getElementById('promptText').textContent = randomPrompt;
}

// 图片上传处理
function handleImageUpload(file) {
    if (!file) return;

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
        showMessage('请上传图片文件！', 'error');
        return;
    }

    // 检查文件大小
    if (file.size > 5 * 1024 * 1024) {
        showMessage('图片大小不能超过 5MB！', 'error');
        return;
    }

    // 读取图片
    const reader = new FileReader();
    reader.onload = function (e) {
        uploadedImage = e.target.result;
        const previewImage = document.getElementById('previewImage');
        previewImage.src = uploadedImage;
        previewImage.style.display = 'block';
        showMessage('图片上传成功！', 'success');
    };
    reader.readAsDataURL(file);
}

// 生成表情包
async function generateMeme() {
    if (!uploadedImage) {
        showMessage('请先上传图片！', 'error');
        return;
    }

    // 显示加载状态
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('resultImage').style.display = 'none';

    // 获取当前设置
    const api = document.getElementById('apiSelect').value;
    const customDescription = document.getElementById('textDescription').value;
    const prompt = document.getElementById('promptText').textContent;
    const fullPrompt = customDescription ? `${prompt}，${customDescription}` : prompt;

    // 更新生成参数
    document.getElementById('generateParams').textContent = `API: ${api} | 模式: ${selectedMode === 'cartoon' ? '卡通风格' : '科幻风格'} | 提示词: ${fullPrompt}`;

    if (api === 'doubao') {
        try {
            const response = await fetch('/api/generate-meme', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: uploadedImage,
                    prompt: fullPrompt,
                    model: selectedMode
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('API Error Details:', data);
                throw new Error(data.error || '生成失败');
            }

            // 假设返回的数据中包含已生成的图片 URL 或 Base64
            // 具体的返回格式需要对接豆包 API 确认，这里先按通用格式处理
            if (data.data && data.data[0] && data.data[0].url) {
                generatedImage = data.data[0].url;
            } else if (data.image) {
                generatedImage = data.image; // 或者 data.url 等
            } else {
                // 容错处理：如果 API 没返回图片，模拟一个
                throw new Error('API 未返回有效的图片数据');
            }

            const resultImage = document.getElementById('resultImage');
            resultImage.src = generatedImage;
            resultImage.style.display = 'block';
            document.getElementById('loading').style.display = 'none';
            showMessage('表情包生成成功！', 'success');

        } catch (error) {
            console.error('Generation Tool Error:', error);
            document.getElementById('loading').style.display = 'none';
            showMessage('生成失败: ' + error.message, 'error');
        }
    } else {
        // NanoBanana 或其他 API 的模拟逻辑 (保持原有逻辑)
        setTimeout(() => {
            const canvas = document.createElement('canvas');
            const img = new Image();
            img.onload = function () {
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                if (selectedMode === 'cartoon') {
                    ctx.globalCompositeOperation = 'overlay';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                } else if (selectedMode === 'sci-fi') {
                    ctx.globalCompositeOperation = 'overlay';
                    ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.strokeStyle = '#00ffff';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
                }

                ctx.globalCompositeOperation = 'source-over';
                generatedImage = canvas.toDataURL('image/png');
                const resultImage = document.getElementById('resultImage');
                resultImage.src = generatedImage;
                resultImage.style.display = 'block';
                document.getElementById('loading').style.display = 'none';
                showMessage('表情包生成成功！', 'success');
            };
            img.src = uploadedImage;
        }, 2000);
    }
}

// 下载表情包
function downloadMeme() {
    if (!generatedImage) {
        showMessage('请先生成表情包！', 'error');
        return;
    }

    try {
        // 创建下载链接
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `meme-${Date.now()}.png`;
        link.click();

        showMessage('表情包已下载！', 'success');
    } catch (error) {
        showMessage('下载失败: ' + error.message, 'error');
    }
}

// 清空所有内容
function clearAll() {
    uploadedImage = null;
    generatedImage = null;

    // 重置界面
    document.getElementById('previewImage').style.display = 'none';
    document.getElementById('resultImage').style.display = 'none';
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('fileInput').value = '';
    document.getElementById('textDescription').value = '';
    document.getElementById('generateParams').textContent = '请上传图片并点击生成按钮';

    // 重置模式
    document.querySelectorAll('.mode-option').forEach(option => {
        option.classList.remove('active');
    });
    document.querySelector('[data-mode="cartoon"]').classList.add('active');
    selectedMode = 'cartoon';
    updatePrompt();

    showMessage('已清空所有内容！', 'success');
}

// 初始化事件监听器
document.addEventListener('DOMContentLoaded', function () {
    // 图片上传事件
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // 点击上传
    uploadArea.addEventListener('click', () => fileInput.click());

    // 文件选择
    fileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0]));

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleImageUpload(e.dataTransfer.files[0]);
    });

    // 模式选择事件
    document.querySelectorAll('.mode-option').forEach(option => {
        option.addEventListener('click', () => {
            // 更新选中状态
            document.querySelectorAll('.mode-option').forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            // 更新当前模式
            selectedMode = option.dataset.mode;
            updatePrompt();
        });
    });

    // 按钮事件
    document.getElementById('generateBtn').addEventListener('click', generateMeme);
    document.getElementById('downloadBtn').addEventListener('click', downloadMeme);
    document.getElementById('clearBtn').addEventListener('click', clearAll);

    // 初始更新提示词
    updatePrompt();
});