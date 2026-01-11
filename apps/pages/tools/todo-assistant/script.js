const API_BASE = window.API_BASE_URL || 'https://api.mm0708.top';
const MAX_MESSAGES = 10;

let tasks = [];
let conversation = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadTasks();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    document.getElementById('newTopicBtn').addEventListener('click', newTopic);
    document.getElementById('refreshBtn').addEventListener('click', loadTasks);
}

// 加载任务列表
async function loadTasks() {
    try {
        const response = await fetch(`${API_BASE}/api/todo/tasks`);
        const data = await response.json();
        tasks = data.tasks || [];
        renderTasks();
    } catch (error) {
        console.error('加载任务失败:', error);
        showMessage('assistant', '❌ 加载任务失败，请刷新重试');
    }
}

// 渲染任务列表
function renderTasks() {
    const tasksList = document.getElementById('tasksList');

    if (tasks.length === 0) {
        tasksList.innerHTML = '<div class="empty-state">暂无任务</div>';
        return;
    }

    tasksList.innerHTML = tasks.map(task => `
        <div class="task-item ${task.status === 'completed' ? 'completed' : ''}" 
             onclick="handleTaskClick('${task.id}')">
            <div class="task-title">
                <span>${task.status === 'completed' ? '✅' : '☐'}</span>
                <span>${escapeHtml(task.title)}</span>
            </div>
            <div class="task-meta">
                ${task.due_date ? `⏰ ${formatDate(task.due_date)}` : ''}
                ${task.description ? `<div style="margin-top:4px;font-size:0.8rem">${escapeHtml(task.description)}</div>` : ''}
            </div>
        </div>
    `).join('');
}

// 处理任务点击
function handleTaskClick(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const action = task.status === 'pending' ? '标记完成' : '重新打开';
    if (confirm(`${action} "${task.title}"?`)) {
        updateTask(taskId, {
            status: task.status === 'pending' ? 'completed' : 'pending'
        });
    }
}

// 更新任务
async function updateTask(taskId, updates) {
    try {
        const response = await fetch(`${API_BASE}/api/todo/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });

        if (response.ok) {
            await loadTasks();
            return true;
        }
        return false;
    } catch (error) {
        console.error('更新任务失败:', error);
        return false;
    }
}

// 创建任务
async function createTask(taskData) {
    try {
        const response = await fetch(`${API_BASE}/api/todo/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: taskData.title,
                description: taskData.description || '',
                dueDate: taskData.dueDate || null,
            }),
        });

        if (response.ok) {
            await loadTasks();
            return true;
        }
        return false;
    } catch (error) {
        console.error('创建任务失败:', error);
        return false;
    }
}

