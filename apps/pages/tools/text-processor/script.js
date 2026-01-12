import {
    parseText,
    formatText,
    trimItems,
    removeDuplicates,
    removeEmpty,
    sortItems,
    getStats
} from './utils.js';

// DOM Elements
let inputText, outputText, messageEl;
let delimiterCheckboxes, customDelimiterInput;
let trimCheckbox, dedupeCheckbox, removeEmptyCheckbox, sortCheckbox;

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    // Get DOM elements
    inputText = document.getElementById('inputText');
    outputText = document.getElementById('outputText');
    messageEl = document.getElementById('message');
    customDelimiterInput = document.getElementById('customDelimiter');

    // Get delimiter checkboxes (now supports multiple selection)
    delimiterCheckboxes = document.querySelectorAll('input[name="outputDelimiter"]');

    // Get processing checkboxes
    trimCheckbox = document.getElementById('trimWhitespace');
    dedupeCheckbox = document.getElementById('removeDuplicates');
    removeEmptyCheckbox = document.getElementById('removeEmpty');
    sortCheckbox = document.getElementById('sortAlphabetically');

    // Event listeners
    document.getElementById('formatBtn').addEventListener('click', processText);
    document.getElementById('copyBtn').addEventListener('click', copyOutput);
    document.getElementById('clearBtn').addEventListener('click', clearAll);
    document.getElementById('swapBtn').addEventListener('click', swapInputOutput);

    // Auto-process on input change
    inputText.addEventListener('input', updateStats);

    // Enable custom delimiter input when custom is checked
    delimiterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            const customChecked = document.getElementById('outputCustom').checked;
            customDelimiterInput.disabled = !customChecked;
        });
    });

    // Initial stats update
    updateStats();
});

// Main text processing function
function processText() {
    try {
        const input = inputText.value;

        if (!input.trim()) {
            showMessage('请输入要处理的文本', 'error');
            return;
        }

        // Parse input - auto-detect delimiter
        let items = parseText(input, 'auto');

        // Apply processing options
        if (trimCheckbox.checked) {
            items = trimItems(items);
        }

        if (removeEmptyCheckbox.checked) {
            items = removeEmpty(items);
        }

        if (dedupeCheckbox.checked) {
            items = removeDuplicates(items);
        }

        if (sortCheckbox.checked) {
            items = sortItems(items);
        }

        // Get selected output delimiters (support multiple)
        let delimiters = [];
        delimiterCheckboxes.forEach(checkbox => {
            if (checkbox.checked) {
                let value = checkbox.value;
                if (value === 'custom') {
                    value = customDelimiterInput.value || ',';
                }
                delimiters.push(value);
            }
        });

        // Default to comma if nothing selected
        if (delimiters.length === 0) {
            delimiters = [','];
        }

        // Format output
        const output = formatText(items, delimiters);
        outputText.value = output;

        // Update stats
        updateOutputStats(items);

        showMessage('✓ 处理成功！', 'success');
    } catch (error) {
        showMessage('✗ 处理失败: ' + error.message, 'error');
    }
}

// Update input stats
function updateStats() {
    const input = inputText.value;
    if (!input.trim()) {
        document.getElementById('inputCount').textContent = '0';
        return;
    }

    const items = parseText(input, 'auto');
    const stats = getStats(items);
    document.getElementById('inputCount').textContent = stats.totalItems;
}

// Update output stats
function updateOutputStats(items) {
    const stats = getStats(items);
    document.getElementById('outputCount').textContent = stats.totalItems;
    document.getElementById('uniqueCount').textContent = stats.uniqueItems;
}

// Copy output to clipboard
function copyOutput() {
    if (!outputText.value) {
        showMessage('没有可复制的内容', 'error');
        return;
    }

    navigator.clipboard.writeText(outputText.value).then(() => {
        showMessage('✓ 已复制到剪贴板', 'success');
    }).catch(() => {
        // Fallback
        outputText.select();
        document.execCommand('copy');
        showMessage('✓ 已复制到剪贴板', 'success');
    });
}

// Clear all
function clearAll() {
    if (confirm('确定要清空所有内容吗？')) {
        inputText.value = '';
        outputText.value = '';
        document.getElementById('inputCount').textContent = '0';
        document.getElementById('outputCount').textContent = '0';
        document.getElementById('uniqueCount').textContent = '0';
        hideMessage();
    }
}

// Swap input and output
function swapInputOutput() {
    const temp = inputText.value;
    inputText.value = outputText.value;
    outputText.value = temp;
    updateStats();
}

// Show message
function showMessage(text, type = 'success') {
    messageEl.textContent = text;
    messageEl.className = `message ${type} show`;

    setTimeout(() => {
        hideMessage();
    }, 3000);
}

// Hide message
function hideMessage() {
    messageEl.classList.remove('show');
}
