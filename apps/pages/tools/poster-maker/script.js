const STORAGE_KEYS = {
    templates: 'poster-workbench.templates',
    recentTemplateIds: 'poster-workbench.recent-template-ids'
};

const OFFICIAL_TEMPLATES = [
    {
        id: 'mall-spring',
        source: 'official',
        category: '活动海报',
        name: '春节商场活动',
        desc: '红金底色、撕边宣纸、节庆装饰，适合商场活动主视觉。',
        tags: ['节庆', '商场', '红金'],
        prompt: '生成一张春节商场活动海报，红金节庆风，带宣纸、灯笼、花朵和放射状底纹，突出商场活动主视觉，画面精致高级，适合商业传播。'
    },
    {
        id: 'brand-pop',
        source: 'official',
        category: '品牌宣传',
        name: '品牌快闪活动',
        desc: '更现代的品牌活动风，适合快闪与联名主题。',
        tags: ['品牌', '快闪', '现代'],
        prompt: '生成一张品牌快闪活动海报，现代商业视觉，高对比构图，主标题醒目，适合线下活动传播。'
    },
    {
        id: 'sale',
        source: 'official',
        category: '促销海报',
        name: '节日促销海报',
        desc: '价格信息更突出，适合活动与优惠券传播。',
        tags: ['促销', '优惠', '活动'],
        prompt: '生成一张节日促销海报，突出优惠信息、时间和地点，画面热闹但保持信息清晰。'
    }
];

const FALLBACK_POSTER = {
    title: '春季\n莺歌舞',
    subtitle: '看表演，拍照打卡',
    time: '4.2 16:00-19:00',
    location: '湖贝里广场',
    benefit: '关注湖贝里小红书，可以获取商场优惠券',
    brand: 'HooBei 湖贝里'
};

const DEMO_VARIANTS = [
    {
        label: '方案 1',
        title: '春季莺歌舞 - 主KV',
        prompt: '保留红金商场活动风，主标题更厚重，中部主视觉突出舞狮和人流氛围。',
        note: '主视觉更集中，适合作为默认展示版本。',
        seed: 1
    },
    {
        label: '方案 2',
        title: '春季莺歌舞 - 字重强化',
        prompt: '保持整体版式不变，强化标题体量，增加金色描边与节庆灯笼。',
        note: '标题力量感更强，适合活动预热传播。',
        seed: 2
    },
    {
        label: '方案 3',
        title: '春季莺歌舞 - 福利信息版',
        prompt: '扩大底部福利区，突出时间、地点和优惠券信息，整体更像商场活动页。',
        note: '信息层级更完整，适合落地活动传播。',
        seed: 3
    }
];

const chatList = document.getElementById('chatList');
const promptInput = document.getElementById('promptInput');
const posterPreview = document.getElementById('posterPreview');
const versionStrip = document.getElementById('versionStrip');
const recentStrip = document.getElementById('recentStrip');
const templateList = document.getElementById('templateList');
const canvasTitle = document.getElementById('canvasTitle');
const modeBadge = document.getElementById('modeBadge');
const selectionBadge = document.getElementById('selectionBadge');
const selectionBox = document.getElementById('selectionBox');
const selectionLabel = document.getElementById('selectionLabel');
const selectionToolbar = document.getElementById('selectionToolbar');
const stageHint = document.getElementById('stageHint');
const referenceInput = document.getElementById('referenceInput');
const sendBtn = document.getElementById('sendBtn');
const templateDrawer = document.getElementById('templateDrawer');
const closeTemplateDrawerBtn = document.getElementById('closeTemplateDrawerBtn');
const footerPrompt = document.getElementById('footerPrompt');
const seedResetBtn = document.getElementById('seedResetBtn');

let currentTab = 'official';
let currentTool = 'smart';
let currentVariant = 0;
let currentPrompt = OFFICIAL_TEMPLATES[0].prompt;
let currentVersions = [];
let recentItems = [];
let recentTemplateIds = [];
let myTemplates = [];
let referenceImageData = '';
let referenceImageName = '';
let currentSelection = '中部主视觉';
let generationCounter = 1;
let isGenerating = false;
let compareTimer = null;
let compareActive = false;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function safeJsonParse(value, fallback) {
    if (!value) return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed == null ? fallback : parsed;
    } catch {
        return fallback;
    }
}

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function loadState() {
    myTemplates = ensureArray(safeJsonParse(localStorage.getItem(STORAGE_KEYS.templates), []));
    recentTemplateIds = ensureArray(safeJsonParse(localStorage.getItem(STORAGE_KEYS.recentTemplateIds), []));
}

