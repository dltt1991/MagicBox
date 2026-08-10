# Cache Schema 指南

> 中文副本，对应英文原文：[docs/references/data/cache-schema-guide.md](../cache-schema-guide.md)。

说明如何为 cache key 定义类型、默认值和使用约束。

## 要点

- cache key 和 value type 位于 shared data cache。
- 默认值应让消费者无需处理 undefined。
- 跨窗口状态应选择 shared cache。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Cache Schema Guide`
- `## Schemas`
- `## Naming Convention`
- `## Choosing Fixed / Template / Casual`
- `## Adding a Fixed Key`
- `### 1. Add the entry`
- `### 2. Define complex value type (if needed)`
- `### 3. Use it`
- `## Adding a Template Key`
- `## Shared and Persist Variants`
- `## Validation`
- `## See Also`
