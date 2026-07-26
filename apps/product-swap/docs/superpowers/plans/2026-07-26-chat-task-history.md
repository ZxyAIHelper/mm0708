# 微信聊天模板通用任务记录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让微信聊天模板每次 AI 生成都通过通用本地任务生命周期写入“作品”，并保存全部截图输出。

**Architecture:** `script.js` 为独立编辑器注入 `start / complete / fail` 生命周期适配器，`wechat-chat-editor.js` 只编排生成状态，不直接访问 IndexedDB。`local-history.js` 在兼容单图调用的基础上支持 Blob 多输出，第一张输出作为列表预览。

**Tech Stack:** 浏览器 JavaScript、IndexedDB、Node.js `node:test`、Puppeteer 请求拦截。

---

### Task 1: 扩展本地任务仓库的多输出能力

**Files:**
- Modify: `apps/product-swap/local-history.js`
- Test: `apps/product-swap/tests/local-history.test.js`

- [ ] **Step 1: 写 Blob 输入与多输出的失败测试**

在 `local-history.test.js` 增加纯函数测试，要求 `assetFromSource` 接受 Blob，并要求输出规范化兼容旧的单图结果：

```js
test('creates a persisted asset directly from a Blob', () => {
    const source = new Blob(['page'], { type: 'image/png' });
    const asset = history.assetFromSource(
        'task_1',
        'output',
        source,
        100,
    );

    assert.equal(asset.blob, source);
    assert.equal(asset.sourceUrl, '');
    assert.equal(asset.contentType, 'image/png');
    assert.equal(asset.byteSize, 4);
});

test('normalizes explicit multi-page outputs and legacy imageUrl', () => {
    const one = new Blob(['one'], { type: 'image/png' });
    const two = new Blob(['two'], { type: 'image/png' });

    assert.deepEqual(history.outputSources(
        { imageUrl: 'https://example.com/legacy.png' },
    ), ['https://example.com/legacy.png']);
    assert.deepEqual(history.outputSources(
        { imageUrl: '' },
        [one, two],
    ), [one, two]);
});

test('keeps multi-page output assets in page order', () => {
    const assets = history.sortTaskAssets([
        { id: 'page-2', role: 'output', order: 1 },
        { id: 'page-1', role: 'output', order: 0 },
    ]);

    assert.deepEqual(assets.map(({ id }) => id), [
        'page-1',
        'page-2',
    ]);
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```powershell
node --test tests/local-history.test.js
```

Expected: FAIL，`history.assetFromSource` 或 `history.outputSources` 尚未导出。

- [ ] **Step 3: 实现 Blob 与多输出规范化**

在 `local-history.js` 中：

```js
function outputSources(result, outputs) {
    if (Array.isArray(outputs)) {
        return outputs.filter((source) => (
            source instanceof Blob
            || (typeof source === 'string' && source)
        ));
    }
    return result?.imageUrl ? [result.imageUrl] : [];
}
```

扩展 `assetFromSource`，Blob 直接写入资产；字符串继续保持现有 Data URL/URL 行为。把 `completeTask(taskId, result)` 改为 `completeTask(taskId, result, outputs)`，为每个输出创建 `role: 'output'` 的资产并写入稳定 `order`，第一张资产传给 `transitionTaskToCompleted` 作为 `previewAsset`。`assetsForTask` 使用 `sortTaskAssets` 按输出页序返回资产。无第三参数时继续从 `result.imageUrl` 创建单个输出。

导出 `assetFromSource`、`outputSources` 和 `sortTaskAssets` 供测试使用。

- [ ] **Step 4: 运行本地历史测试并确认通过**

Run:

```powershell
node --test tests/local-history.test.js
```

Expected: PASS，新增与既有测试均通过。

- [ ] **Step 5: 提交仓库扩展**

```powershell
git add -- apps/product-swap/local-history.js apps/product-swap/tests/local-history.test.js
git commit -m "feat(product-swap): persist multi-page task outputs"
```

### Task 2: 为微信编辑器定义通用任务生命周期

**Files:**
- Modify: `apps/product-swap/wechat-chat-editor.js`
- Test: `apps/product-swap/tests/wechat-chat-editor.test.js`

- [ ] **Step 1: 写生成生命周期的失败测试**

为编辑器导出的 `runChatGeneration` 增加测试，使用真实编辑器状态和注入函数验证调用顺序：

```js
test('records one completed task for each generated chat draft', async () => {
    const calls = [];
    const state = createChatEditorState();
    state.setStoreName('三山山');

    const result = await runChatGeneration({
        state,
        requestDraft: async () => validDraft,
        renderDraft: async () => [{ blob: new Blob(['page']) }],
        taskLifecycle: {
            start: async () => {
                calls.push('start');
                return { id: 'task_chat_1' };
            },
            complete: async (task, output) => {
                calls.push(['complete', task.id, output.pages.length]);
            },
            fail: async () => calls.push('fail'),
        },
    });

    assert.deepEqual(calls, [
        'start',
        ['complete', 'task_chat_1', 1],
    ]);
    assert.equal(result.pages.length, 1);
});
```

再增加两个测试：

- `requestDraft` 或 `renderDraft` 抛错时，生命周期收到一次 `fail` 并重新抛出原错误。
- `start` 抛错时，生成仍成功，返回 `archiveWarning`，且不调用 `complete`/`fail`。

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```powershell
node --test tests/wechat-chat-editor.test.js
```

Expected: FAIL，`runChatGeneration` 尚未定义。

- [ ] **Step 3: 实现独立的生成编排函数**

在 `wechat-chat-editor.js` 中实现并导出：

```js
async function runChatGeneration({
    state,
    requestDraft,
    renderDraft,
    taskLifecycle,
}) {
    const input = state.snapshot().materials;
    let task = null;
    let archiveWarning = '';
    try {
        task = await taskLifecycle?.start(input);
    } catch {
        archiveWarning = '生成可继续，但本次任务记录无法保存';
    }
    try {
        const draft = await state.regenerate(requestDraft);
        const pages = await renderDraft(draft, state.snapshot().materials);
        if (task) {
            try {
                await taskLifecycle.complete(task, { draft, pages });
            } catch {
                archiveWarning = '生成成功，但任务记录保存失败';
            }
        }
        return { draft, pages, archiveWarning };
    } catch (error) {
        if (task) {
            await taskLifecycle.fail(task, error).catch(() => undefined);
        }
        throw error;
    }
}
```

不得在该函数中引用 `LocalTaskHistory`、DOM 或模板清单。

- [ ] **Step 4: 运行编辑器测试并确认通过**

Run:

```powershell
node --test tests/wechat-chat-editor.test.js
```

Expected: PASS。

- [ ] **Step 5: 提交通用生命周期编排**

```powershell
git add -- apps/product-swap/wechat-chat-editor.js apps/product-swap/tests/wechat-chat-editor.test.js
git commit -m "feat(product-swap): add chat task lifecycle orchestration"
```

### Task 3: 把微信编辑器接入模板生命周期适配器

**Files:**
- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/wechat-chat-editor.js`
- Test: `apps/product-swap/tests/creator-contract.test.js`
- Test: `apps/product-swap/tests/wechat-chat-editor.test.js`
- Test: `apps/product-swap/tests/wechat-chat-browser-smoke.js`

