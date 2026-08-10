# 数据库测试

> 中文副本，对应英文原文：[docs/references/testing/database-testing.md](../database-testing.md)。

说明数据库相关测试的统一模式。

## 要点

- 使用 `setupTestDatabase()`。
- 测试应跑真实迁移和文件数据库。
- 不要手写 CREATE TABLE 或 mock Drizzle 链。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Database Testing Guide`
- `## TL;DR`
- `## What the Harness Does`
- `## When to Use the Harness`
- `### Do use it for`
- `### Do NOT use it for`
- `## Options`
- `## Migration Recipes`
- `### Removing a legacy `vi.mock('@application', ...)` override`
- `### Replacing mock-chain assertions with state assertions`
- `## Anti-Patterns`
- `### Do NOT mock `@application` to override `DbService``
- `### Do NOT hand-write `CREATE TABLE` SQL in tests`
- `### Do NOT use `describe.concurrent` / `test.concurrent` within a harness scope`
- `### Do NOT nest `setupTestDatabase()` calls`
- `### Do NOT re-add `vi.mock('node:fs', importOriginal)` in test files`
- `## Gotchas`
- `### better-sqlite3 native module ABI`
- `### FTS5 and NULL content`
- `### Truncate vs drop`
- `## The Mock System`
