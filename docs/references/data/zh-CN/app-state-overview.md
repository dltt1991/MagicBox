# 应用状态概览

> 中文副本，对应英文原文：[docs/references/data/app-state-overview.md](../app-state-overview.md)。

说明应用内状态如何在 Cache、Preference、DataApi 等系统间分布。

## 要点

- 持久业务状态进数据库。
- 跨窗口运行态使用 shared cache。
- 渲染端本地 UI 状态可用 persist cache。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# App State System Overview`
- `## When to Use`
- `## Schema`
- `## Rules`
- `### Access`
- `### Ownership`
- `### Key Naming`
- `### Disposability`
- `## Key Registry`
- `## Related Source Code`
- `## Related Documentation`
