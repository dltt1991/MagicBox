# 数据库 Seed 指南

> 中文副本，对应英文原文：[docs/references/data/database-seeding-guide.md](../database-seeding-guide.md)。

说明内置数据、幂等 seed 和版本化数据修复的写法。

## 要点

- seed 必须幂等。
- 不要依赖执行次数表达状态。
- 内置资源更新要考虑用户修改和已有数据。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Database Seeding Guide`
- `## Overview`
- `## Architecture`
- `### Components`
- `### Execution Flow`
- `## Execution Policies`
- `## Version Strategies`
- `### Auto Checksum`
- `### Data-Source Version`
- `### Manual Version`
- `## Adding a New Seeder`
- `### 1. Create the seeder class`
- `### 2. Register in `seederRegistry.ts``
- `## Important Notes`
