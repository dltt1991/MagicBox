# 代码块视图

> 中文副本，对应英文原文：[docs/references/components/code-block-view.md](../code-block-view.md)。

说明代码块组件的显示、复制、语言识别和交互行为。

## 要点

- 代码内容应保持原样，不翻译标识符或命令。
- 语言标签用于高亮和操作按钮。
- 组件需要适配流式输出和最终消息两种状态。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Code Block Rendering`
- `## Overview`
- `## Component Structure`
- `## Stable Markdown Renderers`
- `## View State`
- `## Streaming Behavior`
- `## Tool System`
- `## Content Surfaces`
- `### CodeViewer`
- `### CodeEditor`
- `### Special Previews`
