# 模板自有封面契约设计

## 背景

首页目前直接展示公共模板目录中的 `cover`。部分模板 manifest 复用了通用换品示例图，导致卡片封面与模板功能不对应。

封面应是模板的必要信息之一，由模板包自行声明和维护；首页不应知道具体模板，也不应维护模板 ID 到封面的特殊映射。

## 目标

- 首页中的 7 个模板均使用与自身功能对应的唯一封面。
- 每个模板 manifest 自行声明封面。
- 在模板接入或构建阶段发现封面缺失、错配和资源不存在的问题。
- 保持首页为通用模板目录渲染器。

## 模板契约

每个 `template-packs/<template-id>/manifest.js` 必须声明非空的 `cover` 字段。

封面公开路径统一为：

```text
/assets/<template-id>-cover.<扩展名>
```

允许现有 Web 图片格式和 SVG。路径中的文件名必须与 manifest 的 `id` 对应，实际资源必须存在于应用的 `assets/` 目录中。

模板注册器负责验证：

1. `cover` 是非空字符串。
2. `cover` 使用 `/assets/` 下的公开资源。
3. 文件名以 `<template-id>-cover.` 开头。
4. 对应源资源真实存在。

公共模板目录继续发布 `cover` 字段，首页卡片只读取 `template.cover`，不增加模板特判或额外映射。

## 封面调整

保留已经正确归属的封面：

- `dish-ranking-guide-cover.webp`
- `wechat-chat-screenshot-cover.svg`

为以下模板新增专属封面并修改各自 manifest：

- `before-after`
- `food-copy-layout`
- `product-swap`
- `store-promotion`
- `summer-seeding`

封面使用明确场景、图形和短标题表达模板功能。所有文字直接在 SVG 中排版，避免调用图片生成接口产生错别字。

## 测试与验证

- 注册器单元测试：拒绝与模板 ID 不对应的封面路径。
- 注册器单元测试：拒绝不存在的封面资源。
- 目录契约测试：7 个模板的封面路径唯一，且均符合自有封面命名规则。
- 构建测试：所有封面进入 `dist/assets/`。
- 首页视觉回归：本地构建后截图，确认移动端卡片裁切下仍能识别各模板功能。

自动化验证不调用豆包 AI、腾讯地图或其他计费接口。

