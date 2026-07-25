# 文案配图（整桌菜或单品）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有内容生成应用中加入一套独立的单图餐饮文案排版功能，并复用火山 API Provider 与现有任务中心。

**Architecture:** 商品换图和文案配图分别维护自己的字段校验、图片顺序、提示词和结果行为。两套功能只共享火山 API 的调用封装与任务中心的创建、完成、失败记录；首期不建设通用百模板运行时。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node.js CommonJS、Node Test Runner、Cloudflare Worker、火山方舟图片生成 API、IndexedDB 本地任务历史。

---

## 文件结构

新增：

- `apps/product-swap/template-packs/product-swap/manifest.js`：现有换图模板的公开信息与字段 schema。
- `apps/product-swap/template-packs/product-swap/prompt.js`：从现有 provider 迁出的换图生成规则。
- `apps/product-swap/template-packs/food-copy-layout/manifest.js`：餐饮文案配图模板信息、字段、快捷指令与默认值。
- `apps/product-swap/template-packs/food-copy-layout/prompt.js`：整桌菜、单品、日期时间、事实约束和定向修改规则。
- `apps/product-swap/server/template-registry.js`：自动发现、校验并加载模板包。
- `apps/product-swap/creator-form.js`：按 schema 渲染字段、收集和校验输入。
- `apps/product-swap/version-history.js`：管理当前创建会话的结果版本与恢复。
- `apps/product-swap/tests/template-registry.test.js`：模板发现、校验和公开目录测试。
- `apps/product-swap/tests/creator-form.test.js`：默认值、表单 payload 和字段错误测试。
- `apps/product-swap/tests/food-copy-prompt.test.js`：首轮和对话修改提示词测试。
- `apps/product-swap/tests/version-history.test.js`：版本增加、选择和恢复测试。

修改：

- `apps/product-swap/templates.js`：移除模板大数组，只保留浏览器目录查询 API。
- `apps/product-swap/build.mjs`：自动生成 `dist/template-catalog.js` 并复制模板公开资源。
- `apps/product-swap/server/dev-server.js`：开发环境提供生成后的模板目录，并按 `templateId` 校验和路由生成策略。
- `apps/product-swap/server/codex-cli-provider.js`：接收已由模板策略构造的 prompt，不再硬编码换图规则。
- `apps/product-swap/create.html`：用通用字段容器替换三个固定上传区，增加版本区和快捷对话区。
- `apps/product-swap/creator-meta.js`：从目录选择 live 模板并初始化 schema 表单。
- `apps/product-swap/script.js`：使用通用表单 payload、模板 ID、日期时间和版本历史。
- `apps/product-swap/index.html`：在目录脚本前加载构建生成的模板数据。
- `apps/product-swap/home.js`：继续使用通用模板目录，不增加餐饮模板专属分支。
- `apps/product-swap/style.css`：增加单图上传、比例选择、开关、快捷指令和版本缩略图样式。
- `apps/product-swap/generation-worker.js`：允许带 `templateId` 的通用 payload。
- `apps/product-swap/tests/template-catalog.test.js`、`creator-contract.test.js`、`frontend-contract.test.js`、`request-validation.test.js`、`codex-cli-provider.test.js`、`build.test.js`：更新现有契约。

### Task 1: 独立模板包与自动目录

**Files:**
- Create: `apps/product-swap/template-packs/product-swap/manifest.js`
- Create: `apps/product-swap/template-packs/product-swap/prompt.js`
- Create: `apps/product-swap/template-packs/food-copy-layout/manifest.js`
- Create: `apps/product-swap/template-packs/food-copy-layout/prompt.js`
- Create: `apps/product-swap/template-packs/summer-seeding/manifest.js`
- Create: `apps/product-swap/template-packs/store-promotion/manifest.js`
- Create: `apps/product-swap/template-packs/before-after/manifest.js`
- Create: `apps/product-swap/server/template-registry.js`
- Create: `apps/product-swap/tests/template-registry.test.js`
- Modify: `apps/product-swap/templates.js`
- Modify: `apps/product-swap/tests/template-catalog.test.js`

- [ ] **Step 1: 写模板自动发现的失败测试**

```js
// tests/template-registry.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    listTemplatePackages,
    getTemplatePackage,
    publicCatalog,
} = require('../server/template-registry');

test('discovers independently packaged templates', () => {
    assert.deepEqual(
        listTemplatePackages().map(({ manifest }) => manifest.id),
        [
            'before-after',
            'food-copy-layout',
            'product-swap',
            'store-promotion',
            'summer-seeding',
        ],
    );
});

test('publishes schema without exposing prompt functions', () => {
    const food = publicCatalog().find(
        (template) => template.id === 'food-copy-layout',
    );

    assert.equal(food.status, 'live');
    assert.equal(food.taskType, 'food_copy_layout');
    assert.deepEqual(
        food.fields.map((field) => field.key),
        ['targetImage', 'aspectRatio', 'showDateTime', 'requirements'],
    );
    assert.equal('prompt' in food, false);
    assert.equal(
        typeof getTemplatePackage('food-copy-layout').buildPrompt,
        'function',
    );
});
```

- [ ] **Step 2: 运行测试并确认因注册器不存在而失败**

Run: `cd apps/product-swap && node --test tests/template-registry.test.js`

Expected: FAIL，错误包含 `Cannot find module '../server/template-registry'`。

- [ ] **Step 3: 创建两个独立 manifest**

```js
// template-packs/food-copy-layout/manifest.js
'use strict';

module.exports = {
    id: 'food-copy-layout',
    taskType: 'food_copy_layout',
    name: '文案配图（整桌菜或单品）',
    summary: '上传一张菜品图，AI 自动写文案并完成社交平台风格排版。',
    category: '种草推荐',
    platforms: ['小红书', '抖音图文'],
    tags: ['美食', '文案', '排版', '探店'],
    status: 'live',
    href: '/create.html?template=food-copy-layout',
    cover: '/assets/example-result.jpg',
    outputLabel: '生成 1 张文案配图',
    creditCost: 3,
    fields: [
        {
            key: 'targetImage',
            type: 'image',
            role: 'target',
            label: '菜品图片',
            required: true,
            accept: ['image/jpeg', 'image/png', 'image/webp'],
        },
        {
            key: 'aspectRatio',
            type: 'choice',
            label: '画布比例',
            required: true,
            default: '3:4',
            options: [
                { value: '3:4', label: '3:4' },
                { value: 'original', label: '原图' },
                { value: '9:16', label: '9:16' },
            ],
        },
        {
            key: 'showDateTime',
            type: 'boolean',
            label: '显示日期时间',
            default: true,
        },
        {
            key: 'requirements',
            type: 'text',
            label: '补充想法',
            required: false,
            maxLength: 200,
            placeholder: '例如：突出分量足，像朋友随手记录',
        },
    ],
    quickPrompts: [
        '文案短一点',
        '换到右上角',
        '字号大一点',
        '改成白底黑字',
        '更像随手分享',
    ],
};
```

