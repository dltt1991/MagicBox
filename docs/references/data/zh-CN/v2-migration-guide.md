# v2 数据迁移指南

> 中文副本，对应英文原文：[docs/references/data/v2-migration-guide.md](../v2-migration-guide.md)。

说明 v1 到 v2 数据迁移、兼容边界和已发布迁移的维护规则。

## 要点

- 迁移链已经承载真实用户数据，不能重写。
- v1 residue 只通过迁移器进入 v2。
- schema 变更必须生成新的迁移。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Migration V2 (Main Process)`
- `## Version Upgrade Requirements`
- `### Why a linear path?`
- `### How it works`
- `### Blocking rules`
- `### Pre-release versions`
- `### Relationship with the auto-updater`
- `## Directory Layout`
- `## Core Contracts`
- `## Migrators`
- `## Utilities`
- `## Window & IPC Integration`
- `## Implementation Checklist for New Migrators`
- `## Order-Key Stamping in Migrators`
