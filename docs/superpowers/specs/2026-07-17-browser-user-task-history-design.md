# 浏览器匿名用户与通用任务中心设计

## 目标

为 `product-swap` 增加无需操作的浏览器匿名用户和任务记录能力。用户在同一个浏览器中再次打开站点时，可以查看自己的所有生成任务、输入图片、输出图片和文字要求。设计同时为未来的“一键复制产品”等生成工具保留通用扩展边界。

本期不提供用户名、密码、跨设备同步、账号恢复或继续编辑历史任务。

## 方案选择

采用 Cloudflare Worker + D1 + R2：

- Worker 自动建立和验证匿名浏览器会话，并提供任务与图片接口。
- D1 永久保存匿名用户、任务元数据、文字参数和图片清单。
- R2 保存任务输入与输出图片，默认保留 30 天。
- `product-swap` 增加“任务记录”入口和独立的“所有任务”页面。

未采用纯 `localStorage`，因为完整输入、输出图片会快速超过浏览器容量，也无法供未来不同子域的工具共享。未采用用户名密码系统，因为当前没有跨设备需求，密码找回和安全维护不产生用户价值。

## 匿名用户身份

### 生产环境

首次调用任务 API 时，Worker 生成：

- 一个公开的匿名用户 ID；
- 一个至少 256 位随机会话密钥。

Worker 只在 D1 中保存会话密钥的 SHA-256 摘要，原始密钥写入长期 Cookie：

```text
Name: mm_anonymous_session
Domain: .mm0708.top
Path: /
Max-Age: 31536000
Secure: true
HttpOnly: true
SameSite: Lax
```

共享父域 Cookie 使 `product-swap.mm0708.top` 和未来受信任的工具子域可以识别同一浏览器用户。前端所有 API 请求使用 `credentials: "include"`。API CORS 只允许明确配置的 `*.mm0708.top` 前端来源和本地开发来源，并启用凭据；不再对带身份的任务接口使用通配来源。

### 本地开发

本地页面与本地 API 不共享生产 Cookie 域。开发环境由 API 设置 host-only Cookie；测试可直接注入 Cookie。身份协议保持一致，不在生产代码中把会话密钥放进 URL。

### 身份丢失

清除 Cookie、使用隐私窗口或换浏览器会产生新的匿名用户。旧任务仍保存在云端，但本期不提供找回入口。这一限制在任务页底部以简短说明呈现。

## 通用数据模型

### `anonymous_users`

- `id TEXT PRIMARY KEY`：公开 UUID。
- `session_hash TEXT UNIQUE NOT NULL`：匿名会话密钥摘要。
- `created_at INTEGER NOT NULL`。
- `last_seen_at INTEGER NOT NULL`。

### `generation_tasks`

- `id TEXT PRIMARY KEY`：任务 UUID。
- `user_id TEXT NOT NULL`。
- `task_type TEXT NOT NULL`：本期为 `product_swap`，未来可增加 `product_copy` 等。
- `status TEXT NOT NULL`：`processing`、`completed` 或 `failed`。
- `title TEXT NOT NULL`：供列表展示的工具名称。
- `input_json TEXT NOT NULL`：只保存非图片参数，例如额外要求和工具配置。
- `result_json TEXT`：只保存非图片结果，例如 provider、conversationId 和提示文案。
- `error_code TEXT`、`error_message TEXT`：失败任务信息。
- `created_at INTEGER NOT NULL`、`completed_at INTEGER`。

索引为 `(user_id, created_at DESC)` 和 `(user_id, task_type, created_at DESC)`。

### `task_assets`

- `id TEXT PRIMARY KEY`。
- `task_id TEXT NOT NULL`。
- `role TEXT NOT NULL`：`target`、`product`、`scene`、`previous` 或 `output`。
- `r2_key TEXT NOT NULL`。
- `content_type TEXT NOT NULL`。
- `byte_size INTEGER NOT NULL`。
- `expires_at INTEGER NOT NULL`。
- `deleted_at INTEGER`。
- `created_at INTEGER NOT NULL`。

R2 Key 使用：

```text
tasks/{userId}/{taskId}/{assetId}.{extension}
```

D1 不保存 Base64 图片或火山临时 URL。

## 生成数据流

1. 前端启动时调用 `POST /api/tasks/session`，Worker 自动恢复或创建匿名用户。
2. 前端生成请求携带 Cookie 和现有输入数据。
3. Worker 创建 `processing` 任务记录。
4. Worker 解码输入 Data URL，将目标图、产品图、场景图以及修正时的上一版结果写入 R2，并写入 `task_assets`。
5. Worker调用火山 Provider。
6. 成功后，Worker立即下载火山返回的临时 URL，验证 Content-Type 和大小，将输出写入 R2。
7. Worker将任务更新为 `completed`，返回当前可展示的 `imageUrl`、`taskId` 和原有会话字段。
8. Provider失败时，任务更新为 `failed`，文字错误信息保留；已写入的输入图仍按 30 天规则过期。

R2 归档失败但生成成功时，接口仍返回生成结果，同时把任务标记为 `completed` 并记录 `archiveWarning`。前端提示“生成成功，但任务图片暂未保存”，避免因历史功能影响核心生成流程。

## 图片访问与淘汰

R2 Bucket 保持私有。浏览器不能直接读取 R2 Key。

图片接口：

```text
GET /api/tasks/:taskId/assets/:assetId
```

Worker先验证 Cookie 对应用户拥有该任务，再从 R2返回图片。响应使用私有缓存头，不公开可猜测的永久地址。

