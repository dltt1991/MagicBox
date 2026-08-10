# 数据库构造

> 中文副本，对应英文原文：[docs/references/data/database-construction.md](../database-construction.md)。

说明 SQLite/Drizzle 数据库初始化、连接和 schema 装配方式。

## 要点

- 数据库由 DbService 管理。
- schema 和迁移要保持一致。
- 测试应使用统一数据库 helper，而不是手写表结构。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Database Construction (Build, Migrations, Custom SQL, FTS5)`
- `## 1. Boot init order`
- `## 2. Drizzle migrations`
- `### regenerate, never rename`
- `### Additive vs table-rebuild`
- `## 3. Custom SQL (`CUSTOM_SQL_STATEMENTS`)`
- `### Cost: O(1) metadata, ~0.1 ms — do NOT gate it on "did a migration run"`
- `### Two buckets — where work belongs`
- `### Idempotency rules`
- `## 4. FTS5 external-content tables`
- `### Never key on the implicit `rowid` — key on a stable `fts_rowid` column`
- `### Verification: only `integrity-check, 1` is reliable`
- `### `fts_rowid` properties`
- `### Knowledge `search_text_fts` follows the same rule`
- `## 5. Testing the build`
- `## 6. Gotchas (quick reference)`
