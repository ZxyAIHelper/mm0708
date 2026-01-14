// 表情包生成系统提示词(角色-技能-限制)
const memeConstraints = `【角色】你是一个表情包生成器。【技能】生成适合社交聊天使用的表情包图片,表情生动明确,适合快速传达情绪。【限制】必须生成单张图片严禁多格漫画,必须只有一个主体角色严禁多个人物,必须居中构图背景简洁干净,严禁复杂场景严禁连续分镜,严禁文字气泡严禁对话框,画面比例1:1正方形。【内容】`;

// 表情包风格关键词库
const styleKeywords = {
    qVersion: {
        name: 'Q版卡通',
        icon: '🎨',
        keywords: 'Q版表情包,大头小身体,圆润可爱,夸张表情'
    },
    emoji: {
        name: 'Emoji风格',
        icon: '😀',
        keywords: 'emoji表情包,扁平化设计,简洁明快,表情夸张明显'
    },
    sketch: {
        name: '简笔画',
        icon: '✏️',
        keywords: '简笔画表情包,线条简单,黑白或简单配色,卡通化'
    },
    anime: {
        name: '动漫风',
        icon: '🌸',
        keywords: '日系动漫表情包,大眼睛,漫画感,二次元'
    },
    pixel: {
        name: '像素风',
        icon: '🎮',
        keywords: '像素风格表情包,8bit复古,马赛克质感,怀旧游戏风'
    },
    handDrawn: {
        name: '手绘涂鸦',
        icon: '🖍️',
        keywords: '手绘涂鸦表情包,随性自由,手绘线条,涂鸦感'
    }
};

// 场景提示词配置(优化为表情包风格)
const scenePrompts = {
    work: {
        name: "上班打工",
        icon: "💼",
        description: "工作日常，摸鱼时刻",
        prompts: [
            "周一起床,痛苦崩溃,夸张表情,无力状态",
            "摸鱼被发现,尴尬到极致,冒冷汗,慌张表情",
            "下班冲出公司,兴高采烈,开心跳跃,解放",
            "开会犯困,生无可恋,眼神空洞,疲惫不堪",
            "收到工资,瞬间复活,眼冒金光,兴奋",
            "被迫加班,内心崩溃,假笑,强颜欢笑"
        ],
        imagePrompts: [
            "打工人崩溃,疲惫表情,办公室场景",
            "上班摸鱼,偷懒状态,搞笑表情"
        ]
    },
    relax: {
        name: "放假休息",
        icon: "🏖️",
        description: "周末假期，躺平时光",
        prompts: [
            "周末躺平,不想动,慵懒姿势,幸福满足",
            "放假前兴奋,睡不着,激动开心,期待",
            "假期结束,绝望痛苦,不想上班,崩溃",
            "宅家一整天,幸福肥宅,满足表情,懒散",
            "出游堵车,后悔莫及,无奈表情,烦躁",
            "追剧吃零食,快乐肥宅,享受时光,放松"
        ],
        imagePrompts: [
            "躺平放松,慵懒状态,舒适表情",
            "度假休闲,开心放松,轻松愉快"
        ]
    },
    study: {
        name: "学习考试",
        icon: "📚",
        description: "备考刷题，学霸学渣",
        prompts: [
            "通宵复习,熊猫眼,疲惫不堪,困得不行",
            "看考试范围,人都傻了,震惊表情,绝望",
            "答题卡涂错,崩溃大哭,后悔莫及,慌张",
            "对答案,心态爆炸,怀疑人生,恐惧",
            "收到成绩,喜忧参半,复杂表情,纠结",
            "考完解放,欢呼雀跃,开心自由,兴奋",
            "deadline临近,疯狂码字,焦虑不安,赶工"
        ],
        imagePrompts: [
            "学习崩溃,疲惫书生,熬夜状态",
            "考试压力,焦虑紧张,抓耳挠腮"
        ]
    },
    emotion: {
        name: "情感表达",
        icon: "😊",
        description: "喜怒哀乐，各种心情",
        prompts: [
            "开心到飞起,笑容灿烂,眉开眼笑,兴高采烈",
            "伤心难过,泪流满面,委屈巴巴,哭泣",
            "愤怒生气,火冒三丈,暴跳如雷,发飙",
            "无语无奈,翻白眼,无力吐槽,嫌弃",
            "尴尬尬笑,不知所措,局促不安,窘迫",
            "震惊惊讶,下巴掉地,瞪大眼睛,不可置信",
            "得意洋洋,骄傲自豪,高兴满足,神气",
            "害羞脸红,不好意思,腼腆可爱,羞涩"
        ],
        imagePrompts: [
            "夸张表情,情绪饱满,表情生动",
            "情感丰富,放大表情元素,生动有趣"
        ]
    },
    social: {
        name: "社交互动",
        icon: "💬",
        description: "聊天吐槽，网络冲浪",
        prompts: [
            "吃瓜围观,兴奋表情,好奇八卦,看热闹",
            "看沙雕图,笑死了,捧腹大笑,乐不可支",
            "被群友@,吓一跳,惊恐表情,措手不及",
            "奇葩言论,满脸问号,不解,疑惑",
            "深夜emo,伤感状态,郁闷难过,失落",
            "收到点赞,开心满足,小小得意,高兴",
            "尬聊救场,社恐发作,尴尬紧张,局促"
        ],
        imagePrompts: [
            "网络聊天,社交表情,互动状态",
            "可爱互动,适合聊天,发送朋友"
        ]
    },
    cartoon: {
        name: "卡通风格",
        icon: "🎨",
        description: "可爱Q版，色彩鲜艳",
        prompts: [
            "可爱卡通形象,圆润Q版,萌萌哒",
            "色彩鲜艳,卡通风格,活泼可爱",
            "呆萌表情,卡通化,Q版人物"
        ],
        imagePrompts: [
            "Q版卡通,色彩鲜艳,表情生动,可爱风格",
            "卡通化处理,有趣表情元素,萌系",
            "Q版风格,圆润可爱,夸张表情,卡通感"
        ]
    },
    "sci-fi": {
        name: "科幻风格",
        icon: "🚀",
        description: "未来科技，霓虹赛博",
        prompts: [
            "赛博朋克,霓虹闪烁,科技感,未来风",
            "未来科技,机械质感,高科技,电子风",
            "全息投影,科幻氛围,炫酷,赛博风"
        ],
        imagePrompts: [
            "未来科幻,霓虹效果,赛博朋克风格",
            "科Technology感元素,全息效果,机械纹理",
            "未来主义,高对比度,霓虹色彩,科技质感"
        ]
    }
};

