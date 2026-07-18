# 浏览器本地生成任务刷新恢复设计

## 目标

让 product-swap 在生成期间刷新页面后，继续显示同一任务的进度，并在生成完成后展示结果。任务历史仍只存浏览器本地，不新增 R2、D1 或远端历史接口。

## 方案

使用同源 Service Worker 承担长时间生成请求，IndexedDB 作为页面与 Service Worker 共享的任务状态源。页面负责创建本地任务、发送启动消息并轮询 IndexedDB；Service Worker 负责调用现有 `/api/product-swap/generate`，然后原子更新任务状态和输出资源。

## 数据流

1. 页面构造与当前接口一致的生成 payload。
2. 页面先在 IndexedDB 建立 `processing` 任务，并写入输入图片 Blob、提示词、对话和请求快照。
3. 页面向已激活的 Service Worker 发送 `product-swap:start` 消息，消息包含本地任务 ID、API 地址和生成 payload。
4. Service Worker 用 `ExtendableMessageEvent.waitUntil()` 保持请求生命周期，调用现有生成 API。
5. 页面每秒读取该任务；刷新后从 IndexedDB 找到最近的 `processing` 任务，恢复输入预览和轮询。
6. Service Worker 成功时写入结果 URL、会话 ID和回复文本；失败时写入稳定错误码与错误信息。
7. 页面观察到终态后停止轮询并更新结果区。

## 边界与可靠性

- 普通刷新和同源页面重新加载不会主动取消 Service Worker 中的生成 Promise。
- Service Worker 或整个浏览器被系统终止时，任务可能无法继续；15 分钟后由现有恢复逻辑标记为 `GENERATION_INTERRUPTED`。
- 页面刷新后不重复提交同一个任务，避免重复扣费。
- 服务端仍是同步生成接口，不保存任务历史；火山结果仍只保存 URL。
- Service Worker 不拦截静态资源请求，不引入离线缓存，以避免发布版本缓存问题。

## 接口边界

- `local-history.js` 增加查找最新处理中任务、读取输入资源、触碰任务活动时间等能力。
- `generation-worker.js` 只处理版本化消息协议并更新 IndexedDB。
- `script.js` 负责注册 Service Worker、派发任务、轮询和刷新恢复 UI。
- 旧浏览器或 Service Worker 不可用时回退到当前同步请求，但明确提示刷新无法恢复。

## 测试

- 单元/契约测试覆盖 Worker 注册、消息协议、轮询状态映射和无远端历史接口。
- 浏览器测试在生成请求未完成时刷新页面，验证同一任务没有重复提交并最终展示结果。
- 保留现有历史详情、图片过期、悬挂任务恢复和后端接口测试。