// 发送消息 - 支持流式输出和思考过程
async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();

    if (!message) return;

    input.value = '';
    showMessage('user', message);

    // 添加到对话历史
    conversation.push({ role: 'user', content: message });

    // 保持最近N条
    if (conversation.length > MAX_MESSAGES) {
        conversation = conversation.slice(-MAX_MESSAGES);
    }

    // 创建AI消息容器
    const aiMessageId = showMessage('assistant', '');
    const aiMessageDiv = document.getElementById(aiMessageId);
    const contentDiv = aiMessageDiv.querySelector('.message-content');

    // 创建思考过程区域 (初始展开)
    const thinkingId = `thinking-${Date.now()}`;
    contentDiv.innerHTML = `
        <div class="final-result" id="result-${aiMessageId}">💭 AI正在思考...</div>
        <div class="thinking-process">
            <div class="thinking-header" onclick="toggleThinking('${thinkingId}')">
                <span class="thinking-icon" id="icon-${thinkingId}">▼</span>
                <span>思考过程</span>
            </div>
            <div class="thinking-content" id="${thinkingId}"></div>
        </div>
    `;

    const thinkingContent = document.getElementById(thinkingId);
    const resultDiv = document.getElementById(`result-${aiMessageId}`);
    let fullContent = '';

    try {
        const response = await fetch(`${API_BASE}/api/todo/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: conversation,
                userMessage: message
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            resultDiv.textContent = `❌ ${errorData.error || '请求失败'}`;
            thinkingContent.parentElement.style.display = 'none';
            return;
        }

        // 读取流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    try {
                        const json = JSON.parse(data);
                        if (json.content) {
                            fullContent += json.content;
                            thinkingContent.textContent = fullContent;
                            resultDiv.textContent = '💭 思考中...';
                            // 滚动到底部
                            const messagesDiv = document.getElementById('messages');
                            messagesDiv.scrollTop = messagesDiv.scrollHeight;
                        }
                        if (json.error) {
                            resultDiv.textContent = `❌ ${json.error}`;
                            thinkingContent.parentElement.style.display = 'none';
                            return;
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }

        // 检查是否包含JSON action
        const jsonMatch = fullContent.match(/\{[\s\S]*"action"[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const actionData = JSON.parse(jsonMatch[0]);

                if (actionData.action === 'create') {
                    // 创建任务
                    const success = await createTask(actionData);
                    if (success) {
                        resultDiv.textContent = `✅ 已创建任务：${actionData.title}`;
                        // 自动折叠思考过程
                        const content = document.getElementById(thinkingId);
                        const icon = document.getElementById(`icon-${thinkingId}`);
                        content.classList.add('hidden');
                        icon.classList.add('collapsed');

                        conversation.push({
                            role: 'assistant',
                            content: `已创建任务：${actionData.title}`
                        });
                    } else {
                        resultDiv.textContent = '❌ 创建任务失败，请重试';
                    }
                    return;
                } else if (actionData.action === 'update') {
                    // 更新任务（如标记完成）
                    const success = await updateTask(actionData.taskId, actionData.updates);
                    if (success) {
                        const statusText = actionData.updates.status === 'completed' ? '完成' : '更新';
                        resultDiv.textContent = `✅ 已${statusText}任务：${actionData.title || ''}`;
                        // 自动折叠思考过程
                        const content = document.getElementById(thinkingId);
                        const icon = document.getElementById(`icon-${thinkingId}`);
                        content.classList.add('hidden');
                        icon.classList.add('collapsed');

                        conversation.push({
                            role: 'assistant',
                            content: `已${statusText}任务`
                        });
                    } else {
                        resultDiv.textContent = '❌ 更新任务失败';
                    }
                    return;
                }
            } catch (e) {
                console.error('解析action失败:', e);
            }
        }

        // 没有action，直接显示内容
        resultDiv.textContent = fullContent;
        thinkingContent.parentElement.style.display = 'none';

        // 保存到对话历史
        if (fullContent) {
            conversation.push({ role: 'assistant', content: fullContent });
        }

    } catch (error) {
        console.error('发送消息失败:', error);
        resultDiv.textContent = '❌ 发送失败，请重试';
        thinkingContent.parentElement.style.display = 'none';
    }
}

// 切换思考过程显示
function toggleThinking(thinkingId) {
    const content = document.getElementById(thinkingId);
    const icon = document.getElementById(`icon-${thinkingId}`);

    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        icon.classList.remove('collapsed');
    } else {
        content.classList.add('hidden');
        icon.classList.add('collapsed');
    }
}

// 新话题
function newTopic() {
    conversation = [];
    showMessage('system', '🔄 已清空对话历史，开始新话题');
}

// 显示消息
function showMessage(role, content) {
    const messagesDiv = document.getElementById('messages');
    const messageId = `msg-${Date.now()}-${Math.random()}`;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.id = messageId;
    messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
    `;

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    return messageId;
}

// 工具函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateOnly = date.toDateString();
    const nowOnly = now.toDateString();
    const tomorrowOnly = tomorrow.toDateString();

    if (dateOnly === nowOnly) {
        return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (dateOnly === tomorrowOnly) {
        return `明天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return date.toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
