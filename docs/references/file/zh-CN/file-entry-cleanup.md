# 文件条目清理

> 中文副本，对应英文原文：[docs/references/file/file-entry-cleanup.md](../file-entry-cleanup.md)。

说明文件索引或文件条目如何清理失效引用。

## 要点

- 清理逻辑应是幂等的。
- 删除文件和删除数据库引用要区分。
- 后台清理不能阻塞普通读取路径。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# File Entry Cleanup (GC) Design`
- `## 1. Problem`
- `## 2. Design Goals`
- `## 3. Non-goals`
- `## 4. Business Intent: `cleanup_policy``
- `### 4.1 Assignment at creation — business-owned creation paths are `delete_when_unreferenced``
- `### 4.2 Policy transitions`
- `### 4.3 Renderer visibility`
- `## 5. Cleanup Pass (Reaper)`
- `### 5.1 Candidate query`
- `### 5.2 Grace window`
- `### 5.3 Safety: no volume-based abort`
- `### 5.4 Per-candidate protocol`
- `### 5.5 Triggering`
- `### 5.6 Failure handling & observability`
- `## 6. Race and Failure Analysis`
- `### 6.1 What spends the FS sweep's weekly floor`
- `## 7. Migration & Rollout`
- `### 7.1 Schema migration`
- `### 7.2 v1 migrator classification — by reference state`
- `### 7.3 Breaking-changes log`
- `## 8. Contract & Documentation Updates`
- `## 9. Test Plan`
- `## 10. Rejected Designs`
