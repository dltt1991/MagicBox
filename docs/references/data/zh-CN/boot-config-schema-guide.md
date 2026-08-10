# BootConfig Schema 指南

> 中文副本，对应英文原文：[docs/references/data/boot-config-schema-guide.md](../boot-config-schema-guide.md)。

说明 BootConfig key、schema、默认值和迁移写法。

## 要点

- 新增 key 要在共享 schema 中声明。
- 默认值必须稳定。
- 调用方应通过统一服务读取，而不是手写路径或 JSON 解析。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Boot Config Schema Guide`
- `## When to Use BootConfig`
- `## Key Naming Conventions`
- `### Format`
- `### Examples`
- `## Adding a New Boot Config Key`
- `### Step 1: Add to Schema`
- `### Step 2: Add Custom Types (if needed)`
- `### Step 3: Use in Early Boot Code (if needed)`
- `### Step 4: Access from Renderer / Lifecycle Services`
- `## V1 to V2 Data Migration`
- `### Overview`
- `### How It Works`
- `### Migration Sources`
- `### Adding a Migration Mapping`
- `### Current Mappings`
- `#### AppImage / Windows Portable Executable Path`
- `## File Structure`
- `## Best Practices`
- `## Related Documentation`