function persistTemplates() {
    localStorage.setItem(STORAGE_KEYS.templates, JSON.stringify(myTemplates));
}

function persistRecentTemplates() {
    localStorage.setItem(STORAGE_KEYS.recentTemplateIds, JSON.stringify(recentTemplateIds));
}

function getAllTemplates() {
    return OFFICIAL_TEMPLATES.concat(ensureArray(myTemplates));
}

function getTemplatesByTab(tab) {
    const all = getAllTemplates();
    if (tab === 'official') return all.filter((item) => item.source === 'official');
    if (tab === 'mine') return all.filter((item) => item.source === 'mine');
    return ensureArray(recentTemplateIds)
        .map((id) => all.find((item) => item.id === id))
        .filter(Boolean);
}

function rememberTemplateUse(templateId) {
    recentTemplateIds = [templateId]
        .concat(recentTemplateIds.filter((id) => id !== templateId))
        .slice(0, 12);
    persistRecentTemplates();
}

function updateFooterPrompt(text) {
    footerPrompt.textContent = text || '标题更大、增加灯笼、背景更像商场活动主视觉';
}

function buildVisualCard(version) {
    if (!version) return '';
    return `
        <div class="chat-visual">
            <img class="chat-thumb" src="${version.image}" alt="${escapeHtml(version.label)}">
            <span class="chat-caption">${escapeHtml(version.label)} · ${escapeHtml(version.note || version.title || '')}</span>
        </div>
    `;
}

function pushChat(role, text, version) {
    const node = document.createElement('article');
    node.className = `chat-message ${role}`;
    node.innerHTML = `
        <span class="chat-role">${role === 'user' ? '你' : 'AI'}</span>
        <p class="chat-bubble">${escapeHtml(text)}</p>
        ${buildVisualCard(version)}
    `;
    chatList.prepend(node);
}

function toggleTemplateDrawer(forceOpen) {
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : templateDrawer.hidden;
    templateDrawer.hidden = !shouldOpen;
}

function stopCompareMode() {
    if (compareTimer) {
        window.clearInterval(compareTimer);
        compareTimer = null;
    }
    compareActive = false;
    const button = document.getElementById('compareBtn');
    if (button) button.textContent = '前后对比';
    applyVersion(currentVariant, { preserveCompare: true });
}

function renderTemplates() {
    const list = getTemplatesByTab(currentTab);
    if (!list.length) {
        templateList.innerHTML = '<article class="template-card"><h3>暂无模板</h3><p>你可以把当前提示词存为模板，后续快速复用。</p></article>';
        return;
    }

    templateList.innerHTML = list.map((item) => `
        <article class="template-card">
            <div class="template-title-row">
                <div>
                    <h3>${escapeHtml(item.name)}</h3>
                    <p class="template-category">${escapeHtml(item.category || '未分类')}</p>
                </div>
                <div class="template-actions top-actions">
                    ${item.source === 'mine' ? `<button type="button" data-edit-template="${item.id}">编辑</button><button type="button" data-delete-template="${item.id}">删除</button>` : ''}
                </div>
            </div>
            <p>${escapeHtml(item.desc)}</p>
            <div class="template-meta">
                <div class="template-tags">${ensureArray(item.tags).map((tag) => `<span class="template-tag">${escapeHtml(tag)}</span>`).join('')}</div>
                <div class="template-actions"><button type="button" data-template-id="${item.id}">套用</button></div>
            </div>
        </article>
    `).join('');
}

function renderVersions() {
    versionStrip.innerHTML = currentVersions.map((item, index) => `
        <button class="version-card ${index === currentVariant ? 'active' : ''}" type="button" data-version-index="${index}">
            <img src="${item.image}" alt="${escapeHtml(item.label)}">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.title)}</span>
        </button>
    `).join('');

    recentStrip.innerHTML = recentItems.slice(0, 6).map((item) => `
        <button class="recent-card" type="button" data-version-id="${item.id}">
            <img src="${item.image}" alt="${escapeHtml(item.label)}">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.source === 'seed' ? '演示版本' : item.source === 'server' ? '后端生成' : item.source === 'direct' ? '直连生成' : '本地兜底')}</span>
        </button>
    `).join('');
}

function findVersionIndexById(versionId) {
    return currentVersions.findIndex((item) => item.id === versionId);
}