- [ ] **Step 1: 写适配器、挂载和浏览器落库的失败测试**

在 `creator-contract.test.js` 断言微信挂载传入生命周期，并且适配器使用活动模板：

```js
assert.match(source, /taskLifecycle:\s*createChatTaskLifecycle/);
assert.match(source, /taskType:\s*activeTemplate\?\.taskType/);
assert.match(source, /localHistory\.completeTask\([\s\S]*pages\.map/);
```

在编辑器契约测试中断言生成按钮使用 `runChatGeneration`，而下载按钮没有调用生命周期。

在 `wechat-chat-browser-smoke.js` 的 mock AI 生成完成后读取真实页面 IndexedDB：

```js
const taskState = await page.evaluate(async () => {
    const { tasks } = await window.LocalTaskHistory.listTasks();
    const task = tasks.find(
        (item) => item.taskType === 'wechat_chat_screenshot',
    );
    const detail = task
        ? await window.LocalTaskHistory.getTask(task.id)
        : null;
    return {
        status: task?.status || '',
        outputCount: detail?.assets.filter(
            (asset) => asset.role === 'output',
        ).length || 0,
        hasPreview: Boolean(task?.previewAsset),
    };
});
assert.deepEqual(taskState, {
    status: 'completed',
    outputCount: expectedPages,
    hasPreview: true,
});
```

