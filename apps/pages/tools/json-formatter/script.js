// Global state
let currentView = 'text';
let jsonData = null;
let searchIndex = 0;
let searchMatches = [];

// DOM Elements
const textEditor = document.getElementById('textEditor');
const lineNumbers = document.getElementById('lineNumbers');
const treeViewContainer = document.getElementById('treeViewContainer');
const messageContainer = document.getElementById('messageContainer');
const searchContainer = document.getElementById('searchContainer');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const darkModeToggle = document.getElementById('darkModeToggle');

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    initializeEventListeners();
    updateLineNumbers();
    loadDarkModePreference();
    formatJSON(); // Auto-format on load
});

// Event Listeners
function initializeEventListeners() {
    // View tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', () => switchView(tab.dataset.view));
    });

    // Toolbar buttons
    document.getElementById('formatBtn').addEventListener('click', formatJSON);
    document.getElementById('compressBtn').addEventListener('click', compressJSON);
    document.getElementById('validateBtn').addEventListener('click', validateJSON);
    document.getElementById('copyBtn').addEventListener('click', copyToClipboard);
    document.getElementById('clearBtn').addEventListener('click', clearAll);
    document.getElementById('expandAllBtn').addEventListener('click', expandAll);
    document.getElementById('collapseAllBtn').addEventListener('click', collapseAll);
    document.getElementById('searchBtn').addEventListener('click', toggleSearch);
    document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('downloadBtn').addEventListener('click', downloadJSON);
    document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

    // File input
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);

    // Search
    document.getElementById('searchNextBtn').addEventListener('click', searchNext);
    document.getElementById('searchCloseBtn').addEventListener('click', closeSearch);
    searchInput.addEventListener('input', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchNext();
    });

    // Text editor
    textEditor.addEventListener('input', updateLineNumbers);
    textEditor.addEventListener('scroll', syncScroll);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// View Switching
function switchView(view) {
    currentView = view;

    // Update tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
    });

    // Update containers
    document.getElementById('textEditorContainer').classList.toggle('active', view === 'text');
    document.getElementById('treeViewContainer').classList.toggle('active', view === 'tree');

    // Update buttons visibility
    const treeButtons = ['expandAllBtn', 'collapseAllBtn', 'treeDivider'];
    treeButtons.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.style.display = view === 'tree' ? 'block' : 'none';
    });

    // Render tree view if switching to it
    if (view === 'tree') {
        try {
            jsonData = JSON.parse(textEditor.value);
            renderTreeView(jsonData);
        } catch (e) {
            showMessage('无法切换到树形视图：JSON格式错误', 'error');
            // Switch back to text view
            setTimeout(() => switchView('text'), 100);
        }
    }
}

// JSON Operations
function formatJSON() {
    try {
        const parsed = JSON.parse(textEditor.value);
        textEditor.value = JSON.stringify(parsed, null, 2);
        jsonData = parsed;
        updateLineNumbers();
        showMessage('✓ JSON格式化成功', 'success');

        if (currentView === 'tree') {
            renderTreeView(parsed);
        }
    } catch (error) {
        showMessage('✗ JSON格式错误: ' + error.message, 'error');
    }
}

function compressJSON() {
    try {
        const parsed = JSON.parse(textEditor.value);
        textEditor.value = JSON.stringify(parsed);
        jsonData = parsed;
        updateLineNumbers();
        showMessage('✓ JSON压缩成功', 'success');
    } catch (error) {
        showMessage('✗ JSON格式错误: ' + error.message, 'error');
    }
}

function validateJSON() {
    try {
        const parsed = JSON.parse(textEditor.value);
        const size = new Blob([textEditor.value]).size;
        const lines = textEditor.value.split('\n').length;
        showMessage(`✓ JSON格式有效！行数: ${lines}, 大小: ${formatBytes(size)}`, 'success');
    } catch (error) {
        const match = error.message.match(/position (\d+)/);
        const position = match ? parseInt(match[1]) : null;
        let errorMsg = '✗ JSON格式错误: ' + error.message;

        if (position !== null) {
            const beforeError = textEditor.value.substring(0, position);
            const line = beforeError.split('\n').length;
            const col = position - beforeError.lastIndexOf('\n');
            errorMsg += ` (第 ${line} 行, 第 ${col} 列)`;
        }

        showMessage(errorMsg, 'error');
    }
}

function copyToClipboard() {
    const textToCopy = currentView === 'text' ? textEditor.value : JSON.stringify(jsonData, null, 2);

    if (!textToCopy) {
        showMessage('没有可复制的内容', 'warning');
        return;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
        showMessage('✓ 已复制到剪贴板', 'success');
    }).catch(() => {
        // Fallback
        textEditor.select();
        document.execCommand('copy');
        showMessage('✓ 已复制到剪贴板', 'success');
    });
}

