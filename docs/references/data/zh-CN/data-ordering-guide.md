# 数据排序指南

> 中文副本，对应英文原文：[docs/references/data/data-ordering-guide.md](../data-ordering-guide.md)。

说明使用 fractional indexing 实现可扩展、稳定的实体排序。

## 要点

- 排序字段使用 orderKey。
- 移动操作以 anchor 表达位置。
- 避免全量重排和整数 sortOrder 漂移。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Ordering Guide`
- `## Quickstart — The Four Layers`
- `### 1. Database schema — `orderKeyColumns` + index helpers`
- `### 2. API schema — `OrderEndpoints<TRes>``
- `### 3. Server-side service — `insertWithOrderKey` / `applyMoves` / `resetOrder``
- `### 4. Renderer — `useReorder` hook`
- `## 1. API Shape`
- `### `PATCH /{resource}/:id/order` — primary`
- `### `POST /{resource}/order:reset` — auxiliary (opt-in per resource)`
- `### `PATCH /{resource}/order:batch` — auxiliary (used internally by `useReorder`)`
- `## 2. Database Schema Rules`
- `## 3. Server-Side Service Helpers`
- `## 3.1 Scoped Reorder Pattern`
- `## 4. Renderer Integration`
- `### 4.1 Sequence`
- `### 4.2 Non-`id` primary keys — the `idKey` option`
- `### 4.3 Supported cache shapes`
- `### 4.4 Using accessors for nested shapes`
- `### 4.5 Degradation: not-loaded vs. unrecognized cache`
- `### 4.6 Anti-pattern: don't shadow SWR with local state`
- `## 5. v2 Migrator Usage`
- `## 6. URL and Naming Conventions`
- `## 7. Migration Checklist — New Sortable Resource`
- `## 8. FAQ`