```js
// template-packs/product-swap/manifest.js
'use strict';

module.exports = {
    id: 'product-swap',
    taskType: 'product_swap',
    name: '爆款场景同款图',
    summary: '保留参考图的构图，把画面主体替换成你的产品。',
    category: '改造图片',
    platforms: ['小红书', '抖音图文'],
    tags: ['换背景', '产品图', '同款'],
    status: 'live',
    href: '/create.html?template=product-swap',
    cover: '/assets/example-result.jpg',
    outputLabel: '生成 1 张场景图',
    creditCost: 3,
    fields: [
        { key: 'targetImage', type: 'image', role: 'target', label: '目标图（样图模板）', required: true },
        { key: 'productImage', type: 'image', role: 'product', label: '产品图', required: false },
        { key: 'sceneImage', type: 'image', role: 'scene', label: '场景图', required: false },
        { key: 'requirements', type: 'text', label: '额外要求', required: false, maxLength: 200 },
    ],
    quickPrompts: [],
};
```

把现有三个未上线条目也迁为独立 manifest，保留首页目录行为：

```js
// template-packs/summer-seeding/manifest.js
'use strict';
module.exports = {
    id: 'summer-seeding',
    taskType: 'summer_seeding',
    name: '夏日产品种草',
    summary: '生成清爽的夏日产品种草封面。',
    category: '种草推荐',
    platforms: ['小红书'],
    tags: ['夏日', '种草', '产品'],
    status: 'coming_soon',
    href: '',
    cover: '/assets/example-product.jpg',
    outputLabel: '生成 3 张种草图',
    creditCost: 0,
    fields: [],
};
```

```js
// template-packs/store-promotion/manifest.js
'use strict';
module.exports = {
    id: 'store-promotion',
    taskType: 'store_promotion',
    name: '周末到店活动',
    summary: '把门店信息整理成周末活动宣传图。',
    category: '优惠活动',
    platforms: ['小红书', '抖音图文'],
    tags: ['门店', '活动', '周末'],
    status: 'coming_soon',
    href: '',
    cover: '/assets/example-template.jpg',
    outputLabel: '生成活动发布包',
    creditCost: 0,
    fields: [],
};
```

```js
// template-packs/before-after/manifest.js
'use strict';
module.exports = {
    id: 'before-after',
    taskType: 'before_after',
    name: '产品前后对比',
    summary: '用清晰的前后变化展示产品效果。',
    category: '前后对比',
    platforms: ['小红书', '抖音图文'],
    tags: ['对比', '效果', '案例'],
    status: 'coming_soon',
    href: '',
    cover: '/assets/example-result.jpg',
    outputLabel: '生成 1 张对比图',
    creditCost: 0,
    fields: [],
};
```

先提供注册器所需的最小餐饮策略，详细行为在 Task 4 通过独立失败测试扩展：

```js
// template-packs/food-copy-layout/prompt.js
'use strict';

function buildPrompt() {
    return '根据用户上传的菜品图生成一张文案配图，并保存为 result.png。';
}

module.exports = { buildPrompt };
```

将当前 `buildCodexPrompt` 的换图规则原样迁入：

```js
// template-packs/product-swap/prompt.js
'use strict';

const path = require('node:path');

const SKILL_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    'skills',
    'product-swap-image',
    'SKILL.md',
);

function buildPrompt({
    imageRoles,
    hasPreviousImage,
    requirements,
}) {
    const roles = hasPreviousImage
        ? [
            '第一张图是上一版结果，以它作为本轮编辑底图。',
            '第二张图是原始目标模板，只用于校准构图、数量、排列、背景和光线。',
        ]
        : ['第一张图是目标模板，保持其宽高比、镜头、构图、商品数量、排列、背景和光线。'];

    if (imageRoles.includes('product')) {
        roles.push('产品图中的主体和识别特征不得改变。');
    }
    if (imageRoles.includes('scene')) {
        roles.push('场景图只用于环境与氛围参考。');
    }

    return [
        `严格遵循 product-swap-image Skill：${SKILL_PATH}`,
        ...roles,
        '只替换目标模板中的菜品或商品，不增加文字、Logo、水印或额外商品。',
        requirements ? `用户本轮要求：${requirements}` : '',
        '只生成一张结果图并保存为当前工作目录下的 result.png。',
    ].filter(Boolean).join('\n');
}

module.exports = { buildPrompt };
```

- [ ] **Step 4: 实现自动注册器**

```js
// server/template-registry.js
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PACKS_ROOT = path.resolve(__dirname, '..', 'template-packs');
const REQUIRED_KEYS = [
    'id', 'taskType', 'name', 'summary', 'category', 'status',
    'href', 'outputLabel', 'creditCost', 'fields',
];

function validateManifest(manifest, directoryName) {
    for (const key of REQUIRED_KEYS) {
        if (manifest[key] === undefined) {
            throw new Error(`Template ${directoryName} is missing ${key}`);
        }
    }
    if (manifest.id !== directoryName) {
        throw new Error(`Template directory ${directoryName} must match manifest id ${manifest.id}`);
    }
    const keys = manifest.fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
        throw new Error(`Template ${manifest.id} has duplicate field keys`);
    }
    return manifest;
}

function listTemplatePackages() {
    return fs.readdirSync(PACKS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
            const packRoot = path.join(PACKS_ROOT, entry.name);
            const manifest = validateManifest(
                require(path.join(packRoot, 'manifest.js')),
                entry.name,
            );
            const buildPrompt = manifest.status === 'live'
                ? require(path.join(packRoot, 'prompt.js')).buildPrompt
                : null;
            if (manifest.status === 'live' && typeof buildPrompt !== 'function') {
                throw new Error(`Live template ${manifest.id} needs buildPrompt`);
            }
            return { manifest, buildPrompt };
        })
        .sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
}

function getTemplatePackage(id) {
    return listTemplatePackages().find(
        ({ manifest }) => manifest.id === id,
    ) || null;
}

function publicCatalog() {
    return listTemplatePackages().map(({ manifest }) => (
        JSON.parse(JSON.stringify(manifest))
    ));
}

module.exports = {
    validateManifest,
    listTemplatePackages,
    getTemplatePackage,
    publicCatalog,
};
```

- [ ] **Step 5: 让浏览器目录模块只查询注入的数据**

```js
// templates.js
(function (global) {
    const templates = Array.isArray(global.__TEMPLATE_CATALOG__)
        ? global.__TEMPLATE_CATALOG__
        : (
            typeof module !== 'undefined'
                ? require('./server/template-registry').publicCatalog()
                : []
        );

    function normalize(value) {
        return String(value || '').trim().toLocaleLowerCase('zh-CN');
    }

    function getTemplate(id) {
        return templates.find((template) => template.id === id) || null;
    }

    function listTemplates({ category = '' } = {}) {
        return category
            ? templates.filter((template) => template.category === category)
            : templates.slice();
    }

    function searchTemplates(query) {
        const normalized = normalize(query);
        if (!normalized) return listTemplates();
        return templates.filter((template) => [
            template.name,
            template.summary,
            template.category,
            ...template.platforms,
            ...template.tags,
        ].some((value) => normalize(value).includes(normalized)));
    }

    const catalog = { getTemplate, listTemplates, searchTemplates };
    global.ContentTemplates = catalog;
    if (typeof module !== 'undefined' && module.exports) module.exports = catalog;
}(globalThis));
```

- [ ] **Step 6: 运行目录测试**

