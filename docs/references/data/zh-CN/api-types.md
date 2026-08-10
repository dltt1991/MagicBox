# DataApi 类型

> 中文副本，对应英文原文：[docs/references/data/api-types.md](../api-types.md)。

说明 DataApi schema、entity、DTO 和客户端类型如何组织。

## 要点

- 共享类型位于 shared 层。
- 响应实体和请求 DTO 要从 schema 派生。
- 避免 main/renderer 各写一套不一致类型。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Data API Type System`
- `## Directory Structure`
- `## File Responsibilities`
- `## Schema File Organization`
- `## Import Conventions`
- `### Infrastructure Types (direct module imports)`
- `### Domain DTOs (directly from schema files)`
- `## Pagination Types`
- `### Request Parameters`
- `### Response Types`
- `## Adding a New Domain Schema`
- `## Type Safety Features`
- `### Path Resolution`
- `### Exhaustive Handler Checking`
- `### Type-Safe Client`
- `## Error Handling`
- `### Retryable Error Codes`
- `## Architecture Overview`
