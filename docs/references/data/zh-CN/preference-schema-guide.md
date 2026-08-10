# Preference Schema 指南

> 中文副本，对应英文原文：[docs/references/data/preference-schema-guide.md](../preference-schema-guide.md)。

说明新增 preference key、类型、默认值和迁移规则。

## 要点

- 所有 key 必须在 schema 中声明。
- 默认值要满足新安装和迁移用户。
- 用户可见设置应避免硬编码默认散落在组件里。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Preference Schema Guide`
- `## Key Naming Conventions`
- `### Format`
- `### Naming Principles`
- `### Examples`
- `## Design Principles`
- `### Prefer Flat Over Nested`
- `### Keep Values Atomic`
- `### Provide Sensible Defaults`
- `## Adding a New Preference`
- `### Step 1: Define Custom Types (if needed)`
- `### Step 2: Add to Schema Interface`
- `### Step 3: Add Default Value`
- `### Step 4: Use in Code`
- `## File Structure`
- `## Best Practices Summary`
- `## Related Documentation`