Run: `cd apps/product-swap && node --test tests/template-registry.test.js tests/template-catalog.test.js`

Expected: PASS，两个 live 模板都能查询，搜索“美食”只返回 `food-copy-layout`。

- [ ] **Step 7: 提交模板包基础**

```bash
git add apps/product-swap/template-packs apps/product-swap/server/template-registry.js apps/product-swap/templates.js apps/product-swap/tests/template-registry.test.js apps/product-swap/tests/template-catalog.test.js
git commit -m "feat: add modular template registry"
```

### Task 2: 构建与开发环境生成公开模板目录

**Files:**
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/server/dev-server.js`
- Modify: `apps/product-swap/index.html`
- Modify: `apps/product-swap/create.html`
- Modify: `apps/product-swap/tests/build.test.js`
- Modify: `apps/product-swap/tests/home-contract.test.js`
- Modify: `apps/product-swap/tests/creator-contract.test.js`

- [ ] **Step 1: 写目录产物的失败测试**

在 `tests/build.test.js` 增加：

```js
test('build emits a browser-safe generated template catalog', async () => {
    const { build } = await import('../build.mjs');
    await build();

    const source = await fs.readFile(
        path.join(appRoot, 'dist', 'template-catalog.js'),
        'utf8',
    );
    assert.match(source, /globalThis\.__TEMPLATE_CATALOG__\s*=/);
    assert.match(source, /food-copy-layout/);
    assert.doesNotMatch(source, /buildPrompt/);
});
```

将同一文件的 `entries.sort()` 期望数组加入 `'template-catalog.js'`。

在首页和创建页契约测试中断言加载顺序：

```js
const catalogScript = html.indexOf('/template-catalog.js');
const templateApiScript = html.indexOf('/templates.js');
assert.ok(catalogScript >= 0);
assert.ok(catalogScript < templateApiScript);
```

- [ ] **Step 2: 运行测试并确认缺少目录产物**

Run: `cd apps/product-swap && node --test tests/build.test.js tests/home-contract.test.js tests/creator-contract.test.js`

Expected: FAIL，错误指出 `dist/template-catalog.js` 不存在或 HTML 未加载该脚本。

- [ ] **Step 3: 在构建阶段生成公开目录**

在 `build.mjs` 中加入：

```js
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { publicCatalog } = require('./server/template-registry');

function browserCatalogSource() {
    return `globalThis.__TEMPLATE_CATALOG__ = ${JSON.stringify(
        publicCatalog(),
        null,
        2,
    )};\n`;
}
```

从 `publicEntries` 删除旧的模板数据产物依赖但继续复制通用 `templates.js`，并在复制结束后写入：

```js
await writeFile(
    path.join(distRoot, 'template-catalog.js'),
    browserCatalogSource(),
    'utf8',
);
```

- [ ] **Step 4: 开发服务器动态返回同一目录**

在 `server/dev-server.js` 的 GET/HEAD 静态分支之前加入：

```js
const { publicCatalog } = require('./template-registry');

function sendTemplateCatalog(response, method = 'GET') {
    const body = `globalThis.__TEMPLATE_CATALOG__ = ${JSON.stringify(
        publicCatalog(),
    )};\n`;
    response.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    response.end(method === 'HEAD' ? '' : body);
}
```

路由：

```js
if (
    pathname === '/template-catalog.js'
    && (request.method === 'GET' || request.method === 'HEAD')
) {
    sendTemplateCatalog(response, request.method);
    return;
}
```

- [ ] **Step 5: 调整两个页面的脚本顺序**

在 `index.html` 与 `create.html` 中确保：

```html
<script src="/template-catalog.js"></script>
<script src="/templates.js"></script>
```

- [ ] **Step 6: 运行构建与契约测试**

Run: `cd apps/product-swap && node --test tests/build.test.js tests/home-contract.test.js tests/creator-contract.test.js`

Expected: PASS，`dist/template-catalog.js` 存在且不暴露服务端 prompt。

- [ ] **Step 7: 提交构建目录**

```bash
git add apps/product-swap/build.mjs apps/product-swap/server/dev-server.js apps/product-swap/index.html apps/product-swap/create.html apps/product-swap/tests/build.test.js apps/product-swap/tests/home-contract.test.js apps/product-swap/tests/creator-contract.test.js
git commit -m "build: generate public template catalog"
```

### Task 3: Schema 驱动的创建表单

**Files:**
- Create: `apps/product-swap/creator-form.js`
- Create: `apps/product-swap/tests/creator-form.test.js`
- Modify: `apps/product-swap/create.html`
- Modify: `apps/product-swap/creator-meta.js`
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build.test.js`
- Modify: `apps/product-swap/tests/creator-contract.test.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`

- [ ] **Step 1: 写默认值与 payload 的失败测试**

```js
// tests/creator-form.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    initialValues,
    buildTemplatePayload,
    validateImageDimensions,
    validateValues,
} = require('../creator-form');
const { getTemplatePackage } = require('../server/template-registry');

const manifest = getTemplatePackage('food-copy-layout').manifest;

test('uses the approved food template defaults', () => {
    assert.deepEqual(initialValues(manifest), {
        targetImage: '',
        aspectRatio: '3:4',
        showDateTime: true,
        requirements: '',
    });
});

test('adds a real generation timestamp when date time is enabled', () => {
    const generatedAt = '2026-07-25T08:16:58.000Z';
    const payload = buildTemplatePayload(
        manifest,
        {
            targetImage: 'data:image/png;base64,aW1hZ2U=',
            aspectRatio: '9:16',
            showDateTime: true,
            requirements: ' 像朋友随手记录 ',
        },
        generatedAt,
    );

    assert.deepEqual(payload, {
        templateId: 'food-copy-layout',
        targetImage: 'data:image/png;base64,aW1hZ2U=',
        aspectRatio: '9:16',
        showDateTime: true,
        generatedAt,
        requirements: '像朋友随手记录',
    });
});

test('rejects a missing required image', () => {
    assert.deepEqual(validateValues(manifest, initialValues(manifest)), {
        field: 'targetImage',
        message: '请上传菜品图片',
    });
});

test('rejects images whose short edge is below 320 pixels', () => {
    assert.deepEqual(validateImageDimensions(1200, 240), {
        code: 'IMAGE_TOO_SMALL',
        message: '图片短边不能小于 320 像素',
    });
    assert.equal(validateImageDimensions(1200, 800), null);
});
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `cd apps/product-swap && node --test tests/creator-form.test.js`

Expected: FAIL，错误包含 `Cannot find module '../creator-form'`。

- [ ] **Step 3: 实现纯表单模型**

```js
// creator-form.js
(function (global) {
    function initialValues(manifest) {
        return Object.fromEntries(manifest.fields.map((field) => [
            field.key,
            field.default ?? (field.type === 'boolean' ? false : ''),
        ]));
    }

    function validateValues(manifest, values) {
        for (const field of manifest.fields) {
            const value = values[field.key];
            if (field.required && !value) {
                return {
                    field: field.key,
                    message: `请${field.type === 'image' ? '上传' : '填写'}${field.label}`,
                };
            }
            if (
                field.maxLength
                && String(value || '').trim().length > field.maxLength
            ) {
                return {
                    field: field.key,
                    message: `${field.label}不能超过 ${field.maxLength} 字`,
                };
            }
        }
        return null;
    }

    function buildTemplatePayload(manifest, values, generatedAt) {
        const payload = { templateId: manifest.id };
        for (const field of manifest.fields) {
            const value = values[field.key];
            payload[field.key] = typeof value === 'string'
                ? value.trim()
                : value;
        }
        if (payload.showDateTime) payload.generatedAt = generatedAt;
        return payload;
    }

    function validateImageDimensions(width, height) {
        return Math.min(Number(width) || 0, Number(height) || 0) < 320
            ? {
                code: 'IMAGE_TOO_SMALL',
                message: '图片短边不能小于 320 像素',
            }
            : null;
    }

    const api = {
        initialValues,
        validateValues,
        buildTemplatePayload,
        validateImageDimensions,
    };
    global.CreatorForm = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));
