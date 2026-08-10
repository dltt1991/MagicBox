# Preference 概览

> 中文副本，对应英文原文：[docs/references/data/preference-overview.md](../preference-overview.md)。

说明用户设置系统及其跨窗口同步行为。

## 要点

- Preference 用于用户长期设置。
- main 和 renderer 都通过统一 API 访问。
- 更新会广播到其它窗口。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Preference System Overview`
- `## Purpose`
- `## Key Characteristics`
- `### Fixed Key Structure`
- `### Atomic Values`
- `### Cross-Window Synchronization`
- `## Update Strategies`
- `### Optimistic Updates (Default)`
- `### Pessimistic Updates`
- `## Architecture Diagram`
- `## Main vs Renderer Responsibilities`
- `### Main Process PreferenceService`
- `### Renderer Process PreferenceService`
- `### Statistics (Debug)`
- `## Database Schema`
- `## Preference Categories`
- `### Application Settings`
- `### Feature Toggles`
- `### User Customization`
- `### Provider Configuration`
- `## Usage Summary`
- `## Related Documentation`
