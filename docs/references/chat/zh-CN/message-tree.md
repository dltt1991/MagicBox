# 消息树

> 中文副本，对应英文原文：[docs/references/chat/message-tree.md](../message-tree.md)。

说明聊天消息如何组成分支树，以及父子消息、重试、编辑和分支切换的关系。

## 要点

- 消息以 parent/anchor 关系形成树。
- 重试或编辑会产生新的分支。
- 当前分支决定渲染端展示的线性对话。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Message Tree`
- `## Structure`
- `### Virtual root`
- `### Persisted awaiting-input branches`
- `## Invariants`
- `## Delete semantics`
- `## Consumer contract`
- `## Related`