```

- [ ] **Step 4: 将固定字段 HTML 替换为通用容器**

`create.html` 的生成表单保留错误区和按钮，字段区域改为：

```html
<form id="swapForm" novalidate>
    <div id="templateFields" class="template-fields"></div>
    <p id="formError" class="form-error" role="alert" hidden></p>
    <button id="generateButton" class="generate-button" type="submit">
        生成
    </button>
</form>
```

按以下顺序加载目录、表单渲染和模板元信息，保证 `creator-meta.js` 的 `DOMContentLoaded` 处理先渲染字段，`script.js` 再绑定事件：

```html
<script src="/template-catalog.js"></script>
<script src="/templates.js"></script>
<script src="/creator-form.js"></script>
<script src="/creator-meta.js"></script>
<script src="/api-client.js"></script>
<script src="/local-history.js"></script>
<script src="/script.js"></script>
```

- [ ] **Step 5: 在 creator-meta 中按字段类型渲染控件**

导出并使用 `renderTemplateFields(container, manifest)`。每个控件必须带 `data-field-key`：

```js
function renderTemplateFields(container, manifest) {
    container.replaceChildren();
    for (const field of manifest.fields) {
        const section = document.createElement('section');
        section.className = `template-field template-field-${field.type}`;
        section.dataset.fieldKey = field.key;
        const label = document.createElement('label');
        label.textContent = field.label;
        section.append(label);

        if (field.type === 'image') {
            section.insertAdjacentHTML('beforeend', `
                <input type="file" accept="${(
                    field.accept || ['image/jpeg', 'image/png', 'image/webp']
                ).join(',')}" hidden>
                <button class="upload-box" type="button"><span>点击或拖拽上传</span></button>
                <button class="remove-image" type="button" hidden>删除</button>
            `);
        } else if (field.type === 'choice') {
            const group = document.createElement('div');
            group.className = 'choice-group';
            group.setAttribute('role', 'radiogroup');
            for (const option of field.options) {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.value = option.value;
                button.textContent = option.label;
                button.setAttribute('aria-pressed', String(option.value === field.default));
                group.append(button);
            }
            section.append(group);
        } else if (field.type === 'boolean') {
            section.insertAdjacentHTML('beforeend', `
                <button class="switch-control" type="button" role="switch" aria-checked="${field.default}">
                    <span>${field.default ? '已开启' : '已关闭'}</span>
                </button>
            `);
        } else {
            const textarea = document.createElement('textarea');
            textarea.maxLength = field.maxLength;
            textarea.placeholder = field.placeholder || '';
            section.append(textarea);
        }
        container.append(section);
    }
}
```

- [ ] **Step 6: 让 script.js 从 schema 表单读取状态**

初始化：

```js
const values = window.CreatorForm.initialValues(activeTemplate);
```

使用一个通用绑定器处理上传、拖拽、删除、比例、开关和文本：

```js
function renderImageValue(section, field, value) {
    const box = section.querySelector('.upload-box');
    const remove = section.querySelector('.remove-image');
    box.replaceChildren();
    if (value) {
        const image = document.createElement('img');
        image.src = value;
        image.alt = `${field.label}预览`;
        box.append(image);
        remove.hidden = false;
    } else {
        const hint = document.createElement('span');
        hint.textContent = '点击或拖拽上传';
        box.append(hint);
        remove.hidden = true;
    }
}

async function acceptTemplateImage(section, field, file) {
    const validationError = validateClientFileMeta(file);
    if (validationError) {
        showError(mapErrorCode(validationError.code));
        return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    const dimensions = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({
            width: image.naturalWidth,
            height: image.naturalHeight,
        });
        image.onerror = () => reject(new Error('invalid image'));
        image.src = dataUrl;
    }).catch(() => null);
    if (!dimensions) {
        showError('图片文件损坏，请重新选择');
        return;
    }
    const dimensionError = window.CreatorForm.validateImageDimensions(
        dimensions.width,
        dimensions.height,
    );
    if (dimensionError) {
        showError(dimensionError.message);
        return;
    }
    values[field.key] = dataUrl;
    renderImageValue(section, field, values[field.key]);
    showError('');
}

function bindTemplateFields() {
    for (const field of activeTemplate.fields) {
        const section = document.querySelector(
            `[data-field-key="${field.key}"]`,
        );
        if (field.type === 'image') {
            const input = section.querySelector('input[type="file"]');
            const box = section.querySelector('.upload-box');
            box.addEventListener('click', () => input.click());
            input.addEventListener('change', () => {
                if (input.files[0]) {
                    acceptTemplateImage(section, field, input.files[0]);
                }
            });
            box.addEventListener('dragover', (event) => {
                event.preventDefault();
                box.classList.add('is-dragging');
            });
            box.addEventListener('dragleave', () => {
                box.classList.remove('is-dragging');
            });
            box.addEventListener('drop', (event) => {
                event.preventDefault();
                box.classList.remove('is-dragging');
                if (event.dataTransfer.files[0]) {
                    acceptTemplateImage(
                        section,
                        field,
                        event.dataTransfer.files[0],
                    );
                }
            });
            section.querySelector('.remove-image').addEventListener(
                'click',
                () => {
                    values[field.key] = '';
                    input.value = '';
                    renderImageValue(section, field, '');
                },
            );
        } else if (field.type === 'choice') {
            for (const button of section.querySelectorAll('[data-value]')) {
                button.addEventListener('click', () => {
                    values[field.key] = button.dataset.value;
                    for (const candidate of section.querySelectorAll('[data-value]')) {
                        candidate.setAttribute(
                            'aria-pressed',
                            String(candidate === button),
                        );
                    }
                });
            }
        } else if (field.type === 'boolean') {
            const control = section.querySelector('[role="switch"]');
            control.addEventListener('click', () => {
                values[field.key] = !values[field.key];
                control.setAttribute(
                    'aria-checked',
                    String(values[field.key]),
                );
                control.firstElementChild.textContent = values[field.key]
                    ? '已开启'
                    : '已关闭';
            });
        } else {
            section.querySelector('textarea').addEventListener(
                'input',
                (event) => {
                    values[field.key] = event.currentTarget.value;
                },
            );
        }
    }
}
```

首次生成使用：

```js
const validationError = window.CreatorForm.validateValues(
    activeTemplate,
    values,
);
if (validationError) {
    showError(validationError.message);
    document.querySelector(
        `[data-field-key="${validationError.field}"]`,
    )?.scrollIntoView({ block: 'center' });
    return;
}
const payload = window.CreatorForm.buildTemplatePayload(
    activeTemplate,
    values,
    new Date().toISOString(),
);
```

保存任务时也按 manifest 提取图片，不保留固定三图数组：

```js
const historyImages = activeTemplate.fields
    .filter((field) => field.type === 'image' && payload[field.key])
    .map((field) => ({
        role: field.role,
        source: payload[field.key],
    }));
