# BootConfig 概览

> 中文副本，对应英文原文：[docs/references/data/boot-config-overview.md](../boot-config-overview.md)。

说明早期启动配置系统，适合 Electron app ready 前需要读取的设置。

## 要点

- BootConfig 是启动早期可同步读取的配置。
- 适合 Chromium flags、硬件加速等。
- 非启动早期设置应优先使用 Preference。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Boot Config System Overview`
- `## Purpose`
- `## Boot Timing`
- `## Key Characteristics`
- `### Synchronous Loading`
- `### Flat Key-Value Structure`
- `### Atomic File Writes`
- `### Saving`
- `### Error Handling`
- `## Architecture`
- `## Access Convention`
- `### Internal `temp.*` namespace`
- `## BootConfig vs Preference`
- `## PreferenceService Integration`
- `## File Storage`
- `## Related Source Code`
- `## Related Documentation`
