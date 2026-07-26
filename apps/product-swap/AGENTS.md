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