if (payload.previousImage) {
    historyImages.push({ role: 'previous', source: payload.previousImage });
}
```

`historyInputFromPayload` 保留 `templateId`、`aspectRatio`、`showDateTime`、`generatedAt`、`requirements`、`conversationId` 和最近六条消息，但删除所有值为 Data URL 的字段以及 `previousImage`，避免图片重复写入任务元数据。

对话 payload 继续附加：

```js
{
    ...lastInitialPayload,
    previousImage: state.result,
    conversationId: state.conversationId,
    messages: state.messages.slice(-6),
    requirements: correction,
}
```

- [ ] **Step 7: 将通用表单脚本加入构建**

在 `build.mjs` 的 `publicEntries` 中加入：

```js
'creator-form.js',
```

同时将 `tests/build.test.js` 的构建条目期望数组加入 `'creator-form.js'`。

- [ ] **Step 8: 运行表单与前端契约测试**

Run: `cd apps/product-swap && node --test tests/creator-form.test.js tests/creator-contract.test.js tests/frontend-contract.test.js tests/build.test.js`

Expected: PASS，创建页不再要求固定的 `productInput` 和 `sceneInput`，餐饮模板 payload 带 `templateId`、比例和真实时间。

- [ ] **Step 9: 提交 schema 表单**

```bash
git add apps/product-swap/creator-form.js apps/product-swap/create.html apps/product-swap/creator-meta.js apps/product-swap/script.js apps/product-swap/build.mjs apps/product-swap/tests/creator-form.test.js apps/product-swap/tests/creator-contract.test.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/build.test.js
git commit -m "feat: render creator fields from template schema"
```

### Task 4: 通用服务端校验与模板生成策略

**Files:**
- Modify: `apps/product-swap/template-packs/food-copy-layout/prompt.js`
- Create: `apps/product-swap/tests/food-copy-prompt.test.js`
- Modify: `apps/product-swap/server/dev-server.js`
- Modify: `apps/product-swap/server/codex-cli-provider.js`
- Modify: `apps/product-swap/tests/request-validation.test.js`
- Modify: `apps/product-swap/tests/codex-cli-provider.test.js`

- [ ] **Step 1: 写餐饮 prompt 的失败测试**

```js
// tests/food-copy-prompt.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPrompt } = require(
    '../template-packs/food-copy-layout/prompt',
);

test('initial prompt covers approved copy and layout rules', () => {
    const prompt = buildPrompt({
        hasPreviousImage: false,
        aspectRatio: '3:4',
        showDateTime: true,
        generatedAt: '2026-07-25T08:16:58.000Z',
        requirements: '',
    });

    assert.match(prompt, /整桌菜或单品/);
    assert.match(prompt, /真实随手分享/);
    assert.match(prompt, /2026-07-25/);
    assert.match(prompt, /3:4/);
    assert.match(prompt, /不得编造店名、价格、地点、菜名或食材/);
    assert.match(prompt, /只生成一张/);
});

test('refinement prompt changes only the requested properties', () => {
    const prompt = buildPrompt({
        hasPreviousImage: true,
        aspectRatio: '3:4',
        showDateTime: true,
        generatedAt: '2026-07-25T08:16:58.000Z',
        requirements: '日期改为 7 月 15 日，文案换到右上角',
    });

    assert.match(prompt, /上一版结果/);
    assert.match(prompt, /只修改用户明确指定的内容/);
    assert.match(prompt, /日期改为 7 月 15 日/);
    assert.match(prompt, /未提及部分保持不变/);
});
```

- [ ] **Step 2: 写服务端 schema 校验的失败测试**

在 `tests/request-validation.test.js` 增加：

```js
test('validates food template options from its manifest', () => {
    const value = validateGenerateRequest({
        templateId: 'food-copy-layout',
        targetImage: tinyPng,
        aspectRatio: '3:4',
        showDateTime: true,
        generatedAt: '2026-07-25T08:16:58.000Z',
        requirements: '  像朋友随手记录  ',
    });

    assert.equal(value.template.manifest.id, 'food-copy-layout');
    assert.equal(value.values.aspectRatio, '3:4');
    assert.equal(value.values.requirements, '像朋友随手记录');
});

test('rejects unknown templates and unsupported choices', () => {
    assert.throws(
        () => validateGenerateRequest({
            templateId: 'missing',
            targetImage: tinyPng,
        }),
        (error) => error.code === 'INVALID_TEMPLATE',
    );
    assert.throws(
        () => validateGenerateRequest({
            templateId: 'summer-seeding',
            targetImage: tinyPng,
        }),
        (error) => error.code === 'INVALID_TEMPLATE',
    );
    assert.throws(
        () => validateGenerateRequest({
            templateId: 'food-copy-layout',
            targetImage: tinyPng,
            aspectRatio: '1:1',
            showDateTime: true,
        }),
        (error) => error.code === 'INVALID_INPUT',
    );
});
```

- [ ] **Step 3: 运行测试并确认缺少餐饮策略和通用校验**

Run: `cd apps/product-swap && node --test tests/food-copy-prompt.test.js tests/request-validation.test.js`

Expected: FAIL，餐饮 `prompt.js` 不存在且旧校验结果没有 `template`/`values`。

- [ ] **Step 4: 实现餐饮生成策略**

```js
// template-packs/food-copy-layout/prompt.js
'use strict';

function displayTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(date).map(
            ({ type, value: part }) => [type, part],
        ),
    );
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function buildPrompt({
    hasPreviousImage = false,
    aspectRatio,
    showDateTime,
    generatedAt,
    requirements,
}) {
    const role = hasPreviousImage
        ? '第一张图是上一版结果，第二张图是原始上传图。以上一版为编辑底图，以原图为视觉与事实基准。'
        : '第一张图是用户上传的菜品原图。判断它是整桌菜或单品，并分析主体、留白与背景明暗。';
    return [
        role,
        `输出比例为 ${aspectRatio === 'original' ? '原图比例' : aspectRatio}。优先保留完整菜品，不强行裁切主体。`,
        showDateTime
            ? `默认显示日期时间：${displayTime(generatedAt)}。用户本轮指定其他日期时间时，以用户指令为准。`
            : '默认不显示日期时间，除非用户本轮明确要求。',
        '单品使用日期时间加 2 至 4 行短句；整桌菜使用 4 至 6 行自然用餐感受。',
        '采用真实随手分享语气，优先将白底黑字的轻量文字块放在安全留白处。',
        '文字不得遮挡主要菜品、餐具焦点或人物面部；没有安全留白时扩展画布并使用原图模糊背景填充。',
        '不得编造店名、价格、地点、菜名或食材；不确定时使用“这份”“这一桌”“今天这顿”等表达。',
        hasPreviousImage
            ? '只修改用户明确指定的内容，未提及部分保持不变。'
            : '',
        requirements ? `用户本轮要求：${requirements}` : '',
        '不要添加 Logo 或水印。只生成一张结果图，并保存为当前工作目录下的 result.png。',
    ].filter(Boolean).join('\n');
}

