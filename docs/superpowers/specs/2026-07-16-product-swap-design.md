# 一键换产品应用设计

## 目标

在 `apps/` 下新增一个独立网页应用，为餐饮店家及其他商家提供商品换图能力。用户上传目标样图、自己的产品图和可选场景图后，系统保留目标图的构图与陈列方式，将其中的菜品或商品替换为用户产品。

初期使用本机 Codex CLI 作为临时生成适配器，以验证完整交互和接口流程。正式环境预留火山引擎实现，切换模型服务时不修改前端请求格式。

## 范围

本次包含：

- 独立的 `apps/product-swap` 网页应用。
- 按参考截图复刻的移动端优先界面。
- 三类图片上传、预览、删除和重新上传。
- 额外要求输入及长度校验。
- 本地 Codex CLI 生成适配器。
- 统一的商品换图请求与响应协议。
- `my-cloud-hub` 中的正式 API 路由和火山引擎 Provider 边界。
- 页面状态、错误处理、结果预览和下载。
- 从用户提供的截图中裁切演示素材。

本次不包含：

- 用户账户、登录和权限系统。
- 实际“豆额度”扣费。
- 生成历史、云端图片存储和数据库记录。
- 批量生成、多结果选择或后台任务中心。
- 火山引擎具体模型接入调优；本次只建立可替换边界。

## 目录结构

新应用与现有 `pages`、`my-cloud-hub` 等应用同级：

```text
apps/
├── product-swap/
│   ├── package.json
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   ├── assets/
│   │   ├── example-template.jpg
│   │   ├── example-product.jpg
│   │   └── example-result.jpg
│   └── server/
│       ├── dev-server.js
│       └── codex-cli-provider.js
│
└── my-cloud-hub/
    └── src/
        ├── index.ts
        └── projects/
            └── product-swap/
                ├── router.ts
                ├── provider.ts
                └── volcano-provider.ts
```

`apps/product-swap` 是独立应用，不放入 `apps/pages/tools`，本次也不修改工具门户入口。

## 页面设计

页面视觉和内容顺序按用户提供的参考截图复刻：

1. 返回入口。
2. “一键换产品”标题。
3. 功能说明和提示。
4. 三图换品效果示例。
5. 目标图上传区，必填。
6. 产品图上传区，可选。
7. 场景图上传区，可选。
8. 最多 200 字的额外要求。
9. 生成按钮。
10. 生成结果预览和下载操作。

页面使用深色背景，移动端优先，主内容最大宽度约为 460 像素；桌面端居中显示。上传成功后直接在原上传区显示图片预览，右上角提供删除操作。

生成按钮保留参考图中的“生成（消耗 3 豆额度）”文案和视觉，但初版不执行额度扣除。代码中不得加入伪造的余额或计费状态。

## 前端状态

前端维护以下独立状态：

- `targetImage`：目标模板图，必填。
- `productImage`：需要换入的产品图，可选。
- `sceneImage`：场景参考图，可选。
- `requirements`：额外要求，最多 200 字。
- `isGenerating`：是否正在生成。
- `resultImage`：生成结果。
- `error`：当前可展示错误。

上传处理包括：

- 支持 JPG、PNG 和 WebP。
- 支持点击选择和拖拽上传。
- 单张图片最大 10MB。
- 上传后生成本地预览。
- 删除时释放对象 URL 或清除 Data URL 状态。

生成期间禁用生成按钮和上传操作，防止重复提交。成功后显示结果并提供下载；失败后恢复可操作状态并显示中文错误信息。

## API 协议

统一接口：

```text
POST /api/product-swap/generate
Content-Type: application/json
```

请求格式：

```json
{
  "targetImage": "data:image/jpeg;base64,...",
  "productImage": "data:image/jpeg;base64,...",
  "sceneImage": "",
  "requirements": "保持三个托盘的排列方式"
}
```

响应格式：

```json
{
  "success": true,
  "imageUrl": "data:image/png;base64,...",
  "provider": "codex-cli",
  "requestId": "swap_xxx"
}
```

失败格式：

```json
{
  "success": false,
  "error": {
    "code": "CODEX_GENERATION_FAILED",
    "message": "本地生成失败，请稍后重试"
  },
  "requestId": "swap_xxx"
}
```

本地开发时，网页向同源的 Node 开发服务请求该路径。正式环境中，网页通过可配置的 API Base URL 请求：

```text
https://api.mm0708.top/api/product-swap/generate
```

API Base URL 的配置方式沿用工程现有的 `window.API_BASE_URL` 模式。

## Provider 边界

Provider 接口接收规范化输入并返回规范化结果：

```text
generateProductSwap(input) -> image result
```

输入包含：

- 目标图文件或二进制数据。
- 可选产品图。
- 可选场景图。
- 额外要求。
- 请求 ID。

输出包含：

- 图片二进制数据或 Data URL。
- MIME 类型。
- Provider 名称。
- 可选的模型元数据。

