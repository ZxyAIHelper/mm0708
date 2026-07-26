---
name: merchant-content-assistant
description: Use when a request mentions 商家内容助手, 商家内容平台, product-swap, merchant content templates, or changes files under apps/product-swap.
---

# Merchant Content Assistant

## 项目定位

把“商家内容助手”“商家内容平台”和 `product-swap` 视为同一个项目：`apps/product-swap`。它是面向中小商家的内容模板平台，使用店铺和产品素材生成可发布的图片与配套文案，不是旧海报工具，也不只是换品生图。

保持移动端优先、模板驱动和商家可理解的界面。不要向用户暴露模型、prompt 或 Provider 等实现概念。

## 快速定位

| 任务 | 首要位置 |
| --- | --- |
| 首页、创作页、作品、店铺资料 | `apps/product-swap/` |
| 模板定义与私有 prompt | `apps/product-swap/template-packs/` |
| 模板校验与公开目录 | `apps/product-swap/server/template-registry.js`、`templates.js`、`build.mjs` |
| 生产生成 API | `apps/my-cloud-hub/src/projects/product-swap/` |
| 前端测试 | `apps/product-swap/tests/` |
| 后端测试 | `apps/my-cloud-hub/src/projects/product-swap/__tests__/` |
| 设计与计划 | `apps/product-swap/docs/superpowers/` |

## 工作规则

1. 先读取当前模板 manifest、相邻实现和聚焦测试；不要无目的扫描全仓库。
2. 新模板优先通过 `template-packs/<template-id>/manifest.js`、统一创作页和后端模板策略接入。只有现有动态字段无法表达特殊交互时才增加专用页面。
3. 同步验证前端公开目录与后端支持模板；只增加 manifest 会造成生产 API 拒绝模板。
4. prompt、目标图、蒙版和内部生成规则只能留在服务端；构建后的公开目录不得泄露私有字段。
5. 保持历史作品和旧模板兼容。模板下线不得破坏历史作品的查看与下载。
6. 自动化测试使用 mock、fake 或本地固定响应。除非用户明确要求一次真实验收，否则不得调用豆包 AI、腾讯地图或其他计费接口。
7. 涉及换品生图的图片顺序、构图保持、细化修改或结果输出时，**REQUIRED SUB-SKILL:** Use `product-swap-image`。
8. 新增项目专属 spec 和 plan 分别写入 `apps/product-swap/docs/superpowers/specs/` 与 `apps/product-swap/docs/superpowers/plans/`。

## 常见错误

- 不要把任务定位到 `apps/pages/tools/poster-maker`。
- 不要把“商家内容助手”缩减为单一商品换图功能。
- 不要只改前端模板目录而遗漏后端模板策略与测试。
- 不要把新的项目专属 spec 继续散落到仓库根 `docs`。
