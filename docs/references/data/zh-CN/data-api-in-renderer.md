# 渲染端中的 DataApi

> 中文副本，对应英文原文：[docs/references/data/data-api-in-renderer.md](../data-api-in-renderer.md)。

说明 renderer 如何通过 useQuery、useMutation 和缓存失效访问 DataApi。

## 要点

- 组件通过 typed hooks 读写数据。
- mutation 后按资源刷新缓存。
- 不要从渲染端直接访问数据库或主进程服务。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# DataApi in Renderer`
- `## React Hooks`
- `### useQuery (GET Requests)`
- `### useMutation (POST/PUT/PATCH/DELETE)`
- `### useInfiniteQuery (Cursor-based Infinite Scroll)`
- `### usePaginatedQuery (Offset-based Pagination)`
- `### Choosing Pagination Hooks`
- `## Dynamic Paths`
- `### When to use which`
- `### Caveat: concurrent trigger on template `useMutation``
- `## Refresh Patterns`
- `### Static paths (exact match)`
- `### `/*` suffix (prefix match)`
- `### Function form (dynamic keys)`
- `### Choosing between forms`
- `### Misuse to avoid`
- `## Data Change Notifications`
- `## DataApiService Direct Usage`
- `## Error Handling`
- `### With Hooks`
- `### With Try-Catch`
- `### Retryable Errors`
- `## Common Patterns`
- `### Create Form`
