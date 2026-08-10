# Terminal Workspace 设计规格

> 中文副本，对应英文原文：[docs/superpowers/specs/2026-07-29-terminal-workspace-design.md](../2026-07-29-terminal-workspace-design.md)。

说明 Terminal workspace 的产品目标、交互、布局和技术约束。

## 要点

- 工作区围绕真实系统终端和文件树展开。
- 布局需要支持多标签、预览和可调面板。
- 状态需要跨重启持久化。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Terminal Workspace Design`
- `## Context`
- `## Goals`
- `## Non-Goals`
- `## Entry And Navigation`
- `## Main Process Terminal Runtime`
- `## Filesystem Workspace`
- `## Renderer Architecture`
- `## Terminal Renderer`
- `## Preview Behavior`
- `## State Model`
- `## Error Handling`
- `## Dependencies`
- `## Testing`
- `## Open Questions Resolved`
