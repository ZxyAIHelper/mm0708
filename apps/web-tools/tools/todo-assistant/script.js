const API_BASE = window.API_BASE_URL || 'https://my-cloud-hub.247176265.workers.dev';
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
            showMessage('assistant', updates.status === 'completed' ? '✅ 任务已完成！' : '🔄 任务已重新打开');
        }
    } catch (error) {
        console.error('更新任务失败:', error);
        showMessage('assistant', '❌ 更新失败，请重试');
    }
}

// 发送消息 - 支持流式输出
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
            contentDiv.textContent = `❌ ${errorData.error || '请求失败'}`;
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
                            contentDiv.textContent = fullContent;
                            // 滚动到底部
                            const messagesDiv = document.getElementById('messages');
                            messagesDiv.scrollTop = messagesDiv.scrollHeight;
                        }
                        if (json.error) {
                            contentDiv.textContent = `❌ ${json.error}`;
                            return;
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }

        // 保存到对话历史
        if (fullContent) {
            conversation.push({ role: 'assistant', content: fullContent });
        }

    } catch (error) {
        console.error('发送消息失败:', error);
        contentDiv.textContent = '❌ 发送失败，请重试';
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