Provider 不处理 HTTP 响应和页面文案。路由负责校验、错误映射和序列化，Provider 只负责调用生成引擎。

## 本地 Codex CLI 流程

`apps/product-swap/server/dev-server.js` 同时提供静态网页和本地 API。生成请求流程如下：

1. 校验 JSON 请求、图片类型、图片大小和文字长度。
2. 为请求创建唯一 ID 和系统临时目录。
3. 将 Data URL 解码为独立图片文件。
4. 调用 `codex-cli-provider.js`。
5. Provider 通过 `codex exec` 的 `-i` 参数按顺序传入目标图、产品图和场景图。
6. Provider 要求 Codex 使用图片编辑能力，将结果写入任务目录的 `result.png`。
7. 服务验证结果文件存在且为有效图片。
8. 将结果编码为 Data URL 并返回。
9. 无论成功或失败，都清理任务临时目录。

本地服务同时只执行一个 Codex 生成任务，其余任务进入内存队列。单个任务超时为五分钟。服务退出后未完成的内存队列不恢复。

Codex CLI 是临时验证适配器，并非稳定图片 API。如果当前 CLI 环境没有图片生成工具，接口必须返回明确失败，不得返回静态示例图冒充生成结果。

## 正式火山引擎流程

正式路由位于：

```text
apps/my-cloud-hub/src/projects/product-swap/router.ts
```

并在 `apps/my-cloud-hub/src/index.ts` 挂载：

```text
/api/product-swap
```

火山 Provider 使用 `my-cloud-hub` 的环境绑定读取 API Key 和模型配置。前端和 `apps/product-swap` 不保存密钥。

Provider 优先复用系统已有的环境变量命名：

- `DOUBAO_API_KEY`
- `DOUBAO_IMAGE_ENDPOINT_ID`

如果换品模型需要不同 Endpoint，则新增明确的可选绑定，例如 `DOUBAO_PRODUCT_SWAP_ENDPOINT_ID`，并在未配置时回退到通用图片 Endpoint。具体火山模型请求体在正式接入时实现，但必须遵守本设计中的统一输入输出协议。

## 固定生成规则

系统提示词必须明确图片角色和修改范围：

- 第一张图是目标模板。
- 保持目标模板的宽高比、镜头、构图、产品数量、排列、背景和光线。
- 仅将目标模板中的菜品或商品替换为产品图主体。
- 产品图优先保留形状、颜色、包装、餐具和关键识别特征。
- 场景图存在时，只参考环境和氛围，不改变产品本身。
- 不主动增加文字、Logo、水印或额外商品。
- 用户额外要求追加在固定规则之后，但不能覆盖输入图片的角色定义。
- 默认只生成一张结果图。

## 错误处理

统一错误码：

- `INVALID_INPUT`
- `FILE_TOO_LARGE`
- `UNSUPPORTED_IMAGE`
- `CODEX_CLI_UNAVAILABLE`
- `CODEX_GENERATION_FAILED`
- `CODEX_TIMEOUT`
- `RESULT_IMAGE_NOT_FOUND`
- `VOLCANO_PROVIDER_NOT_CONFIGURED`
- `PROVIDER_REQUEST_FAILED`

服务端日志可以记录请求 ID、Provider、耗时和底层错误，但不能记录 API Key 或完整 Base64 图片。浏览器只接收可展示的中文错误消息和稳定错误码。

## 隐私与安全

- 图片不写入仓库。
- 本地临时图片在请求完成后删除。
- 初版不持久化用户图片或生成结果。
- API Key 只存在于服务端环境变量。
- 服务端限制请求体大小，避免超大 Base64 请求耗尽内存。
- 文件扩展名不能作为唯一依据，必须验证 Data URL MIME 类型和解码结果。
- Codex 子进程使用固定参数和内部构造的提示词，不拼接为 shell 命令字符串。

## 验证

实现完成后至少验证：

1. 页面布局与参考截图在移动端尺寸下接近一致。
2. 桌面端页面居中且不拉伸。
3. 三个上传区支持选择、拖拽、预览、删除和重新上传。
4. 目标图必填校验有效。
5. 文件格式、10MB 大小和 200 字限制有效。
6. 生成期间不能重复提交。
7. Codex CLI 不存在、执行失败、超时和没有结果文件时返回正确错误码。
8. 使用从截图裁出的目标图和产品图执行一次真实本地生成。
9. 结果图片可预览和下载。
10. 使用模拟 Provider 验证统一 API 协议。
11. 火山 Provider 的未配置状态不会泄露密钥或底层敏感信息。

## 成功标准

- 新应用位于 `apps/product-swap`，不依赖 `apps/pages`。
- 页面功能和视觉顺序与参考截图一致。
- 本地按钮能够通过统一 API 尝试调用 Codex CLI 完成真实生成。
- Codex CLI 不具备生图能力时，页面能明确反馈失败。
- 前端不包含任何 Provider 特有逻辑或密钥。
- 后续接入火山引擎时，只需实现或调整服务端 Provider。
