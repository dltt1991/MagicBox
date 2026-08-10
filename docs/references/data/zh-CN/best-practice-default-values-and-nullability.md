# 默认值与可空性最佳实践

> 中文副本，对应英文原文：[docs/references/data/best-practice-default-values-and-nullability.md](../best-practice-default-values-and-nullability.md)。

说明数据库字段、schema 默认值和 nullable 设计的取舍。

## 要点

- 默认值应表达真实业务语义。
- nullable 代表缺失或解除绑定，不应用来偷懒。
- 读写 DTO 要清楚区分 omitted、undefined 和 null。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Default Values & Nullability`
- `## Problem`
- `## Five Rules`
- `### R1. NULL vs NOT NULL must reflect domain semantics`
- `### R2. Each field has at most one source of truth for its default`
- `### R3. Read path must not fabricate defaults`
- `### R4. Write path covers only what the database cannot`
- `### R5. Update schema must derive from a defaults-free source`
- `## Decision Matrix 1: Should this column be NULL or NOT NULL?`
- `## Decision Matrix 2: Where should the default value live?`
- `### Why Zod `.default()` is discouraged`
- `### DB defaults are near-permanent`
- `### Quick chooser`
- `## Standard Layered Design`
- `## Anti-patterns`
- `## Case Studies`
- `### A. `assistant.prompt / emoji / description / settings` — anti-pattern (current state)`
- `### B. `assistant.modelId` — correct (current state)`
- `### C. `agent.accessiblePaths` — anti-pattern (current state)`
- `## Related References`
