# 数据系统参考

> 中文副本，对应英文原文：[docs/references/data/README.md](../README.md)。

Magic Box 的数据层入口，解释 BootConfig、Cache、Preference、DataApi 和数据库的职责边界。

## 要点

- 根据数据生命周期选择正确系统。
- 业务数据走 DataApi 和 SQLite。
- 临时状态走 Cache，用户设置走 Preference，早期启动配置走 BootConfig。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Data System Reference`
- `## Quick Navigation`
- `### System Overview (Architecture)`
- `### Usage Guides (Code Examples)`
- `### Reference Guides (Coding Standards)`
- `### Testing`
- `## Choosing the Right System`
- `### Quick Decision Table`
- `### Decision Flowchart`
- `## System Characteristics`
- `### BootConfigService - Early Boot Configuration`
- `### CacheService - Runtime & Cache Data`
- `### PreferenceService - User Preferences`
- `### DataApiService - User Data`
- `### `app_state` Table - Internal Continuity Markers`
- `## Common Anti-patterns`
- `## Edge Cases`
- `## Architecture Overview`
- `## Related Source Code`
- `### Type Definitions`
- `### Main Process Implementation`
- `### Renderer Process Implementation`
