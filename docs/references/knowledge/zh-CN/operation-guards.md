# 知识库操作 Guard

> 中文副本，对应英文原文：[docs/references/knowledge/operation-guards.md](../operation-guards.md)。

说明知识库写入、删除和批量操作前的保护规则。

## 要点

- 危险操作需要清晰校验。
- Agent 发起的写操作要有权限和上下文约束。
- 错误信息应可解释且便于恢复。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Knowledge Operation Guards`
- `## Shared Helpers`
- `### `assertBaseCanRunRuntimeOperation``
- `### `KnowledgeItemService.getOutermostSelectedItemIds``
- `### Subtree Status Reconciliation`
- `### Hard Delete File Cleanup`
- `### `assertSubtreesCanReindex``
- `### Chunk Operations`
- `## `addItems``
- `### Why Enqueue Failure Marks Items Failed`
- `## `deleteItems``
- `### Why Enqueue Failure Rolls Back `deleting``
- `### Why Delete Cleanup Failure Does Not Mark Items `failed``
- `## `reindexItems``
- `### Why Reindex Requires Terminal Subtrees`
- `### Why Reindex Does Not Pre-Mark Items Active`
- `### Delete Wins Reindex Races`
- `### Why Reindex Keeps Schedule-Failure Compensation`
- `### Reindex File Ownership`
- `## `prepare-root``
- `## Shutdown`
- `## Review Checklist`
