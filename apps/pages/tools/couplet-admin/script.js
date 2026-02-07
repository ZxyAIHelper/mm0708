const API_BASE = 'https://api.mm0708.top/api/couplet';

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(target).classList.add('active');
    });
});

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

async function loadCurrentPrompts() {
    try {
        const response = await fetch(`${API_BASE}/prompts`);
        const data = await response.json();

        const type = document.getElementById('promptType').value;
        if (data[type]) {
            document.getElementById('promptContent').value = data[type];
            showToast('提示词已加载');
        }
    } catch (error) {
        showToast('加载失败: ' + error.message);
    }
}

async function savePrompt() {
    const type = document.getElementById('promptType').value;
    const content = document.getElementById('promptContent').value;

    if (!content.trim()) {
        showToast('提示词不能为空');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/prompts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, content })
        });

        if (response.ok) {
            showToast('保存成功');
            loadPromptHistory();
        } else {
            showToast('保存失败');
        }
    } catch (error) {
        showToast('保存失败: ' + error.message);
    }
}

async function loadPromptHistory() {
    try {
        const response = await fetch(`${API_BASE}/prompts/history`);
        const history = await response.json();

        const container = document.getElementById('promptHistory');
        if (history.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无历史记录</p></div>';
            return;
        }

        container.innerHTML = history.map(item => `
            <div class="prompt-item" onclick="loadPromptVersion('${item.id}')">
                <h3>${item.type}</h3>
                <p>${item.content.substring(0, 100)}...</p>
                <div class="prompt-meta">
                    <span>📅 ${new Date(item.created_at).toLocaleString('zh-CN')}</span>
                    <span>👤 ${item.author || 'Admin'}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载历史失败:', error);
    }
}

function loadPromptVersion(id) {
    showToast('功能开发中...');
}

// Load couplet generation records
async function loadRecords(page = 1) {
    try {
        const filter = document.getElementById('recordsFilter')?.value || 'all';
        const response = await fetch(`${API_BASE}/records?page=${page}&limit=20`);
        const data = await response.json();

        const tbody = document.getElementById('recordsBody');
        if (!data.success || data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无记录</td></tr>';
            return;
        }

        // Filter records if needed
        let records = data.data;
        if (filter !== 'all') {
            records = records.filter(r => r.type === filter);
        }

        tbody.innerHTML = records.map(record => {
            const date = new Date(record.created_at).toLocaleString('zh-CN');
            const typeText = record.type === 'new_year' ? '新年春联' : '乔迁对联';
            const modeText = record.mode === 'couple' ? '情侣' : '孩子';
            const names = record.names.join('、');
            const result = record.result;

            return `
                <tr>
                    <td>${date}</td>
                    <td>
                        <div class="user-info">
                            <div>${record.username || '匿名用户'}</div>
                            <small>${record.openid?.slice(-8) || '-'}</small>
                        </div>
                    </td>
                    <td><span class="badge">${typeText}</span></td>
                    <td><span class="badge">${modeText}</span></td>
                    <td><strong>${names}</strong></td>
                    <td>
                        <div class="result-preview">
                            <div><strong>横批：</strong>${result.top}</div>
                            <div><strong>上联：</strong>${result.left}</div>
                            <div><strong>下联：</strong>${result.right}</div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Render pagination
        const pagination = document.getElementById('pagination');
        const { page: currentPage, pages, total } = data.pagination;
        let paginationHTML = `<span>共 ${total} 条记录，第 ${currentPage}/${pages} 页</span><div class="pagination-buttons">`;

        if (currentPage > 1) {
            paginationHTML += `<button onclick="loadRecords(${currentPage - 1})">上一页</button>`;
        }
        if (currentPage < pages) {
            paginationHTML += `<button onclick="loadRecords(${currentPage + 1})">下一页</button>`;
        }
        paginationHTML += '</div>';
        pagination.innerHTML = paginationHTML;

    } catch (error) {
        console.error('加载记录失败:', error);
        showToast('加载记录失败: ' + error.message);
    }
}

// Tab switching - load records when orders tab is clicked
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        if (tab.dataset.tab === 'orders') {
            loadRecords();
        }
    });
});

// Initialize
loadCurrentPrompts();
loadPromptHistory();