function applyVersion(index, options = {}) {
    const active = currentVersions[index];
    if (!active) return;
    if (!options.preserveCompare) stopCompareMode();
    currentVariant = index;
    posterPreview.src = active.image;
    canvasTitle.textContent = active.title;
    updateFooterPrompt(active.prompt);
    renderVersions();
}

function createVersion({ label, title, prompt, image, source, note }) {
    return {
        id: `v-${Date.now()}-${generationCounter++}`,
        label,
        title,
        prompt,
        image,
        source,
        note
    };
}

function addVersion(image, prompt, source) {
    const version = createVersion({
        label: `方案 ${generationCounter}`,
        title: `当前版本 ${generationCounter}`,
        prompt,
        image,
        source,
        note: '最新生成结果'
    });
    currentVersions.unshift(version);
    recentItems = [version].concat(recentItems.filter((item) => item.id !== version.id)).slice(0, 8);
    renderVersions();
    applyVersion(0, { preserveCompare: true });
    return version;
}

function wrapText(text, maxChars) {
    const rows = [];
    let line = '';
    for (const char of text) {
        line += char;
        if (line.length >= maxChars) {
            rows.push(line);
            line = '';
        }
    }
    if (line) rows.push(line);
    return rows.length ? rows.slice(0, 4) : ['春季', '莺歌舞'];
}

