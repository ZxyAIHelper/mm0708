# 商家内容助手 Agent 路由与项目知识设计

## 目标

当用户提到“商家内容助手”“商家内容平台”或 `product-swap` 时，代理应立即把任务定位到 `apps/product-swap`，读取该子项目的约束与知识入口，不再通过全仓库搜索推断项目含义。

## 目录结构

```text
AGENTS.md
apps/product-swap/
├── AGENTS.md
├── docs/
│   ├── merchant-content-assistant/
│   │   └── SKILL.md
│   └── superpowers/
│       ├── specs/
│       └── plans/
└── skills/
    └── product-swap-image/
        └── SKILL.md
```

根 `AGENTS.md` 只增加项目路由：遇到“商家内容助手”等名称时，要求先读取 `apps/product-swap/AGENTS.md`。

子项目 `AGENTS.md` 负责定义项目范围、文档沉淀位置、安全约束，并以 Required Skill Reference 的形式要求读取 `docs/merchant-content-assistant/SKILL.md`。

`docs/merchant-content-assistant/SKILL.md` 是项目知识 Skill，记录产品定位、关键目录、任务路由、架构边界、测试入口与常见误判。以后新增的 product-swap 专属 spec 和 plan 分别放入 `apps/product-swap/docs/superpowers/specs` 与 `apps/product-swap/docs/superpowers/plans`。

## 保留现有执行型 Skill

不移动 `apps/product-swap/skills/product-swap-image`。`template-packs/product-swap/prompt.js` 在运行时直接解析该路径，并把它交给换品生图执行器。它属于执行型 Skill，不是项目知识文档。

项目知识 Skill 在涉及真实换品生图规则时，再明确引用 `product-swap-image`，避免复制其图片顺序、保持构图和防递归规则。

## 内容边界

项目知识 Skill 至少说明：

- “商家内容助手”是面向商家的内容模板平台，不是单一换品工具。
- 前端与模板平台位于 `apps/product-swap`。
- 生产 API 位于 `apps/my-cloud-hub/src/projects/product-swap`。
- 新模板优先通过 `template-packs`、统一创作页和后端模板策略接入。
- 自动测试不得调用豆包 AI、腾讯地图等真实计费接口。
- 项目专属设计与计划必须沉淀在子项目 `docs`，仓库级跨项目文档才放根 `docs`。

## 验证

- 检查根 `AGENTS.md` 能从中文产品名路由到子项目。
- 检查子项目 `AGENTS.md` 明确引用项目知识 Skill。
- 使用 Skill 校验脚本验证 `SKILL.md` 的 frontmatter 和目录命名。
- 用“给商家内容助手新增一个节日海报模板”作为检索用例，确认无需全仓库扫描即可定位模板、前端、后端和测试范围。
- 不发起任何真实外部 API 请求。