module.exports = { displayTime, buildPrompt };
```

- [ ] **Step 5: 按 manifest 校验请求**

`validateGenerateRequest` 先通过 `getTemplatePackage(body.templateId || 'product-swap')` 解析模板；模板不存在或状态不是 `live` 时抛出 `ProductSwapError('INVALID_TEMPLATE', '模板不可用')`，再逐字段校验：

```js
function validateField(field, rawValue, hasPreviousImage) {
    if (field.type === 'image') {
        if (field.required && !rawValue) {
            throw new ProductSwapError('INVALID_INPUT', `请上传${field.label}`);
        }
        return rawValue ? decodeImageDataUrl(rawValue, field.key) : null;
    }
    if (field.type === 'choice') {
        const allowed = field.options.map((option) => option.value);
        const value = rawValue || field.default;
        if (!allowed.includes(value)) {
            throw new ProductSwapError('INVALID_INPUT', `${field.label}无效`);
        }
        return value;
    }
    if (field.type === 'boolean') {
        const value = rawValue ?? field.default;
        if (typeof value !== 'boolean') {
            throw new ProductSwapError('INVALID_INPUT', `${field.label}无效`);
        }
        return value;
    }
    const value = String(rawValue || '').trim();
    const limit = hasPreviousImage ? 500 : field.maxLength;
    if (limit && value.length > limit) {
        throw new ProductSwapError('INVALID_INPUT', `${field.label}不能超过 ${limit} 字`);
    }
    return value;
}
```

返回：

```js
if (values.showDateTime) {
    const generatedAt = String(
        body.generatedAt || new Date().toISOString(),
    );
    if (Number.isNaN(new Date(generatedAt).getTime())) {
        throw new ProductSwapError('INVALID_INPUT', '日期时间无效');
    }
    values.generatedAt = generatedAt;
}

{
    template,
    values,
    previousImage: body.previousImage
        ? decodeImageDataUrl(body.previousImage, 'previousImage')
        : null,
    messages: Array.isArray(body.messages) ? body.messages.slice(-6) : [],
}
```

- [ ] **Step 6: 让 handleGenerate 路由模板 prompt**

按 manifest 中的图片字段顺序写入文件，上一版始终排在第一张；构造 prompt：

```js
const prompt = input.template.buildPrompt({
    ...input.values,
    hasPreviousImage: Boolean(previousPath),
    imageRoles: imageEntries.map(({ field }) => field.role),
    messages: input.messages,
});

const result = await provider({
    taskDir,
    imagePaths,
    prompt,
    requestId,
});
```

- [ ] **Step 7: 让 Codex provider 只执行已构造的 prompt**

`generateWithCodex` 的签名改为：

```js
async function generateWithCodex({
    taskDir,
    imagePaths,
    prompt,
    timeoutMs = 300000,
    spawnImpl = spawn,
}) {
    if (!String(prompt || '').trim()) {
        const error = new Error('Template prompt is required');
        error.code = 'INVALID_TEMPLATE';
        throw error;
    }
    const args = buildCodexArgs({ taskDir, imagePaths, prompt });
    return runCodexProcess({
        taskDir,
        args,
        timeoutMs,
        spawnImpl,
    });
}
```

将现有进程创建、超时、嵌套调用保护、`result.png` 校验和结果读取代码移入 `runCodexProcess`，其参数严格使用上面传入的 `taskDir`、`args`、`timeoutMs` 与 `spawnImpl`。删除 provider 内的换图角色判断和 `buildCodexPrompt`，对应测试改为验证传入 prompt 原样成为最后一个 CLI 参数。

- [ ] **Step 8: 运行服务端与 prompt 测试**

Run: `cd apps/product-swap && node --test tests/food-copy-prompt.test.js tests/request-validation.test.js tests/codex-cli-provider.test.js`

Expected: PASS，未知模板、非法比例和缺少必填图会失败；两个模板分别使用自己的 prompt。

- [ ] **Step 9: 提交通用生成策略**

```bash
git add apps/product-swap/template-packs/food-copy-layout/prompt.js apps/product-swap/server/dev-server.js apps/product-swap/server/codex-cli-provider.js apps/product-swap/tests/food-copy-prompt.test.js apps/product-swap/tests/request-validation.test.js apps/product-swap/tests/codex-cli-provider.test.js
git commit -m "feat: route generation through template strategies"
```

### Task 5: 结果版本、快捷对话与最小变更

**Files:**
- Create: `apps/product-swap/version-history.js`
- Create: `apps/product-swap/tests/version-history.test.js`
- Modify: `apps/product-swap/create.html`
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/style.css`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build.test.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`

- [ ] **Step 1: 写版本模型的失败测试**

```js
// tests/version-history.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVersionHistory } = require('../version-history');

test('adds, selects and restores generated versions', () => {
    const history = createVersionHistory();
    history.add({ imageUrl: 'first.png', instruction: '首次生成' });
    history.add({ imageUrl: 'second.png', instruction: '换到右上角' });

    assert.equal(history.current().imageUrl, 'second.png');
    assert.equal(history.list().length, 2);
    assert.equal(history.select(0).imageUrl, 'first.png');
    assert.equal(history.restore(0).imageUrl, 'first.png');
    assert.equal(history.list().at(-1).instruction, '恢复版本 1');
});

test('returns copies so callers cannot mutate internal state', () => {
    const history = createVersionHistory();
    history.add({ imageUrl: 'first.png', instruction: '首次生成' });
    const versions = history.list();
    versions[0].imageUrl = 'changed.png';
    assert.equal(history.current().imageUrl, 'first.png');
});
```

- [ ] **Step 2: 运行测试并确认版本模块不存在**

Run: `cd apps/product-swap && node --test tests/version-history.test.js`

Expected: FAIL，错误包含 `Cannot find module '../version-history'`。

- [ ] **Step 3: 实现当前会话版本模型**

```js
// version-history.js
(function (global) {
    function createVersionHistory() {
        const versions = [];
        let selectedIndex = -1;

        function clone(value) {
            return value ? { ...value } : null;
        }
        function add(version) {
            versions.push({ ...version, createdAt: Date.now() });
            selectedIndex = versions.length - 1;
            return clone(versions[selectedIndex]);
        }
        function list() {
            return versions.map(clone);
        }
        function current() {
            return clone(versions[selectedIndex]);
        }
        function select(index) {
            if (!versions[index]) return null;
            selectedIndex = index;
            return current();
        }
        function restore(index) {
            const selected = versions[index];
            if (!selected) return null;
            return add({
                ...selected,
                instruction: `恢复版本 ${index + 1}`,
            });
        }
        return { add, list, current, select, restore };
    }

    const api = { createVersionHistory };
    global.VersionHistory = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));
