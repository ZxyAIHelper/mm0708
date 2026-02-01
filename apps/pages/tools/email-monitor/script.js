// DOM Elements
const apiInput = document.getElementById('apiBaseUrl');
const saveApiBtn = document.getElementById('saveApiBtn');
const webhookInput = document.getElementById('webhookUrl');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const testNotifyBtn = document.getElementById('testNotifyBtn');
const rulesList = document.getElementById('rulesList');
const addRuleBtn = document.getElementById('addRuleBtn');
const ruleModal = document.getElementById('ruleModal');
const ruleForm = document.getElementById('ruleForm');
const saveRuleBtn = document.getElementById('saveRuleBtn');
const closeModalBtns = document.querySelectorAll('.close-modal');

// State
let rules = [];
const DEFAULT_API = window.API_BASE_URL || 'https://api.mm0708.top';

// Get current API Base
function getApiBase() {
    let url = apiInput.value.trim() || DEFAULT_API;
    // Remove trailing slash
    return url.replace(/\/+$/, '') + '/api/email-monitor';
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Load persisted API URL
    const savedApi = localStorage.getItem('email_monitor_api');
    if (savedApi) {
        apiInput.value = savedApi;
    }

    loadConfig();
    loadRules();
    setupEventListeners();
});

function setupEventListeners() {
    // API Config
    saveApiBtn.addEventListener('click', () => {
        const url = apiInput.value.trim();
        if (url) {
            localStorage.setItem('email_monitor_api', url);
            showToast('API 地址已更新，正在重新连接...', 'success');
            loadConfig();
            loadRules();
        }
    });

    // Config
    saveConfigBtn.addEventListener('click', saveConfig);
    testNotifyBtn.addEventListener('click', testNotification);

    // Rules
    addRuleBtn.addEventListener('click', () => openModal());
    saveRuleBtn.addEventListener('click', saveRule);

    // Modal
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => closeModal());
    });

    // Close modal on outside click
    ruleModal.addEventListener('click', (e) => {
        if (e.target === ruleModal) closeModal();
    });

    // Match Type Change
    document.getElementById('matchType').addEventListener('change', (e) => {
        const val = e.target.value;
        const group = document.getElementById('matchValueGroup');
        if (val === 'all') {
            group.style.display = 'none';
        } else {
            group.style.display = 'block';
        }
    });
}

// API Calls
async function loadConfig() {
    try {
        const res = await fetch(`${getApiBase()}/config`);
        const data = await res.json();
        if (data.webhookUrl) {
            webhookInput.value = data.webhookUrl;
        }
    } catch (err) {
        console.error('Failed to load config', err);
        showToast('加载配置失败', 'error');
    }
}

async function saveConfig() {
    const url = webhookInput.value.trim();
    if (!url) return showToast('请输入 Webhook URL', 'warning');

    try {
        saveConfigBtn.disabled = true;
        saveConfigBtn.textContent = '保存中...';

        const res = await fetch(`${getApiBase()}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ webhookUrl: url })
        });

        if (res.ok) {
            showToast('配置已保存', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (err) {
        showToast('保存失败', 'error');
    } finally {
        saveConfigBtn.disabled = false;
        saveConfigBtn.textContent = '保存';
    }
}

async function testNotification() {
    try {
        testNotifyBtn.disabled = true;
        testNotifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 发送中...';

        const res = await fetch(`${getApiBase()}/test`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            showToast('测试消息已发送', 'success');
        } else {
            showToast(data.error || '发送失败', 'error');
        }
    } catch (err) {
        showToast('发送失败', 'error');
    } finally {
        testNotifyBtn.disabled = false;
        testNotifyBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 发送测试通知';
    }
}

async function loadRules() {
    try {
        rulesList.innerHTML = '<div class="loading">加载中...</div>';
        const res = await fetch(`${getApiBase()}/rules`);
        const data = await res.json();
        rules = data.rules || [];
        renderRules();
    } catch (err) {
        console.error(err);
        rulesList.innerHTML = '<div class="error">加载规则失败</div>';
    }
}

async function saveRule(e) {
    e.preventDefault();
    const name = document.getElementById('ruleName').value.trim();
    const matchType = document.getElementById('matchType').value;
    const matchValue = document.getElementById('matchValue').value.trim();
    const forwardToWecom = document.getElementById('forwardToWecom').checked;

    if (!name) return showToast('请输入规则名称', 'warning');
    if (matchType !== 'all' && !matchValue) return showToast('请输入匹配内容', 'warning');

    const ruleData = {
        name,
        matchType,
        matchValue: matchType === 'all' ? '' : matchValue,
        forwardToWecom
    };

    try {
        saveRuleBtn.disabled = true;
        const res = await fetch(`${getApiBase()}/rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ruleData)
        });

        if (res.ok) {
            showToast('规则已保存', 'success');
            closeModal();
            loadRules(); // Reload
        } else {
            throw new Error('Save failed');
        }
    } catch (err) {
        showToast('保存规则失败', 'error');
    } finally {
        saveRuleBtn.disabled = false;
    }
}

async function deleteRule(id) {
    if (!confirm('确定要删除这条规则吗？')) return;

    try {
        const res = await fetch(`${getApiBase()}/rules/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('规则已删除', 'success');
            loadRules();
        } else {
            showToast('删除失败', 'error');
        }
    } catch (err) {
        showToast('删除失败', 'error');
    }
}

// UI Helpers
function renderRules() {
    if (rules.length === 0) {
        rulesList.innerHTML = '<div class="empty-state">暂无规则，点击上方按钮添加。</div>';
        return;
    }

    rulesList.innerHTML = rules.map(rule => `
        <div class="rule-item">
            <div class="rule-info">
                <h3>
                    <span class="status-badge ${rule.is_active ? 'active' : 'inactive'}"></span>
                    ${escapeHtml(rule.name)}
                </h3>
                <p>
                    <span class="rule-tag ${rule.match_type}">
                        ${getMatchTypeName(rule.match_type)}
                    </span>
                    ${rule.match_type !== 'all' ? escapeHtml(rule.match_value) : ''}
                </p>
                <p class="meta">转发: ${rule.forward_to_wecom ? '是' : '否'}</p>
            </div>
            <div class="rule-actions">
                <button class="icon-btn delete-btn" onclick="deleteRule(${rule.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function getMatchTypeName(type) {
    const map = {
        'sender': '发件人',
        'subject': '主题',
        'all': '全部'
    };
    return map[type] || type;
}

function openModal() {
    ruleForm.reset();
    document.getElementById('modalTitle').textContent = '新增规则';
    document.getElementById('matchValueGroup').style.display = 'block';
    ruleModal.classList.remove('hidden');
}

function closeModal() {
    ruleModal.classList.add('hidden');
}

function showToast(msg, type = 'info') {
    alert(msg);
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.deleteRule = deleteRule;
