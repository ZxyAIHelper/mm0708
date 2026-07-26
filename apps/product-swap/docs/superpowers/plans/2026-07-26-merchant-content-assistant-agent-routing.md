# 商家内容助手 Agent 路由 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让代理在用户提到“商家内容助手”时直接进入 `apps/product-swap` 的项目约束和知识 Skill，并把后续项目 spec/plan 沉淀在子项目文档目录。

**Architecture:** 根 `AGENTS.md` 只做多项目路由，子项目 `AGENTS.md` 声明局部规则并引用项目知识 Skill。知识 Skill 放入现有 `apps/product-swap/docs`；运行时依赖的 `skills/product-swap-image` 保持不动。

**Tech Stack:** Markdown、Agent Skills YAML frontmatter、Codex Skill 校验脚本。

---

### Task 1: 建立根目录与子项目路由

**Files:**
- Modify: `AGENTS.md`
- Create: `apps/product-swap/AGENTS.md`

- [ ] **Step 1: 确认当前路由缺失**

Run:

```powershell
rg -n "商家内容助手|apps/product-swap/AGENTS.md" AGENTS.md
```

Expected: 无匹配，证明根指令尚不能按产品名称路由。

- [ ] **Step 2: 添加根目录路由**

在根 `AGENTS.md` 中保留现有计费安全规则，并增加：

```markdown
## 子项目路由

- 当用户提到“商家内容助手”“商家内容平台”、`product-swap`，或任务明确涉及 `apps/product-swap` 时，必须先读取并遵循 `apps/product-swap/AGENTS.md`。
- `apps/product-swap` 的项目约束只适用于该子项目，不得自动套用到仓库中的其他应用。
```

- [ ] **Step 3: 创建子项目 AGENTS.md**

写入以下内容：

```markdown
# 商家内容助手项目说明

## 必需的项目知识

- 用户提到“商家内容助手”“商家内容平台”或 `product-swap` 时，视为本项目任务。
- **REQUIRED PROJECT SKILL:** 在规划、修改或评审本项目之前，必须读取并遵循 `merchant-content-assistant`：`docs/merchant-content-assistant/SKILL.md`。
- 涉及实际换品生图的输入顺序、构图保持、结果输出或防递归规则时，必须使用 `product-swap-image`，不得在项目知识文档中复制其规则。

## 文档沉淀

- 新增的项目专属设计放入 `docs/superpowers/specs/`。
- 新增的项目专属实施计划放入 `docs/superpowers/plans/`。
- 架构入口、目录职责或稳定术语改变时，同步更新项目知识 Skill。
- 只有涉及多个子项目的仓库级文档才放到根目录 `docs/`。

## 继承规则

- 本文件补充根 `AGENTS.md`；根目录关于外部 Key、额度与计费接口的限制继续生效。
- 自动化测试、冒烟测试和重复调试不得调用真实豆包 AI、腾讯地图或其他计费接口。
```

- [ ] **Step 4: 验证路由文本**

Run:

```powershell
rg -n "商家内容助手|merchant-content-assistant|docs/superpowers/specs|docs/superpowers/plans" AGENTS.md apps/product-swap/AGENTS.md
```

Expected: 根路由、Required Project Skill 和文档目录全部命中。

### Task 2: 创建项目知识 Skill

**Files:**
- Create: `apps/product-swap/docs/merchant-content-assistant/SKILL.md`
- Create: `apps/product-swap/docs/merchant-content-assistant/agents/openai.yaml`

- [ ] **Step 1: 记录无 Skill 基线**

基线用例为“给商家内容助手新增一个节日海报模板”。当前代理最终可通过多处代码和历史设计推断项目范围，但必须跨目录搜索，且没有稳定的首个知识入口。

- [ ] **Step 2: 用官方脚本初始化 Skill**

Run:

```powershell
python C:\Users\mm\.codex\skills\.system\skill-creator\scripts\init_skill.py merchant-content-assistant --path apps/product-swap/docs --interface display_name="商家内容助手" --interface short_description="定位商家内容平台的架构、模板、接口与测试" --interface default_prompt="Use $merchant-content-assistant to work on the merchant content assistant project."
```

Expected: 创建规范的 Skill 目录和 `agents/openai.yaml`。

- [ ] **Step 3: 写入最小项目知识**

用以下内容替换初始化模板：

```markdown
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
```

- [ ] **Step 4: 校验 Skill**

Run:

```powershell
python C:\Users\mm\.codex\skills\.system\skill-creator\scripts\quick_validate.py apps/product-swap/docs/merchant-content-assistant
```

Expected: `Skill is valid!`

### Task 3: 前向验证和最终检查

**Files:**
- Verify: `AGENTS.md`
- Verify: `apps/product-swap/AGENTS.md`
- Verify: `apps/product-swap/docs/merchant-content-assistant/SKILL.md`

- [ ] **Step 1: 使用相同场景前向验证**

让独立代理只读取根与子项目指令以及新 Skill，回答“给商家内容助手新增一个节日海报模板”应定位哪些目录、遵循哪些边界。期望它直接定位 `apps/product-swap`、`template-packs`、统一创作页、`apps/my-cloud-hub/src/projects/product-swap` 和对应测试，不调用真实外部服务。

- [ ] **Step 2: 检查路径与占位符**

Run:

```powershell
rg -n "TBD|TODO|待定|占位" AGENTS.md apps/product-swap/AGENTS.md apps/product-swap/docs/merchant-content-assistant
rg -n "skills/product-swap-image" apps/product-swap/template-packs/product-swap/prompt.js
```

Expected: 新文档无占位符；现有运行时 Skill 路径仍保持不变。

- [ ] **Step 3: 检查改动范围**

Run:

```powershell
git diff --check
git status --short
```

Expected: 无空白错误；不修改用户已有的 `apps/product-swap/tests/dish-ranking-renderer.test.js`。
