# Cache 概览

> 中文副本，对应英文原文：[docs/references/data/cache-overview.md](../cache-overview.md)。

说明内存 cache、shared cache 和 persist cache 的职责。

## 要点

- Cache 用于可丢失或运行时状态。
- shared cache 用于跨窗口同步。
- persist cache 可保存 UI 偏好，但不是业务数据源。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Cache System Overview`
- `## Scope`
- `## Tiers`
- `## Key Types`
- `## Design Invariants`
- `## Architecture`
- `## Process Responsibilities`
- `## API Reference`
- `### Renderer`
- `### Main`
- `## See Also`