function buildFallbackSvg(seed) {
    const titleLines = wrapText(FALLBACK_POSTER.title, 4);
    const benefitLines = wrapText(FALLBACK_POSTER.benefit, 12).slice(0, 3);
    const palettes = [
        { top: '#d1132a', bottom: '#951420', ring: '#ef5858', wave: '#ffc5a3', paper: '#fff6da' },
        { top: '#c41c2d', bottom: '#7d0917', ring: '#f16a69', wave: '#ffd0b4', paper: '#fff1d5' },
        { top: '#d85626', bottom: '#8a230e', ring: '#f09a61', wave: '#ffe0aa', paper: '#fff3db' },
        { top: '#cb1f1d', bottom: '#7a1515', ring: '#f56256', wave: '#ffd5b7', paper: '#fff5dd' }
    ][seed % 4];
    const titleSvg = titleLines.map((line, index) => `<text x="132" y="${170 + index * 84}" font-size="72" font-weight="900" fill="#111">${escapeXml(line)}</text>`).join('');
    const benefitSvg = benefitLines.map((line, index) => `<text x="160" y="${620 + index * 34}" font-size="20" font-weight="700" fill="#111">${escapeXml(line)}</text>`).join('');

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="640" y2="800">
      <stop stop-color="${palettes.top}"/>
      <stop offset="1" stop-color="${palettes.bottom}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="800" rx="34" fill="url(#bg)"/>
  <g opacity="0.18" stroke="${palettes.ring}" stroke-width="18">
    <circle cx="325" cy="238" r="126"/>
    <circle cx="124" cy="514" r="160"/>
    <circle cx="516" cy="542" r="192"/>
  </g>
  <g opacity="0.22" stroke="${palettes.wave}" stroke-width="8">
    <path d="M0 296C118 208 200 214 296 280C412 360 502 348 640 256"/>
    <path d="M0 568C112 470 236 442 350 494C468 548 548 564 640 510"/>
  </g>
  <circle cx="514" cy="170" r="42" fill="#F8D47E" opacity="0.86"/>
  <circle cx="536" cy="252" r="16" fill="#F8D47E" opacity="0.72"/>
  <circle cx="478" cy="246" r="12" fill="#FFF1B3" opacity="0.82"/>
  <path d="M104 92L474 92L452 182L530 182L506 718L138 718L114 592L150 468L120 338L138 236L104 92Z" fill="${palettes.paper}"/>
  <text x="28" y="44" font-size="18" fill="#FFF6DA">AI 海报工作台</text>
  <text x="28" y="64" font-size="16" fill="#FFF6DA">${escapeXml(FALLBACK_POSTER.brand)}</text>
  ${titleSvg}
  <text x="128" y="432" font-size="30" font-weight="700" fill="#161616">${escapeXml(FALLBACK_POSTER.subtitle)}</text>
  <rect x="148" y="470" width="88" height="34" rx="16" fill="#D71A2A"/>
  <text x="172" y="494" font-size="22" font-weight="700" fill="#FFF4DE">时间</text>
  <text x="148" y="554" font-size="42" font-weight="800" fill="#111">${escapeXml(FALLBACK_POSTER.time)}</text>
  <text x="148" y="610" font-size="26" font-weight="700" fill="#D71A2A">地点：${escapeXml(FALLBACK_POSTER.location)}</text>
  <rect x="148" y="648" width="76" height="34" rx="16" fill="#D71A2A"/>
  <text x="172" y="672" font-size="22" font-weight="700" fill="#FFF4DE">福利</text>
  ${benefitSvg}
</svg>`.trim();
}

function getSelectionInstruction() {
    if (currentTool === 'repaint') return `仅修改当前选区（${currentSelection}），保持其它区域不变。`;
    if (currentTool === 'erase') return `仅处理当前选区（${currentSelection}），执行擦除或弱化处理，保持其它区域不变。`;
    if (currentTool === 'outpaint') return '在保持主体不变的前提下，向画面边缘扩展背景和装饰。';
    if (currentTool === 'enhance') return '保持构图不变，提升细节清晰度与画面质感。';
    return '在当前整张海报基础上继续优化。';
}

function buildGenerationPrompt(text) {
    const selectionInstruction = getSelectionInstruction();
    const referenceInstruction = referenceImageData
        ? '请参考用户上传参考图的构图和氛围，但生成一张新的完整海报。'
        : '';
    return [text, `编辑要求：${selectionInstruction}`, referenceInstruction].filter(Boolean).join('\n\n');
}

function setGeneratingState(generating, message) {
    isGenerating = generating;
    sendBtn.disabled = generating;
    sendBtn.textContent = generating ? '生成中' : '发送';
    stageHint.textContent = message;
}

async function fetchServerGeneration(prompt) {
    const response = await fetch('/api/generate-meme/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt,
            size: '1024x1536',
            quality: 'medium',
            referenceImage: referenceImageData || '',
            mode: 'poster'
        })
    });

    let data = {};
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data?.details?.error?.message || data?.error || `服务端生成失败: ${response.status}`);
    }
    if (!data.imageUrl) {
        throw new Error('服务端未返回图片');
    }
    return data.imageUrl;
}

async function generatePoster(prompt) {
    const imageUrl = await fetchServerGeneration(prompt);
    return { imageUrl, source: 'server' };
}

function generateFallbackPoster(seed = generationCounter) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(buildFallbackSvg(seed))}`;
}

async function sendPrompt(text) {
    if (!text || isGenerating) return;
    stopCompareMode();
    const finalPrompt = buildGenerationPrompt(text);
    const displayText = currentTool === 'smart' ? text : `${text}（作用于${currentSelection}）`;
    currentPrompt = text;
    updateFooterPrompt(text);
    pushChat('user', displayText);
    setGeneratingState(true, '正在调用 AI 生成海报，请稍候...');

    try {
        const result = await generatePoster(finalPrompt);
        const version = addVersion(result.imageUrl, finalPrompt, result.source);
        version.note = result.source === 'server' ? '后端 AI 已生成' : '直连 AI 已生成';
        pushChat('assistant', '新版本已生成，你可以继续追改、切换工具或保存为模板。', version);
        setGeneratingState(false, '已完成生成，可继续在左侧输入修改要求');
    } catch (error) {
        const fallbackImage = generateFallbackPoster();
        const version = addVersion(fallbackImage, finalPrompt, 'fallback');
        version.note = 'AI 接口异常，已切换本地演示图';
        pushChat('assistant', `AI 接口当前不可用，先给你一张本地演示图继续走流程：${error.message}`, version);
        setGeneratingState(false, 'AI 接口不可用，当前显示演示图');
    }
}

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-action[data-tool]').forEach((button) => {
        button.classList.toggle('active', button.dataset.tool === tool);
    });

    const modeMap = {
        smart: '当前模式：智能编辑',
        repaint: '当前模式：区域重绘',
        outpaint: '当前模式：扩图',
        erase: '当前模式：擦除',
        enhance: '当前模式：变清晰'
    };
    modeBadge.textContent = modeMap[tool] || '当前模式：智能编辑';

    const hasSelection = tool === 'repaint' || tool === 'erase';
    selectionBox.hidden = !hasSelection;
    selectionToolbar.hidden = !hasSelection;
    selectionLabel.textContent = currentSelection;
    selectionBadge.textContent = hasSelection ? `已选区：${currentSelection}` : '未选区';
}

