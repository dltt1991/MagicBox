# Knowledge Service

> 中文副本，对应英文原文：[docs/references/knowledge/knowledge-service.md](../knowledge-service.md)。

说明知识库服务的职责、读写边界和与 AI 工具的关系。

## 要点

- 服务层维护知识库业务不变量。
- 检索、读取和管理工具通过服务访问数据。
- 耗时索引任务应与交互路径解耦。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Knowledge Service`
- `## Overview`
- `## Caller Contract`
- `## IPC Surface`
- `## Runtime Behavior`
- `## Delete And Reindex`
- `## Base Restore`
- `### Migrated Bases With Missing Embedding Models`
- `## Search`
- `### Current Retrieval Cost Assumption`
