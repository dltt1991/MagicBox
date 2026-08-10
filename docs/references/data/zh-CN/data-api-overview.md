# DataApi 概览

> 中文副本，对应英文原文：[docs/references/data/data-api-overview.md](../data-api-overview.md)。

说明 SQLite-backed business data 的统一 API 层。

## 要点

- DataApi 是业务数据的跨进程边界。
- schema 同时约束 main handler 和 renderer client。
- 没有数据库表的命令不应放进 DataApi。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# DataApi System Overview`
- `## Purpose`
- `## What DataApi is NOT For`
- `## Key Characteristics`
- `### Type-Safe Communication`
- `### RESTful-Style API`
- `### On-Demand Data Access`
- `### Data Change Notifications (opt-in)`
- `## Architecture Diagram`
- `## Architecture Layers`
- `### 1. API Layer (Handlers)`
- `### 2. Service Layer (Services)`
- `### 3. Database Layer`
- `### Repository Pattern (Strongly Discouraged)`
- `## Key Features`
- `### Automatic Retry`
- `### Error Handling`
- `### Request Timeout`
- `### Dynamic Paths & Cache Invalidation`
- `## Usage Summary`
