# Composer 富剪贴板

> 中文副本，对应英文原文：[docs/references/messaging/composer-rich-clipboard.md](../composer-rich-clipboard.md)。

说明 composer 如何处理富文本、附件、剪贴板和消息 part。

## 要点

- 粘贴内容要转换为结构化 parts。
- 附件与文本需要分别路由。
- Chat 和 Agent 应共享可复用的输入边界。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Composer Rich Clipboard`
- `## Goals`
- `## Clipboard Shape`
- `## Flow`
- `## Synchronous Paste`
- `## Restore Rules`
- `## Boundaries`
- `## Focused Verification`
