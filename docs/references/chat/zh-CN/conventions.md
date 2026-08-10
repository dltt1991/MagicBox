# 聊天约定

> 中文副本，对应英文原文：[docs/references/chat/conventions.md](../conventions.md)。

记录聊天域的命名、状态、消息组织和交互约定。

## 要点

- topic 是聊天流和历史的主要寻址单位。
- 消息状态必须能表达 pending、success、error、paused 等终态。
- UI 层应读取权威数据，不直接伪造持久化结果。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Chat UI Design & Conventions`
- `## Design division`
- `## Conventions`
- `### Context`
- `### Refs`
- `### Render stability`
- `### Composition`
