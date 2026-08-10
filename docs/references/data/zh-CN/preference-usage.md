# Preference 使用指南

> 中文副本，对应英文原文：[docs/references/data/preference-usage.md](../preference-usage.md)。

说明如何在 main/renderer 中读取和更新用户偏好。

## 要点

- 渲染端使用 usePreference。
- 主进程通过 PreferenceService 访问。
- 业务逻辑应读语义化 key，而不是复制状态。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Preference Usage Guide`
- `## React Hooks`
- `### usePreference (Single Preference)`
- `### usePreferences (Multiple Preferences)`
- `## Update Strategies`
- `### Optimistic Updates (Default)`
- `### Pessimistic Updates`
- `## PreferenceService Direct Usage`
- `### Renderer Process`
- `### Set Preferences`
- `### Subscribe to Changes`
- `### Main Process`
- `## Common Patterns`
- `### Settings Form`
- `### Feature Toggle`
- `### Conditional Rendering Based on Settings`
- `### Batch Settings Update`
- `## Adding New Preference Keys`
- `## Best Practices`
- `## Preference vs Other Storage`