function clearAll() {
    if (confirm('确定要清空所有内容吗？')) {
        textEditor.value = '';
        treeViewContainer.innerHTML = '';
        jsonData = null;
        updateLineNumbers();
        messageContainer.innerHTML = '';
    }
}

// Tree View Rendering
function renderTreeView(data, container = treeViewContainer, key = null, path = '') {
    if (container === treeViewContainer) {
        container.innerHTML = '';
    }

    const type = typeof data;
    const isArray = Array.isArray(data);
    const isObject = type === 'object' && data !== null && !isArray;

    if (isObject || isArray) {
        const line = document.createElement('div');
        line.className = 'tree-line';

        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle expanded';
        toggle.addEventListener('click', function () {
            this.classList.toggle('expanded');
            this.classList.toggle('collapsed');
            node.style.display = this.classList.contains('expanded') ? 'block' : 'none';
        });
        line.appendChild(toggle);

        if (key !== null) {
            const keySpan = document.createElement('span');
            keySpan.className = 'tree-key';
            keySpan.textContent = `"${key}": `;
            keySpan.title = 'Click to copy path';
            keySpan.addEventListener('click', () => copyPath(path));
            line.appendChild(keySpan);
        }

        const bracket = document.createElement('span');
        bracket.className = 'json-bracket';
        bracket.textContent = isArray ? '[' : '{';
        line.appendChild(bracket);

        const badge = document.createElement('span');
        badge.className = 'tree-type-badge';
        const count = isArray ? data.length : Object.keys(data).length;
        badge.textContent = `${count} ${isArray ? 'items' : 'properties'}`;
        line.appendChild(badge);

        container.appendChild(line);

        const node = document.createElement('div');
        node.className = 'tree-node';

        const entries = isArray ? data.map((v, i) => [i, v]) : Object.entries(data);
        entries.forEach(([k, v]) => {
            const childPath = path ? `${path}.${k}` : k.toString();
            renderTreeView(v, node, k, childPath);
        });

        container.appendChild(node);

        const closeLine = document.createElement('div');
        closeLine.className = 'tree-line';
        closeLine.innerHTML = `<span class="tree-toggle" style="visibility: hidden;"></span><span class="json-bracket">${isArray ? ']' : '}'}</span>`;
        container.appendChild(closeLine);

    } else {
        const line = document.createElement('div');
        line.className = 'tree-line';

        line.innerHTML = '<span class="tree-toggle" style="visibility: hidden;"></span>';

        if (key !== null) {
            const keySpan = document.createElement('span');
            keySpan.className = 'tree-key';
            keySpan.textContent = `"${key}": `;
            keySpan.title = 'Click to copy path';
            keySpan.addEventListener('click', () => copyPath(path));
            line.appendChild(keySpan);
        }

        const valueSpan = document.createElement('span');
        valueSpan.className = 'tree-value editable';

        let valueText = '';
        let className = '';

        if (type === 'string') {
            valueText = `"${data}"`;
            className = 'json-string';
        } else if (type === 'number') {
            valueText = data.toString();
            className = 'json-number';
        } else if (type === 'boolean') {
            valueText = data.toString();
            className = 'json-boolean';
        } else if (data === null) {
            valueText = 'null';
            className = 'json-null';
        }

        valueSpan.innerHTML = `<span class="${className}">${valueText}</span>`;
        valueSpan.dataset.path = path;
        valueSpan.dataset.type = type;
        valueSpan.dataset.value = data;

        // Make value editable
        valueSpan.addEventListener('click', function (e) {
            e.stopPropagation();
            makeEditable(this);
        });

        line.appendChild(valueSpan);
        container.appendChild(line);
    }
}

// Inline Editing
function makeEditable(element) {
    const currentValue = element.dataset.value;
    const currentType = element.dataset.type;
    const path = element.dataset.path;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-value-input';
    input.value = currentType === 'string' ? currentValue : (currentValue === 'null' ? 'null' : currentValue);

    input.addEventListener('blur', () => saveEdit(element, input, path, currentType));
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEdit(element, input, path, currentType);
        } else if (e.key === 'Escape') {
            element.innerHTML = element.dataset.originalHtml;
        }
    });

    element.dataset.originalHtml = element.innerHTML;
    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    input.select();
}

