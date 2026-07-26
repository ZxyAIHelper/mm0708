# 微信聊天截图模板 V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让微信聊天截图支持长对话自动分页、更丰富的 AI 文案、可靠的腾讯真实地点搜索和可选内置头像。

**Architecture:** 保留现有聊天草稿和 Canvas 渲染边界。渲染器先把消息分页，再逐页生成独立 PNG；腾讯地点搜索通过共享 Cloudflare Worker 代理并裁剪响应；头像作为纯本地外观设置，不进入 AI 请求。

**Tech Stack:** 原生 JavaScript、Canvas 2D、Node.js test runner、Hono、TypeScript、Vitest、Cloudflare Workers、Puppeteer。

---

### Task 1: 长对话自动分页

**Files:**
- Modify: `apps/product-swap/wechat-chat-renderer.js`
- Modify: `apps/product-swap/wechat-chat-editor.js`
- Modify: `apps/product-swap/app.css`
- Test: `apps/product-swap/tests/wechat-chat-renderer.test.js`
- Test: `apps/product-swap/tests/wechat-chat-editor.test.js`

- [ ] **Step 1: 写分页失败测试**

为 `paginateChat` 增加短对话一页、长对话多页、消息顺序不变、单条消息不跨页测试；为编辑器增加多页预览容器和逐页下载按钮合同测试。

- [ ] **Step 2: 确认测试因缺少分页能力而失败**

Run: `node --test tests/wechat-chat-renderer.test.js tests/wechat-chat-editor.test.js`

Expected: FAIL，提示 `paginateChat` 或多页渲染结果不存在。

- [ ] **Step 3: 实现最小分页和多页 PNG API**

新增：

```js
function paginateChat(input) {
    // 复用单条消息尺寸计算；下一条超出安全底边时开启新页。
    // 返回 [{ ...layout, pageNumber, pageCount }]
}

async function renderChatPages(draft, materials, options = {}) {
    // 对每页分别创建 1080×1920 Canvas 并返回 PNG URL、Blob、文件名。
}
```

编辑器把 `rendered` 改为 `renderedPages`，显示全部 Canvas，并为每页创建下载按钮；“下载全部”依次触发每页 Blob URL。

- [ ] **Step 4: 运行分页测试**

Run: `node --test tests/wechat-chat-renderer.test.js tests/wechat-chat-editor.test.js`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/product-swap/wechat-chat-renderer.js apps/product-swap/wechat-chat-editor.js apps/product-swap/app.css apps/product-swap/tests/wechat-chat-renderer.test.js apps/product-swap/tests/wechat-chat-editor.test.js
git commit -m "feat: paginate long chat screenshots"
```

### Task 2: 丰富 AI 对话

**Files:**
- Modify: `apps/my-cloud-hub/src/projects/product-swap/chat-draft.ts`
- Test: `apps/my-cloud-hub/src/projects/product-swap/__tests__/chat-draft.test.ts`
- Modify: `apps/product-swap/chat-draft-client.js`
- Test: `apps/product-swap/tests/chat-draft-client.test.js`

- [ ] **Step 1: 写新合同失败测试**

断言服务端和浏览器均接受 10–16 条消息、单条最多 120 字、总文字最多 1000 字，并断言系统提示包含“强烈安利”“主观感受”“不得编造可核验事实”。

- [ ] **Step 2: 确认旧 6–10 条合同导致失败**

Run: `npx vitest run src/projects/product-swap/__tests__/chat-draft.test.ts`

Run: `node --test tests/chat-draft-client.test.js`

Expected: 至少一项因消息数量上限或提示缺失而 FAIL。

- [ ] **Step 3: 更新最小合同与提示**

将消息数量改为 10–16，文字限制改为 120/1000，并加入以下明确要求：

```text
像朋友强烈安利：允许兴奋感叹、连续追问、口语停顿和少量表情。
围绕味道、氛围、出片感和主观体验展开。
夸张只用于主观感受，不得编造价格、优惠、销量、排队时长、菜名、地址或联系方式。
```

- [ ] **Step 4: 运行前后端合同测试**

Run: `npx vitest run src/projects/product-swap/__tests__/chat-draft.test.ts src/projects/product-swap/__tests__/chat-provider.test.ts`

Run: `node --test tests/chat-draft-client.test.js`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/my-cloud-hub/src/projects/product-swap/chat-draft.ts apps/my-cloud-hub/src/projects/product-swap/__tests__/chat-draft.test.ts apps/product-swap/chat-draft-client.js apps/product-swap/tests/chat-draft-client.test.js
git commit -m "feat: enrich generated chat conversations"
```

### Task 3: 站内腾讯地点搜索

