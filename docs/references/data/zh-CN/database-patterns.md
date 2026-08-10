# 数据库模式

> 中文副本，对应英文原文：[docs/references/data/database-patterns.md](../database-patterns.md)。

说明事务、查询、写入序列化、FTS、迁移等数据库实践。

## 要点

- better-sqlite3 是同步驱动。
- 多步写入用 withWriteTx 保证原子性。
- 迁移必须向前追加，不能重写已发布迁移。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Database Schema Guidelines`
- `## Schema File Organization`
- `### Principles`
- `### Decision Criteria`
- `### File Naming`
- `## Naming Conventions`
- `## Column Helpers`
- `### Primary Keys`
- `### Timestamps`
- `## JSON Fields`
- `## Column Nullability and Defaults`
- `### When `nullable` vs `NOT NULL``
- `#### Common offender: boolean columns without `.notNull()``
- `### Where the default value lives`
- `## Foreign Keys`
- `### Basic Usage`
- `### Self-Referencing Foreign Keys`
- `### Circular Foreign Key References`
- `## Migrations`
- `## Field Generation Rules`
- `### Auto-generated fields (NEVER set manually)`
- `### Using `.returning()` pattern`
- `### Row → Entity Mapping`
- `### Soft delete support`