// 全局变量
let inputMode = 'image'; // 'image' 或 'text'
let selectedScene = 'work';
let selectedStyles = ['qVersion']; // 默认选中Q版风格
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

// 更新提示词显示
function updatePrompt() {
    const scene = scenePrompts[selectedScene];
    if (!scene) return;

    // 根据输入模式选择提示词
    const prompts = inputMode === 'text' ? scene.prompts : (scene.imagePrompts || scene.prompts);
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

    // 构建风格关键词
    const styleKeywordsText = selectedStyles
        .map(styleId => styleKeywords[styleId]?.keywords)
        .filter(Boolean)
        .join(',');

    // 显示给用户的简洁版本（不含系统提示词）
    const displayParts = [
        styleKeywordsText,
        randomPrompt
    ].filter(Boolean);

    const displayPrompt = displayParts.join(',');

    // 更新UI显示
    document.getElementById('promptText').textContent = displayPrompt;
}

// 获取完整的API提示词（含系统提示词）
function getFullPrompt(userPrompt) {
    return memeConstraints + userPrompt;
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
    // 验证输入
    if (inputMode === 'image' && !uploadedImage) {
        showMessage('请先上传图片！', 'error');
        return;
    }

    if (inputMode === 'text') {
        const textInput = document.getElementById('textInput');
        if (!textInput || !textInput.value.trim()) {
            showMessage('请输入文本描述！', 'error');
            return;
        }
    }

    // 显示加载状态
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('resultImage').style.display = 'none';

    // 获取当前设置
    const api = document.getElementById('apiSelect').value;
    const customDescription = document.getElementById('textDescription').value;

    // 获取当前显示的提示词
    const promptText = document.getElementById('promptText').textContent;

    // 构建用户部分的prompt（风格+场景）
    let userPrompt = promptText;
    if (inputMode === 'text') {
        userPrompt = `${textInput}，${userPrompt}`;
    }
    if (customDescription) {
        userPrompt = `${userPrompt}，${customDescription}`;
    }

    // 获取完整API prompt（系统提示词+用户prompt）
    const fullPrompt = getFullPrompt(userPrompt);

    // 更新生成参数
    const sceneName = scenePrompts[selectedScene]?.name || selectedScene;
    document.getElementById('generateParams').textContent =
        `API: ${api} | 模式: ${inputMode === 'image' ? '图片转换' : '文本生成'} | 场景: ${sceneName} | 提示词: ${fullPrompt}`;

    if (api === 'doubao') {
        try {
            // Use deployed backend API endpoint
            const API_BASE_URL = window.API_BASE_URL || 'https://api.mm0708.top';
            const requestBody = {
                prompt: fullPrompt,
                mode: inputMode,
                scene: selectedScene
            };

            // 只在图片模式下发送图片
            if (inputMode === 'image') {
                requestBody.image = uploadedImage;
            }

            const response = await fetch(`${API_BASE_URL}/api/meme/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
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
        // NanoBanana 或其他 API 的模拟逻辑
        setTimeout(() => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (inputMode === 'text') {
                // 文本模式：创建纯文本表情包
                canvas.width = 400;
                canvas.height = 400;

                // 背景
                const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                gradient.addColorStop(0, '#667eea');
                gradient.addColorStop(1, '#764ba2');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // 文本
                const textInput = document.getElementById('textInput').value.trim();
                ctx.fillStyle = 'white';
                ctx.font = 'bold 32px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // 自动换行
                const maxWidth = canvas.width - 40;
                const lines = wrapText(ctx, textInput, maxWidth);
                const lineHeight = 40;
                const startY = (canvas.height - lines.length * lineHeight) / 2;

                lines.forEach((line, i) => {
                    ctx.fillText(line, canvas.width / 2, startY + i * lineHeight);
                });

                generatedImage = canvas.toDataURL('image/png');
                const resultImage = document.getElementById('resultImage');
                resultImage.src = generatedImage;
                resultImage.style.display = 'block';
                document.getElementById('loading').style.display = 'none';
                showMessage('表情包生成成功！', 'success');

            } else {
                // 图片模式：原有逻辑
                const img = new Image();
                img.onload = function () {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);

                    if (selectedScene === 'cartoon') {
                        ctx.globalCompositeOperation = 'overlay';
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    } else if (selectedScene === 'sci-fi') {
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
            }
        }, 2000);
    }
}

// 文本换行辅助函数
function wrapText(ctx, text, maxWidth) {
    const words = text.split('');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const testLine = currentLine + words[i];
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine !== '') {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    lines.push(currentLine);
    return lines;
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

    const textInput = document.getElementById('textInput');
    if (textInput) textInput.value = '';

    const promptText = inputMode === 'image' ? '请上传图片并点击生成按钮' : '请输入文本并点击生成按钮';
    document.getElementById('generateParams').textContent = promptText;

    // 重置场景选择
    document.querySelectorAll('.scene-option').forEach(option => {
        option.classList.remove('active');
    });
    const firstScene = document.querySelector('[data-scene]');
    if (firstScene) {
        firstScene.classList.add('active');
        selectedScene = firstScene.dataset.scene;
    }
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

    // 输入模式切换事件
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // 更新选中状态
            document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // 更新输入模式
            inputMode = tab.dataset.inputMode;

            // 切换显示区域
            const uploadContainer = document.getElementById('uploadContainer');
            const textInputArea = document.getElementById('textInputArea');

            if (inputMode === 'image') {
                uploadContainer.style.display = 'block';
                textInputArea.style.display = 'none';
            } else {
                uploadContainer.style.display = 'none';
                textInputArea.style.display = 'block';
            }

            updatePrompt();
        });
    });

    // 风格选择事件
    document.querySelectorAll('.style-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.preventDefault(); // 防止默认行为
            const styleId = checkbox.dataset.style;
            const input = checkbox.querySelector('input[type="checkbox"]');
            const isActive = checkbox.classList.contains('active');

            // 切换选中状态
            if (isActive) {
                // 至少保留一个风格
                if (selectedStyles.length > 1) {
                    checkbox.classList.remove('active');
                    input.checked = false;
                    selectedStyles = selectedStyles.filter(id => id !== styleId);
                    updatePrompt();
                } else {
                    showMessage('至少选择一种风格！', 'warning');
                }
            } else {
                checkbox.classList.add('active');
                input.checked = true;
                if (!selectedStyles.includes(styleId)) {
                    selectedStyles.push(styleId);
                }
                updatePrompt();
            }
        });
    });

    // 场景选择事件
    document.querySelectorAll('.scene-option').forEach(option => {
        option.addEventListener('click', () => {
            // 更新选中状态
            document.querySelectorAll('.scene-option').forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            // 更新当前场景
            selectedScene = option.dataset.scene;

            // 更新快捷提示词按钮
            updateQuickPrompts();
            updatePrompt();
        });
    });

    // 快捷提示词按钮点击事件
    function updateQuickPrompts() {
        const scene = scenePrompts[selectedScene];
        const container = document.getElementById('quickPromptsContainer');
        if (!container || !scene) return;

        container.innerHTML = '';
        const prompts = inputMode === 'text' ? scene.prompts : (scene.imagePrompts || scene.prompts);

        prompts.slice(0, 6).forEach(prompt => {
            const btn = document.createElement('button');
            btn.className = 'prompt-quick-btn';
            btn.textContent = prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt;
            btn.title = prompt;
            btn.addEventListener('click', () => {
                if (inputMode === 'text') {
                    document.getElementById('textInput').value = prompt;
                } else {
                    document.getElementById('textDescription').value = prompt;
                }
            });
            container.appendChild(btn);
        });
    }

    // 按钮事件
    document.getElementById('generateBtn').addEventListener('click', generateMeme);
    document.getElementById('downloadBtn').addEventListener('click', downloadMeme);
    document.getElementById('clearBtn').addEventListener('click', clearAll);

    // 初始化
    updateQuickPrompts();
    updatePrompt();
});