所有图片默认 `expires_at = created_at + 30 天`。每天执行一次计划任务，分页删除到期 R2 对象，并更新 `deleted_at`。详情接口也执行惰性校验：当前时间超过 `expires_at` 时直接返回 `410 ASSET_EXPIRED`，不依赖清理任务是否已经运行。

D1 中的任务、要求、状态、图片角色和到期时间永久保留。图片过期后，页面仍能显示完整文字记录和“图片已过期”占位。

## API

```text
POST   /api/tasks/session
GET    /api/tasks?type=product_swap&cursor=...&limit=30
GET    /api/tasks/:taskId
DELETE /api/tasks/:taskId
GET    /api/tasks/:taskId/assets/:assetId
POST   /api/product-swap/generate
```

任务列表使用基于 `(created_at, id)` 的游标分页，默认 30 条、最大 50 条。只返回当前匿名用户的数据。删除任务时立即删除仍存在的 R2 图片，然后删除或软删除任务元数据；本期采用硬删除，行为与页面“删除任务”一致。

生成接口响应增加：

```json
{
  "taskId": "task_uuid",
  "archiveWarning": null
}
```

## 页面设计

### 生成页

页面顶部由单个返回按钮调整为导航行：左侧“返回”，右侧“任务记录”。任务记录不显示容易失真的总数徽标，避免每次进入生成页额外加载列表。

生成成功后自动归档，无需增加复选框。若归档失败，在结果操作区显示非阻断提示。

### 所有任务页

页面标题使用“所有任务”，副标题为“当前浏览器的生成记录”。顶部提供返回生成页入口。

列表默认按时间倒序，每页 30 条。每张任务卡包含：

- 工具名称，例如“一键换产品”；
- 创建时间和状态；
- 输出图预览，输出不存在时退回展示第一张输入图；
- 额外要求摘要；
- “查看详情”和“删除”操作。

顶部保留任务类型筛选：初期只有“全部”和“一键换产品”，未来新增类型时无需改列表数据结构。移动端使用单列卡片，宽屏使用两列。

空状态提供“还没有任务记录”和“去生成”按钮。接口失败显示重试按钮。分页采用“加载更多”，避免无限滚动造成定位混乱。

### 任务详情

任务详情在同一页面内使用全屏层展示：

- 输出图置顶；
- 输入区域按目标图、产品图、场景图排列；
- 展示工具名称、时间、状态和文字要求；
- 支持下载仍有效的图片；
- 不提供继续修改或恢复输入。

图片接口返回 `410`、图片加载失败或本地 `expires_at` 已经过期时，显示统一的“图片已过期”占位。单张输入缺失时不渲染该槽位。

## 代码边界

后端新增通用 `task-history` 模块，负责身份、D1任务仓储、R2资源仓储和通用任务 API。`product-swap` 路由只负责校验换品输入、调用 Provider，并通过模块接口记录任务；未来工具复用同一模块。

前端拆出：

- `api-client.js`：统一 `credentials: "include"`、错误解析和 API Base。
- `task-history.js`：列表、详情和资源 Blob URL 生命周期。
- `history.html`：任务中心页面。

现有生成交互保持在 `script.js`，只增加会话初始化、归档响应提示和任务入口。

## 安全与隐私

- 匿名会话密钥只存在 HttpOnly Cookie，D1 只保存摘要。
- R2 Bucket 私有，所有资源读取都校验任务所有权。
- 严格限制图片 MIME、Base64 解码大小和火山输出下载大小。
- 火山临时 URL、完整 Base64、会话密钥不写日志。
- CORS 使用受信任来源白名单并启用 credentials。
- 任务 ID、资源 ID 均使用随机 UUID，不能替代所有权校验。
- 页面明确说明记录属于当前浏览器，清除站点数据后无法找回。

## 错误处理

- 无会话：自动创建，不跳转登录页。
- Cookie 无效：创建新匿名用户并覆盖 Cookie。
- D1 暂时失败：生成接口可以返回稳定的 `TASK_HISTORY_UNAVAILABLE`；在创建任务前失败时不调用收费 Provider。
- R2 输入归档失败：中止生成并将任务标记失败，避免产生无法审计输入的成功任务。
- R2 输出归档失败：保留生成成功响应并返回非阻断警告。
- 图片过期：返回 410，页面显示占位，不将其当作整个任务失败。
- 删除部分失败：D1任务暂时保留并返回可重试错误，定时清理继续回收孤立对象。

## 测试与验收

### 单元与接口测试

- 首次请求创建匿名用户和安全 Cookie；有效 Cookie复用同一用户；无效 Cookie创建新用户。
- 用户只能列出、查看和删除自己的任务。
- 生成成功时记录输入资源、归档输出并返回 `taskId`。
- Provider失败时任务状态为 `failed`。
- 输出归档失败时核心生成仍成功并返回警告。
- 到期图片返回 410；清理任务只删除到期资源。
- 游标分页稳定且按时间倒序。

### 前端测试

- 生成和修正成功后均产生任务。
- 任务页的加载、筛选、加载更多、详情、删除、空状态和重试状态正确。
- 输入图和输出图正确分类。
- 到期资源显示占位，其他文字仍可查看。
- Blob URL 在详情关闭和页面卸载时回收。

### 验收标准

1. 同一浏览器关闭后重新打开，仍可看到自己的任务。
2. 新隐私窗口看不到原浏览器任务。
3. 每个任务可以查看本期仍有效的全部输入与输出。
4. 30 天后图片不可读取，但任务文字仍保留并显示已过期。
5. 数据模型和任务页面可以在不改表结构的前提下增加新的 `task_type`。

