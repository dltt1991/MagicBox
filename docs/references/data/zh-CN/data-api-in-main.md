# 主进程中的 DataApi

> 中文副本，对应英文原文：[docs/references/data/data-api-in-main.md](../data-api-in-main.md)。

说明 main process 内如何实现 DataApi handler、service 和 repository。

## 要点

- handler 做边界解析和错误转换。
- service 持有业务不变量。
- 数据库写入需要遵守事务和同步 better-sqlite3 语义。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# DataApi in Main Process`
- `## Architecture Layers`
- `## Transport Adapters`
- `## Implementing Handlers`
- `### Location`
- `### Handler Responsibilities`
- `### Handler Type Annotation`
- `### Example Handler`
- `### Register Handlers`
- `## Implementing Services`
- `### Location`
- `### Service Responsibilities`
- `### Cross-Service Table Access`
- `#### Breaking a circular dependency (`dataServiceRegistry`)`
- `### Example Service`
- `### Write-path defaults`
- `### Row → Entity Mapping`
- `### Service with Transaction`
- `### Transaction Method Naming`
- `## Repository Pattern (Strongly Discouraged)`
- `### Registry Services (Supplementary)`
- `### Registry Sub-Resource Endpoints`
- `## Error Handling`
- `### Using DataApiErrorFactory`
