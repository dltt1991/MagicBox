# 知识库技术设计

> 中文副本，对应英文原文：[docs/references/knowledge/experiment/knowledge-technical-design.md](../knowledge-technical-design.md)。

说明知识库索引、检索、工具和数据流的技术方案。

## 要点

- 知识内容需要入库、索引和向量化。
- 检索工具应返回可引用结果。
- 写入类工具必须遵守操作 guard。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Magic Box Knowledge Base — Technical Design`
- `## 1. Scope`
- `## 2. Storage layout`
- `### 2.1 Snapshot frontmatter (OKF)`
- `## 3. Data model`
- `## 4. index.sqlite schema (7 tables)`
- `### 4.1 meta`
- `### 4.2 material`
- `### 4.3 content`
- `### 4.4 search_unit and the stable unit_id`
- `### 4.5 search_text`
- `### 4.6 embedding`
- `### 4.7 search_text_fts`
- `## 5. Index interface and implementation notes`
- `### 5.1 KnowledgeIndexStore interface`
- `### 5.2 rebuildMaterial atomic replace`
- `### 5.3 chunk offset invariant`
- `### 5.4 embedding contract`
- `### 5.5 embedding / rerank via AiService`
- `### 5.6 Engine portability (better-sqlite3 + sqlite-vec)`
- `## 6. Retrieval`
- `### 6.1 search() wiring and retrieval tuning`
- `### 6.2 Legacy result shape mapping`
- `## 7. Follow-up work`