随后导航至 `/history.html`，等待 `.task-card`，断言卡片标题为微信聊天截图且状态为已完成。

- [ ] **Step 2: 运行契约和浏览器测试并确认按预期失败**

Run:

```powershell
node --test tests/creator-contract.test.js tests/wechat-chat-editor.test.js
node tests/wechat-chat-browser-smoke.js
```

Expected: 两条命令均 FAIL；契约缺少 `taskLifecycle`，浏览器中找不到微信任务记录。浏览器测试的 AI、地图和图片响应全部来自请求拦截或本地固定数据。

- [ ] **Step 3: 在 `script.js` 构造适配器**

增加 `createChatTaskLifecycle`，其 `start(materials)` 调用：

```js
localHistory.startTask({
    taskType: activeTemplate.taskType,
    title: activeTemplate.name,
    input: {
        templateId: activeTemplate.id,
        storeName: materials.storeName,
        requirements: materials.requirements,
        locationName: materials.location?.name || '',
        locationAddress: materials.location?.address || '',
        imageCount: materials.images.length,
        hasLocation: Boolean(materials.location),
    },
    images: materials.images.map((image, index) => ({
        role: `chat-image-${index}`,
        source: image.dataUrl,
    })),
});
```

`complete(task, { pages })` 调用：

```js
localHistory.completeTask(task.id, {
    imageUrl: '',
    pageCount: pages.length,
    assistantMessage: `已生成 ${pages.length} 张微信聊天截图。`,
}, pages.map((page) => page.blob));
```

`fail(task, error)` 调用 `localHistory.failTask`。将适配器传给 `mountWechatChatEditor`，并传入 `onArchiveWarning: showArchiveNotice`。

- [ ] **Step 4: 让编辑器按钮使用编排函数**

调整 `refreshPreview` 返回当前渲染页，并允许生成流程感知渲染异常。`generateDraft` 调用 `runChatGeneration`；成功后替换预览并显示 `archiveWarning`，失败时保持现有错误及示例回退行为。初始预览、手工编辑刷新、下载与示例加载继续只调用渲染器，不触发生命周期。

- [ ] **Step 5: 运行契约、编辑器和浏览器测试**

Run:

```powershell
node --test tests/creator-contract.test.js tests/wechat-chat-editor.test.js tests/frontend-contract.test.js
node tests/wechat-chat-browser-smoke.js
```

Expected: 两条命令均 PASS；任务状态为 `completed`，输出数等于渲染页数，“作品”页存在对应卡片。

- [ ] **Step 6: 提交模板接入**

```powershell
git add -- apps/product-swap/script.js apps/product-swap/wechat-chat-editor.js apps/product-swap/tests/creator-contract.test.js apps/product-swap/tests/wechat-chat-editor.test.js apps/product-swap/tests/wechat-chat-browser-smoke.js
git commit -m "fix(product-swap): record chat generation tasks"
```

### Task 4: 完整验证

**Files:**
- Verify only

- [ ] **Step 1: 运行不依赖可选图片模块的定向测试**

Run:

```powershell
node --test tests/local-history.test.js tests/history-contract.test.js tests/frontend-contract.test.js tests/creator-contract.test.js tests/template-catalog.test.js tests/template-registry.test.js tests/wechat-chat-editor.test.js tests/wechat-chat-renderer.test.js
```

Expected: PASS，零失败。

- [ ] **Step 2: 运行浏览器回归测试**

Run:

```powershell
node tests/wechat-chat-browser-smoke.js
```

Expected: PASS，测试过程真实 AI、腾讯地图和计费接口调用次数为零。

- [ ] **Step 3: 检查改动范围**

Run:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` 无输出；状态中没有未提交的计划外文件。
