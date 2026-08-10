# Cache 使用指南

> 中文副本，对应英文原文：[docs/references/data/cache-usage.md](../cache-usage.md)。

说明 renderer/main 如何读写 cache，以及何时使用 useCache、useSharedCache、usePersistCache。

## 要点

- 普通 UI 临时状态用 useCache。
- 跨窗口协调用 useSharedCache。
- 需要重启后保留的轻量 UI 状态用 usePersistCache。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Cache Usage Guide`
- `## React Hooks`
- `## CacheService Direct Usage (Renderer)`
- `### Memory`
- `### Shared`
- `### Persist`
- `## Main Process Usage`
- `### Internal and Shared Access`
- `### Subscribing to Changes`
- `## Shared Cache Ready State`
- `## Cache Statistics (debugging)`
- `## Common Patterns`
- `### Cache an expensive computation`
- `### Cross-window coordination`
- `### Observe a main-owned key (read-only)`
- `### Aggregate multiple main-owned keys (read-only selector)`
- `### Bounded recent list (Persist)`
- `### Observe every instance of a template key (Main only)`
- `### TTL on a non-hook read path`
- `## Type-Safe vs Casual`
- `## Best Practices`