function askTemplateFields(initial = {}) {
    const name = window.prompt('模板名称：', initial.name || '我保存的模板');
    if (!name) return null;
    const category = window.prompt('模板分类：', initial.category || '自定义模板');
    if (!category) return null;
    const desc = window.prompt('模板描述：', initial.desc || '来自当前提示词的可复用模板');
    if (!desc) return null;
    const tagsInput = window.prompt('模板标签（用逗号分隔）：', ensureArray(initial.tags).join(',') || '我的,Prompt');
    const prompt = window.prompt('模板 Prompt：', initial.prompt || currentPrompt);
    if (!prompt) return null;
    return {
        name: name.trim(),
        category: category.trim(),
        desc: desc.trim(),
        tags: String(tagsInput || '我的,Prompt').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 6),
        prompt: prompt.trim()
    };
}

function saveCurrentTemplate() {
    const data = askTemplateFields();
    if (!data) return;
    const template = { id: `mine-${Date.now()}`, source: 'mine', ...data };
    myTemplates.unshift(template);
    persistTemplates();
    rememberTemplateUse(template.id);
    currentTab = 'mine';
    document.querySelectorAll('.template-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === 'mine'));
    renderTemplates();
    pushChat('assistant', '已将当前提示词保存到“我的模板”，下次可以直接一键套用。');
}

function editTemplate(templateId) {
    const index = myTemplates.findIndex((item) => item.id === templateId);
    if (index < 0) return;
    const next = askTemplateFields(myTemplates[index]);
    if (!next) return;
    myTemplates[index] = { ...myTemplates[index], ...next };
    persistTemplates();
    renderTemplates();
    pushChat('assistant', `模板“${next.name}”已更新。`);
}

function deleteTemplate(templateId) {
    const target = myTemplates.find((item) => item.id === templateId);
    if (!target) return;
    if (!window.confirm(`确认删除模板“${target.name}”？`)) return;
    myTemplates = myTemplates.filter((item) => item.id !== templateId);
    recentTemplateIds = recentTemplateIds.filter((id) => id !== templateId);
    persistTemplates();
    persistRecentTemplates();
    renderTemplates();
    pushChat('assistant', `模板“${target.name}”已删除。`);
}

function applyTemplate(templateId) {
    const template = getAllTemplates().find((item) => item.id === templateId);
    if (!template) return;
    rememberTemplateUse(templateId);
    promptInput.value = template.prompt;
    updateFooterPrompt(template.prompt);
    renderTemplates();
    toggleTemplateDrawer(false);
    pushChat('assistant', `已将模板“${template.name}”填入输入框，你可以直接发送或继续微调。`);
}

function downloadCurrent() {
    const active = currentVersions[currentVariant];
    if (!active) return;
    const link = document.createElement('a');
    link.href = active.image;
    link.download = 'poster-workbench-current.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function resetWorkbenchState() {
    stopCompareMode();
    currentVersions = [];
    recentItems = [];
    chatList.innerHTML = '';
    renderVersions();
    posterPreview.removeAttribute('src');
    canvasTitle.textContent = '等待生成';
    updateFooterPrompt('标题更大、增加灯笼、背景更像商场活动主视觉');
}

function seedDemoWorkbench(force = false) {
    if (currentVersions.length && !force) return;
    resetWorkbenchState();
    const seeded = DEMO_VARIANTS.map((item) => createVersion({
        label: item.label,
        title: item.title,
        prompt: item.prompt,
        image: generateFallbackPoster(item.seed),
        source: 'seed',
        note: item.note
    }));
    currentVersions = seeded.slice().reverse();
    recentItems = seeded.slice();
    renderVersions();
    currentVariant = currentVersions.length - 1;
    applyVersion(0, { preserveCompare: true });
    currentPrompt = DEMO_VARIANTS[0].prompt;
    promptInput.value = currentPrompt;
    pushChat('assistant', '我先按豆包图像工作台的结构给你放了三版演示结果，左边可以继续追改，右边可以切版本。', currentVersions[0]);
    pushChat('assistant', '当前界面已支持模板保存、区域编辑、多版本回看和继续生成。');
    setGeneratingState(false, '已载入演示工作台，可直接继续改图或输入新提示词');
}

function readReferenceFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function toggleCompareMode() {
    if (compareActive) {
        stopCompareMode();
        stageHint.textContent = '已退出前后对比，当前展示选中的版本。';
        return;
    }

    if (currentVersions.length < 2) {
        stageHint.textContent = '至少需要两个版本才能前后对比。';
        return;
    }

    const baseIndex = currentVariant;
    const compareIndex = Math.min(baseIndex + 1, currentVersions.length - 1);
    if (compareIndex === baseIndex) {
        stageHint.textContent = '当前没有可对比的上一版。';
        return;
    }

    compareActive = true;
    document.getElementById('compareBtn').textContent = '关闭对比';
    stageHint.textContent = '前后对比中：正在轮播当前版本与上一版本。';
    let toggle = false;
    compareTimer = window.setInterval(() => {
        const version = currentVersions[toggle ? baseIndex : compareIndex];
        posterPreview.src = version.image;
        canvasTitle.textContent = toggle ? `${currentVersions[baseIndex].title}（当前）` : `${currentVersions[compareIndex].title}（对比）`;
        toggle = !toggle;
    }, 1100);
}

function bindStaticEvents() {
    document.querySelectorAll('.template-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            currentTab = tab.dataset.tab;
            document.querySelectorAll('.template-tab').forEach((item) => item.classList.toggle('active', item === tab));
            renderTemplates();
        });
    });

    templateList.addEventListener('click', (event) => {
        const applyButton = event.target.closest('[data-template-id]');
        const editButton = event.target.closest('[data-edit-template]');
        const deleteButton = event.target.closest('[data-delete-template]');
        if (applyButton) return applyTemplate(applyButton.dataset.templateId);
        if (editButton) return editTemplate(editButton.dataset.editTemplate);
        if (deleteButton) return deleteTemplate(deleteButton.dataset.deleteTemplate);
        return null;
    });

    sendBtn.addEventListener('click', async () => {
        const text = promptInput.value.trim();
        promptInput.value = '';
        await sendPrompt(text);
    });

    promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendBtn.click();
        }
    });

    document.querySelectorAll('.quick-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            promptInput.value = chip.dataset.quick;
            updateFooterPrompt(chip.dataset.quick);
        });
    });

    document.querySelectorAll('.tool-action[data-tool]').forEach((button) => {
        button.addEventListener('click', () => setTool(button.dataset.tool));
    });

    document.querySelectorAll('.selection-chip').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.selection-chip').forEach((item) => item.classList.toggle('active', item === button));
            currentSelection = button.dataset.selection;
            selectionLabel.textContent = currentSelection;
            if (!selectionBox.hidden) {
                selectionBadge.textContent = `已选区：${currentSelection}`;
            }
        });
    });

    document.getElementById('clearChatBtn').addEventListener('click', () => {
        resetWorkbenchState();
        pushChat('assistant', '会话已清空。你可以从模板开始，也可以直接描述新的海报需求。');
        promptInput.value = '';
        setGeneratingState(false, '从左侧输入需求，开始新的海报生成');
    });

    document.getElementById('saveTemplateBtn').addEventListener('click', saveCurrentTemplate);
    document.getElementById('insertTemplateBtn').addEventListener('click', () => {
        currentTab = 'official';
        document.querySelectorAll('.template-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === 'official'));
        renderTemplates();
        toggleTemplateDrawer();
    });

    closeTemplateDrawerBtn.addEventListener('click', () => {
        toggleTemplateDrawer(false);
    });

    document.getElementById('downloadBtn').addEventListener('click', downloadCurrent);
    document.getElementById('reuseBtn').addEventListener('click', () => {
        const text = currentPrompt
            ? `${currentPrompt}，基于当前版本继续优化，标题更聚焦，活动氛围更强。`
            : '继续优化当前版本，增强活动氛围。';
        sendPrompt(text);
    });
    document.getElementById('compareBtn').addEventListener('click', toggleCompareMode);
    document.getElementById('videoBtn').addEventListener('click', () => {
        stageHint.textContent = '当前为工作台演示版：后续可接入图生视频能力';
    });
    seedResetBtn.addEventListener('click', () => seedDemoWorkbench(true));

    referenceInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        referenceImageName = file.name;
        referenceImageData = await readReferenceFile(file);
        pushChat('assistant', `已加入参考图：${referenceImageName}。下次生成会把它作为参考描述一起发送。`);
    });

    versionStrip.addEventListener('click', (event) => {
        const button = event.target.closest('[data-version-index]');
        if (!button) return;
        applyVersion(Number(button.dataset.versionIndex));
    });

    recentStrip.addEventListener('click', (event) => {
        const button = event.target.closest('[data-version-id]');
        if (!button) return;
        const index = findVersionIndexById(button.dataset.versionId);
        if (index >= 0) applyVersion(index);
    });
}

function init() {
    loadState();
    renderTemplates();
    bindStaticEvents();
    seedDemoWorkbench();
    setTool('smart');
}

init();