function saveEdit(element, input, path, type) {
    let newValue = input.value;
    let parsedValue;

    try {
        // Parse based on type
        if (type === 'string') {
            parsedValue = newValue;
        } else if (type === 'number') {
            parsedValue = parseFloat(newValue);
            if (isNaN(parsedValue)) throw new Error('Invalid number');
        } else if (type === 'boolean') {
            if (newValue === 'true') parsedValue = true;
            else if (newValue === 'false') parsedValue = false;
            else throw new Error('Invalid boolean');
        } else if (newValue === 'null') {
            parsedValue = null;
        } else {
            parsedValue = JSON.parse(newValue);
        }

        // Update jsonData
        setValueByPath(jsonData, path, parsedValue);

        // Update text editor
        textEditor.value = JSON.stringify(jsonData, null, 2);
        updateLineNumbers();

        // Re-render tree view
        renderTreeView(jsonData);

        showMessage('✓ 值已更新', 'success');

    } catch (error) {
        showMessage('✗ 无效的值: ' + error.message, 'error');
        element.innerHTML = element.dataset.originalHtml;
    }
}

function setValueByPath(obj, path, value) {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = value;
}

function copyPath(path) {
    navigator.clipboard.writeText(path).then(() => {
        showMessage(`✓ 路径已复制: ${path}`, 'success');
    });
}

// Tree Operations
function expandAll() {
    document.querySelectorAll('.tree-toggle').forEach(toggle => {
        if (toggle.classList.contains('collapsed')) {
            toggle.click();
        }
    });
}

function collapseAll() {
    document.querySelectorAll('.tree-toggle').forEach(toggle => {
        if (toggle.classList.contains('expanded')) {
            toggle.click();
        }
    });
}

// Search
function toggleSearch() {
    searchContainer.classList.toggle('active');
    if (searchContainer.classList.contains('active')) {
        searchInput.focus();
    } else {
        searchInput.value = '';
        searchResults.textContent = '';
    }
}

function closeSearch() {
    searchContainer.classList.remove('active');
    searchInput.value = '';
    searchResults.textContent = '';
}

function performSearch() {
    const query = searchInput.value.toLowerCase();
    if (!query) {
        searchResults.textContent = '';
        return;
    }

    const text = textEditor.value.toLowerCase();
    searchMatches = [];
    let index = text.indexOf(query);

    while (index !== -1) {
        searchMatches.push(index);
        index = text.indexOf(query, index + 1);
    }

    searchIndex = 0;
    searchResults.textContent = searchMatches.length > 0
        ? `找到 ${searchMatches.length} 个匹配项`
        : '未找到匹配项';

    if (searchMatches.length > 0) {
        highlightMatch(searchMatches[0]);
    }
}

function searchNext() {
    if (searchMatches.length === 0) return;

    searchIndex = (searchIndex + 1) % searchMatches.length;
    highlightMatch(searchMatches[searchIndex]);
    searchResults.textContent = `第 ${searchIndex + 1} / ${searchMatches.length} 个匹配项`;
}

function highlightMatch(position) {
    textEditor.focus();
    textEditor.setSelectionRange(position, position + searchInput.value.length);
    textEditor.scrollTop = textEditor.scrollHeight * (position / textEditor.value.length) - 100;
}

// File Operations
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const content = e.target.result;
            const parsed = JSON.parse(content);
            textEditor.value = JSON.stringify(parsed, null, 2);
            jsonData = parsed;
            updateLineNumbers();
            showMessage(`✓ 文件已加载: ${file.name}`, 'success');

            if (currentView === 'tree') {
                renderTreeView(parsed);
            }
        } catch (error) {
            showMessage('✗ 文件格式错误: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);

    // Reset input
    event.target.value = '';
}

function downloadJSON() {
    const content = textEditor.value;
    if (!content) {
        showMessage('没有可下载的内容', 'warning');
        return;
    }

    try {
        // Validate before download
        JSON.parse(content);

        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `json-export-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage('✓ 文件下载成功', 'success');
    } catch (error) {
        showMessage('✗ 无法下载：JSON格式错误', 'error');
    }
}

// Line Numbers
function updateLineNumbers() {
    const lines = textEditor.value.split('\n').length;
    lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

function syncScroll() {
    lineNumbers.scrollTop = textEditor.scrollTop;
}

// Dark Mode
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    darkModeToggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('darkMode', isDark);
}

function loadDarkModePreference() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        darkModeToggle.textContent = '☀️';
    }
}

// Keyboard Shortcuts
function handleKeyboardShortcuts(e) {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'f':
            case 'F':
                e.preventDefault();
                formatJSON();
                break;
            case 's':
            case 'S':
                e.preventDefault();
                downloadJSON();
                break;
            case 'k':
            case 'K':
                e.preventDefault();
                toggleSearch();
                break;
        }
    }
}

// Utility Functions
function showMessage(message, type) {
    messageContainer.innerHTML = `<div class="${type}-message">${message}</div>`;
    setTimeout(() => {
        messageContainer.innerHTML = '';
    }, 3000);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