**Files:**
- Modify: `apps/my-cloud-hub/src/projects/product-swap/router.ts`
- Test: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`
- Modify: `apps/product-swap/tencent-map-picker.js`
- Modify: `apps/product-swap/wechat-chat-editor.js`
- Modify: `apps/product-swap/app.css`
- Test: `apps/product-swap/tests/tencent-map-picker.test.js`
- Test: `apps/product-swap/tests/wechat-chat-browser-smoke.js`

- [ ] **Step 1: 写后端搜索失败测试**

测试 `GET /location-search`：

```ts
expect(url.origin).toBe('https://apis.map.qq.com')
expect(url.pathname).toBe('/ws/place/v1/search')
expect(url.searchParams.get('boundary')).toBe('region(北京,1)')
expect(init.headers.Referer).toBe('https://product-swap.mm0708.top/')
```

同时覆盖输入缺失、腾讯非零状态、超限响应和结果字段裁剪。

- [ ] **Step 2: 确认路由不存在**

Run: `npx vitest run src/projects/product-swap/__tests__/router.test.ts`

Expected: FAIL，路由返回 404。

- [ ] **Step 3: 实现固定上游搜索代理**

新增路由，限制区域和关键词为 40 字，固定 `page_size=12`，只返回：

```ts
{
    id: string,
    name: string,
    address: string,
    city: string,
    lat: number,
    lng: number
}
```

不返回 Key、电话、分类或腾讯原始错误体。

- [ ] **Step 4: 写前端搜索失败测试**

新增 `searchLocations({ region, keyword, apiJson })` 和 `normalizeSearchResults` 合同测试，断言参数编码、最多 12 条和无效坐标过滤。

- [ ] **Step 5: 确认前端函数缺失**

Run: `node --test tests/tencent-map-picker.test.js`

Expected: FAIL，搜索 API 未导出。

- [ ] **Step 6: 替换 iframe 为站内搜索 UI**

地图弹窗改成区域输入、关键词输入、搜索按钮和结果列表。选择结果后调用现有 `state.setLocation` 并关闭弹窗。保留静态地图预览，不再读取公开 Map Key 或监听 iframe `postMessage`。

- [ ] **Step 7: 运行地图单元与浏览器测试**

Run: `npx vitest run src/projects/product-swap/__tests__/router.test.ts`

Run: `node --test tests/tencent-map-picker.test.js`

Run: `node tests/wechat-chat-browser-smoke.js`

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add apps/my-cloud-hub/src/projects/product-swap/router.ts apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts apps/product-swap/tencent-map-picker.js apps/product-swap/wechat-chat-editor.js apps/product-swap/app.css apps/product-swap/tests/tencent-map-picker.test.js apps/product-swap/tests/wechat-chat-browser-smoke.js
git commit -m "fix: replace legacy Tencent location picker"
```

### Task 4: 内置可选头像

**Files:**
- Create: `apps/product-swap/assets/chat-avatars/*.svg`
- Modify: `apps/product-swap/wechat-chat-renderer.js`
- Modify: `apps/product-swap/wechat-chat-editor.js`
- Modify: `apps/product-swap/app.css`
- Test: `apps/product-swap/tests/wechat-chat-renderer.test.js`
- Test: `apps/product-swap/tests/creator-contract.test.js`

- [ ] **Step 1: 写头像失败测试**

断言头像目录包含 8 个 SVG；渲染器接收左右头像 URL；编辑器显示两个头像选择器；加载失败时仍能导出。

- [ ] **Step 2: 确认头像资产和选择器不存在**

Run: `node --test tests/wechat-chat-renderer.test.js tests/creator-contract.test.js`

Expected: FAIL。

- [ ] **Step 3: 创建 8 个本地 SVG 并接入渲染器**

头像使用简单几何图形绘制猫、熊、兔、企鹅等角色。渲染选项：

```js
{
    avatars: {
        left: '/assets/chat-avatars/cat.svg',
        right: '/assets/chat-avatars/bear.svg',
    },
}
```

加载成功时绘制圆角头像图片；失败时调用现有 `drawAvatar` 回退。

- [ ] **Step 4: 增加左右头像选择器**

选择器显示头像缩略图和清晰的选中状态，改变选择后重新渲染所有页面，不修改 AI 草稿。

- [ ] **Step 5: 运行头像测试**

Run: `node --test tests/wechat-chat-renderer.test.js tests/creator-contract.test.js`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/product-swap/assets/chat-avatars apps/product-swap/wechat-chat-renderer.js apps/product-swap/wechat-chat-editor.js apps/product-swap/app.css apps/product-swap/tests/wechat-chat-renderer.test.js apps/product-swap/tests/creator-contract.test.js
git commit -m "feat: add selectable chat avatars"
```

### Task 5: 集成验证与部署

**Files:**
- Modify: `apps/product-swap/tests/wechat-chat-browser-smoke.js`
- Modify: `apps/product-swap/docs/superpowers/specs/2026-07-26-wechat-chat-screenshot-v2-design.md`

- [ ] **Step 1: 扩展浏览器失败测试**

模拟 14 条消息和真实地点搜索响应，断言生成至少两页、头像可切换、逐页 PNG 均为 1080×1920。

- [ ] **Step 2: 确认旧浏览器合同失败**

Run: `node tests/wechat-chat-browser-smoke.js`

Expected: FAIL，缺少多页或站内地图搜索行为。

- [ ] **Step 3: 完成必要集成调整**

只修复浏览器测试揭示的真实集成问题，并在设计文档记录腾讯旧组件 `status=110` 根因和替换结果。

- [ ] **Step 4: 全量验证**

Run: `npm test`

Run: `npm run test:browser`

Run: `npx vitest run src/projects/product-swap`

Run: `node build.mjs`

Expected: 所有产品测试和相关后端测试 PASS；显式 live provider 测试可保持跳过。

- [ ] **Step 5: 提交**

```bash
git add apps/product-swap/tests/wechat-chat-browser-smoke.js apps/product-swap/docs/superpowers/specs/2026-07-26-wechat-chat-screenshot-v2-design.md
git commit -m "test: verify chat screenshot v2 flow"
```

- [ ] **Step 6: 部署并在线验收**

先部署 `apps/my-cloud-hub`，再构建并部署 `apps/product-swap`。线上只输出状态、结果数量、分页数量和图片类型，不输出腾讯 Key 或 AI 生成文本。