```

- [ ] **Step 4: 增加版本轨道和快捷指令容器**

在结果图片下方加入：

```html
<div id="versionRail" class="version-rail" aria-label="生成版本"></div>
```

在对话输入框上方加入：

```html
<div id="quickPrompts" class="quick-prompts" aria-label="快捷修改"></div>
```

并在 `script.js` 前加载：

```html
<script src="/version-history.js"></script>
```

- [ ] **Step 5: 将生成结果接入版本模型**

初始化：

```js
const versions = window.VersionHistory.createVersionHistory();
```

首次成功生成：

```js
versions.add({
    imageUrl: data.imageUrl,
    instruction: '首次生成',
});
```

对话成功生成：

```js
versions.add({
    imageUrl: data.imageUrl,
    instruction: correction,
});
```

用以下函数渲染、选择和恢复版本：

```js
function showVersion(version) {
    if (!version) return;
    state.result = version.imageUrl;
    resultImage.src = version.imageUrl;
    renderVersions();
}

function renderVersions() {
    const items = versions.list();
    const current = versions.current();
    versionRail.replaceChildren();

    items.forEach((version, index) => {
        const item = document.createElement('div');
        item.className = 'version-item';

        const selectButton = document.createElement('button');
        selectButton.type = 'button';
        selectButton.setAttribute(
            'aria-label',
            `查看版本 ${index + 1}：${version.instruction}`,
        );
        selectButton.setAttribute(
            'aria-current',
            String(version.createdAt === current?.createdAt),
        );
        const image = document.createElement('img');
        image.src = version.imageUrl;
        image.alt = '';
        selectButton.append(image);
        selectButton.addEventListener('click', () => {
            showVersion(versions.select(index));
        });

        const restoreButton = document.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = 'restore-version';
        restoreButton.textContent = '恢复';
        restoreButton.addEventListener('click', () => {
            showVersion(versions.restore(index));
        });

        item.append(selectButton, restoreButton);
        versionRail.append(item);
    });
}
```

对话的新一轮始终从 `versions.current().imageUrl` 读取 `previousImage`，下载也读取当前版本而非数组最后一项。

- [ ] **Step 6: 渲染模板快捷指令**

```js
function renderQuickPrompts() {
    quickPrompts.replaceChildren();
    for (const prompt of activeTemplate.quickPrompts || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = prompt;
        button.addEventListener('click', () => {
            refineInput.value = [
                refineInput.value.trim(),
                prompt,
            ].filter(Boolean).join('，');
            refineInput.focus();
        });
        quickPrompts.append(button);
    }
}
```

快捷按钮只填充输入，不自动发送。

- [ ] **Step 7: 让下载失败可重试**

将下载按钮事件改为：

```js
async function downloadCurrentVersion() {
    const current = versions.current();
    if (!current?.imageUrl) return;
    try {
        const response = await fetch(current.imageUrl);
        if (!response.ok) throw new Error('download failed');
        const objectUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `${activeTemplate.id}-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(objectUrl);
    } catch {
        showError('下载失败，请保留当前页面后重试');
    }
}

downloadButton.addEventListener('click', downloadCurrentVersion);
```

- [ ] **Step 8: 增加可访问的版本与快捷指令样式**

```css
.quick-prompts,
.version-rail {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: thin;
}

.quick-prompts button {
    flex: 0 0 auto;
    min-height: 36px;
    padding: 8px 12px;
    border: 1px solid #e7ddd2;
    border-radius: 999px;
    background: #fffaf4;
    color: #6c4634;
}

.version-rail button {
    width: 72px;
    height: 96px;
    padding: 0;
    overflow: hidden;
    border: 2px solid transparent;
    border-radius: 12px;
}

.version-rail button[aria-current="true"] {
    border-color: #c63d48;
}

.version-rail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
```

- [ ] **Step 9: 将版本脚本加入构建**

在 `build.mjs` 的 `publicEntries` 中加入：

```js
'version-history.js',
```

同时将 `tests/build.test.js` 的构建条目期望数组加入 `'version-history.js'`。

- [ ] **Step 10: 运行版本和前端契约测试**

Run: `cd apps/product-swap && node --test tests/version-history.test.js tests/frontend-contract.test.js tests/build.test.js`

Expected: PASS，结果页存在版本轨道，快捷按钮只填写输入，恢复版本会成为当前对话底图。

- [ ] **Step 11: 提交版本对话功能**

```bash
git add apps/product-swap/version-history.js apps/product-swap/create.html apps/product-swap/script.js apps/product-swap/style.css apps/product-swap/build.mjs apps/product-swap/tests/version-history.test.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/build.test.js
git commit -m "feat: add conversational result versions"
```

### Task 6: 页面视觉、首页入口与响应式验收

**Files:**
- Modify: `apps/product-swap/style.css`
- Modify: `apps/product-swap/tests/home-contract.test.js`
- Modify: `apps/product-swap/tests/creator-contract.test.js`
- Modify: `apps/product-swap/tests/responsive-contract.test.js`

- [ ] **Step 1: 写餐饮模板入口与控件视觉契约的失败测试**

增加断言：

```js
const { getTemplate } = require('../templates');
const template = getTemplate('food-copy-layout');
assert.equal(template.status, 'live');
assert.equal(template.href, '/create.html?template=food-copy-layout');
assert.equal(template.outputLabel, '生成 1 张文案配图');

const css = fs.readFileSync(path.join(appRoot, 'style.css'), 'utf8');
assert.match(css, /\.choice-group/);
assert.match(css, /\.switch-control/);
assert.match(css, /\.template-field-image/);
assert.match(css, /@media\s*\(max-width:\s*640px\)/);
```

- [ ] **Step 2: 运行契约测试并确认缺少新控件样式**

Run: `cd apps/product-swap && node --test tests/home-contract.test.js tests/creator-contract.test.js tests/responsive-contract.test.js`

Expected: FAIL，缺少选择组、开关或单图上传响应式规则。

- [ ] **Step 3: 完成创建页首屏**

视觉要求：

- 页面标题和摘要由当前模板填充；
- 餐饮模板的首屏重点是大尺寸单图上传区；
- 上传后显示 3:4 预览但不裁掉原图内容；
- 比例按钮位于上传区下方，同一行可横向滚动；
- 日期时间开关和补充想法保持轻量，不抢主操作；
- 生成按钮固定使用当前模板的输出文案与额度；
- 不显示换图模板的三图公式示例。

关键样式：

```css
.template-field-image .upload-box {
    width: 100%;
    min-height: 280px;
    border: 1.5px dashed #d7c5b5;
    border-radius: 20px;
    background: #fffaf4;
}

.choice-group {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.choice-group button[aria-pressed="true"] {
    border-color: #c63d48;
    background: #fff0f1;
    color: #a62f3b;
}

.switch-control[aria-checked="true"] {
    background: #c63d48;
    color: #fff;
}

body[data-template-id="food-copy-layout"] .example-card {
    display: none;
}

@media (max-width: 640px) {
    .product-swap-shell {
        padding-inline: 16px;
    }
    .template-field-image .upload-box {
        min-height: 220px;
    }
}
```

- [ ] **Step 4: 确认首页由目录自然渲染新卡片**

在 `tests/home-contract.test.js` 中验证首页仍完全由目录驱动：

```js
const catalog = require('../templates');
const { templateCardModel } = require('../home');
const cards = catalog.listTemplates().map(templateCardModel);
assert.ok(cards.some(
    (card) => card.href === '/create.html?template=food-copy-layout',
));

const source = fs.readFileSync(path.join(appRoot, 'home.js'), 'utf8');
assert.doesNotMatch(source, /food-copy-layout/);
```

同时断言 `catalog.searchTemplates('美食')`、`catalog.searchTemplates('文案')` 和 `catalog.searchTemplates('排版')` 都包含 `food-copy-layout`。

- [ ] **Step 5: 运行页面契约测试**

Run: `cd apps/product-swap && node --test tests/home-contract.test.js tests/creator-contract.test.js tests/responsive-contract.test.js`

Expected: PASS，桌面和 640px 以下布局都有明确规则。

- [ ] **Step 6: 提交页面视觉**

```bash
git add apps/product-swap/style.css apps/product-swap/tests/home-contract.test.js apps/product-swap/tests/creator-contract.test.js apps/product-swap/tests/responsive-contract.test.js
git commit -m "feat: present food copy layout creator"
```

### Task 7: 后台生成、构建与完整回归

**Files:**
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/generation-worker.js`
- Modify: `apps/product-swap/tests/generation-worker.test.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`
- Modify: `apps/product-swap/tests/browser-smoke.js`

- [ ] **Step 1: 写后台消息的模板 ID 失败测试**

在 `tests/generation-worker.test.js` 中增加：

```js
test('accepts a versioned template generation message', () => {
    assert.equal(isGenerationMessage({
        type: 'product-swap:start',
        version: 2,
        taskId: 'task_food_1',
        apiUrl: 'http://127.0.0.1:8791/api/product-swap/generate',
        payload: {
            templateId: 'food-copy-layout',
            targetImage: 'data:image/png;base64,aW1hZ2U=',
            aspectRatio: '3:4',
            showDateTime: true,
            generatedAt: '2026-07-25T08:16:58.000Z',
        },
    }, 'http://127.0.0.1:8791'), true);
});

test('rejects background payloads without a template id', () => {
    assert.equal(isGenerationMessage({
        type: 'product-swap:start',
        version: 2,
        taskId: 'task_food_1',
        apiUrl: 'http://127.0.0.1:8791/api/product-swap/generate',
        payload: { targetImage: 'data:image/png;base64,aW1hZ2U=' },
    }, 'http://127.0.0.1:8791'), false);
});
```

- [ ] **Step 2: 运行 worker 测试并确认新消息版本失败**

Run: `cd apps/product-swap && node --test tests/generation-worker.test.js`

Expected: FAIL，旧 worker 只接受 version 1 且不校验 `templateId`。

- [ ] **Step 3: 升级后台消息契约**

在 `script.js` 的 `createGenerationMessage` 与 `generation-worker.js` 同时升级到 version 2，并要求：

```js
value.version === 2
&& typeof value.payload.templateId === 'string'
&& Object.entries(value.payload).some(
    ([key, fieldValue]) => key.endsWith('Image')
        && typeof fieldValue === 'string',
)
```

同步把 `tests/frontend-contract.test.js` 中的后台消息期望更新为 `version: 2`，并在测试 payload 中加入 `templateId: 'product-swap'`。

旧的已保存 version 1 消息不会在 IndexedDB 中持久化，因此无需兼容历史消息；任务恢复仍通过现有任务记录完成。

- [ ] **Step 4: 扩展浏览器冒烟路径**

`tests/browser-smoke.js` 增加以下只读和本地交互检查：

```js
await page.goto(`${appUrl}/create.html?template=food-copy-layout`, {
    waitUntil: 'networkidle0',
});
await page.waitForSelector('[data-field-key="targetImage"]');
const selectedRatio = await page.$eval(
    '[data-field-key="aspectRatio"] [aria-pressed="true"]',
    (element) => element.textContent.trim(),
);
const dateTimeEnabled = await page.$eval(
    '[data-field-key="showDateTime"] [role="switch"]',
    (element) => element.getAttribute('aria-checked'),
);
const productFields = await page.$$(
    '[data-field-key="productImage"]',
);
if (selectedRatio !== '3:4') {
    throw new Error(`expected 3:4 default, received ${selectedRatio}`);
}
if (dateTimeEnabled !== 'true') {
    throw new Error('date time must default to enabled');
}
if (productFields.length !== 0) {
    throw new Error('food creator must expose only one image field');
}

const foodInput = await page.$(
    '[data-field-key="targetImage"] input[type="file"]',
);
await foodInput.uploadFile(targetPath);
await page.waitForSelector(
    '[data-field-key="targetImage"] .upload-box img',
);
await page.click('#generateButton');
await page.waitForSelector('#resultSection:not([hidden])');
await page.waitForSelector('#versionRail .version-item');

await page.click('#quickPrompts button');
const quickValue = await page.$eval(
    '#refineInput',
    (element) => element.value,
);
if (!quickValue) {
    throw new Error('quick prompt must fill the refinement input');
}
await page.click('#refineButton');
await page.waitForFunction(
    () => document.querySelectorAll(
        '#versionRail .version-item',
    ).length === 2,
);
```

- [ ] **Step 5: 运行完整自动化测试**

Run: `cd apps/product-swap && npm test`

Expected: PASS，所有 Node 测试 0 failures。

- [ ] **Step 6: 运行生产构建**

Run: `cd apps/product-swap && npm run build`

Expected: exit 0，输出 `Product Swap static assets built in dist/`，`dist/template-catalog.js` 包含两个 live 模板。

- [ ] **Step 7: 运行浏览器冒烟测试**

先启动开发服务：

Run: `cd apps/product-swap && npm run dev`

Expected: 输出 `Product Swap running at http://127.0.0.1:8791`。

在另一终端运行：

Run: `cd apps/product-swap && npm run test:browser`

Expected: exit 0；首页能发现新模板，创建页只有一个图片上传区，默认比例为 3:4，日期时间开关开启。

- [ ] **Step 8: 检查最终差异与编码**

Run: `git diff --check && git status --short`

Expected: `git diff --check` 无输出；只显示本计划内文件，源文件保持 UTF-8，页面中文没有新增乱码。

- [ ] **Step 9: 提交完整回归**

```bash
git add apps/product-swap/script.js apps/product-swap/generation-worker.js apps/product-swap/tests/generation-worker.test.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/browser-smoke.js
git commit -m "test: cover food copy layout workflow"
```

## 最终验收清单

- [ ] 新模板在首页可搜索、可进入。
- [ ] 创建页只有一张必填菜品图。
- [ ] 3:4 默认选中，原图和 9:16 可切换。
- [ ] 日期时间默认使用 Asia/Shanghai 当天当前时间。
- [ ] 对话指定日期时间能覆盖默认值。
- [ ] 单品默认 2 至 4 行短文案，整桌菜默认 4 至 6 行。
- [ ] Prompt 明确禁止编造事实并保护主要菜品、餐具焦点和人物面部。
- [ ] 每次只生成一张图。
- [ ] 下载、重新生成、快捷指令、版本选择和版本恢复可用。
- [ ] 对话修改使用当前选中版本，并遵循最小变更原则。
- [ ] 失败重试不清空表单。
- [ ] 模板以独立包接入，浏览器目录不暴露服务端 prompt。
- [ ] `npm test`、`npm run build` 和 `npm run test:browser` 全部通过。
