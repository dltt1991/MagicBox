# 知识库工作流架构

> 中文副本，对应英文原文：[docs/references/knowledge/workflow-architecture.md](../workflow-architecture.md)。

说明导入、索引、检索、更新和工具调用的工作流。

## 要点

- 导入和索引可以异步。
- 检索结果要能回到原始文档。
- 工作流状态应可观测、可恢复。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Knowledge Workflow Architecture`
- `## Goals`
- `## Workflow Entry Points`
- `## Scheduling Model`
- `## Recursive Container Expansion`
- `## Job Types`
- `## Mutation And Crash Semantics`
