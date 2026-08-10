# 聊天适配器

> 中文副本，对应英文原文：[docs/references/chat/adapters.md](../adapters.md)。

说明聊天消息、模型消息和 UI 消息之间的适配方式。

## 要点

- 渲染端以 UI parts 表达消息。
- 主进程在发送前转换为 provider/model 所需结构。
- 适配器负责处理附件、工具调用、推理内容和错误输出。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Chat Adapters`
- `## Resource List`
- `## Composer`
- `## Right Pane Registry`
- `## Message Action Registry`
- `## Render Stability`
- `## Boundaries`
