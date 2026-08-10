# 数据分页指南

> 中文副本，对应英文原文：[docs/references/data/data-pagination-guide.md](../data-pagination-guide.md)。

说明 offset/cursor 分页、缓存形状和 renderer 读取模式。

## 要点

- 按资源规模选择分页策略。
- 响应结构需要包含 items 和分页游标/总数。
- 前端 mutation 要保持分页缓存一致。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Pagination Guide`
- `## 1. Two Modes — Pick One Per Endpoint`
- `## 2. The Four Layers (Quickstart)`
- `## 3. Wire Contract`
- `### Request parameters`
- `### Response shapes`
- `### Cursor semantics — exclusive boundary`
- `### Client-side derivations`
- `## 4. Server Implementation`
- `### Offset`
- `### Cursor (keyset)`
- `## 5. Renderer Consumption`
- `### Offset — `usePaginatedQuery``
- `### Cursor — `useInfiniteQuery` + `useInfiniteFlatItems``
- `### Reorder + pagination`
- `## 6. Full-Text Search Pagination`
- `## 7. Gotchas`
- `## 8. See Also`
