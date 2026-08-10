# Terminal Workspace 实施计划

> 中文副本，对应英文原文：[docs/superpowers/plans/2026-07-29-terminal-workspace.md](../2026-07-29-terminal-workspace.md)。

说明 Terminal workspace 功能的分阶段实施计划。

## 要点

- 新增 `/app/terminal` 页面。
- 组合终端、目录树和文件预览。
- 每个任务都包含验证步骤和提交边界。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Terminal Workspace Implementation Plan`
- `## Global Constraints`
- `## File Structure`
- `### Task 1: Sidebar Entry And Route`
- `### Task 2: Terminal IPC And Main PTY Runtime`
- `### Task 3: Terminal Renderer Sessions And Xterm Host`
- `### Task 4: Workspace File Tree And Embedded Preview`
- `### Task 5: Resizable FanBox-Style Layout And Path Interactions`
- `### Task 6: Integration Polish And Repository Verification`
