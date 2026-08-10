# 图片预览

> 中文副本，对应英文原文：[docs/references/components/image-preview.md](../image-preview.md)。

说明图片预览组件的加载、缩放、错误态和附件展示约定。

## 要点

- 预览应支持本地文件、生成图片和消息附件。
- 错误态需要可恢复且不破坏消息布局。
- 图片元信息和操作按钮应保持轻量。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Image Preview Components`
- `## Overview`
- `## Supported Formats`
- `## Architecture`
- `## Core Components`
- `### ImagePreviewLayout`
- `### ImageToolbar`
- `### useDebouncedRender Hook`
- `## Component Implementations`
- `### MermaidPreview`
- `### PlantUmlPreview`
- `### SvgPreview`
- `### GraphvizPreview`
- `## Shared Functionality`
- `### Error Handling`
- `### Loading States`
- `### Interactive Controls`
- `### Performance Optimizations`
- `## Integration with CodeBlockView`
