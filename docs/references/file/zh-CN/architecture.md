# 文件系统架构

> 中文副本，对应英文原文：[docs/references/file/architecture.md](../architecture.md)。

说明文件域的整体架构、主进程服务、渲染端访问和安全边界。

## 要点

- 文件访问应集中在主进程能力内。
- 目录树、预览、清理和附件读取有各自边界。
- 路径校验与权限约束必须在主进程完成。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# File Module Architecture`
- `## 1. Module Scope`
- `### 1.0 Core Principle`
- `### 1.0.1 Semantics of Origin`
- `### 1.0.2 Best-effort Semantics for External`
- `### 1.1 What the File Module Includes`
- `### 1.2 FileManager's Position Within the Module`
- `#### Public / Private Boundaries`
- `### 1.3 Out of Scope`
- `## 2. Type System: Reference vs Data Shape`
- `### 2.1 Two Layers of File Types`
- `### 2.2 `FileHandle`: the Polymorphic Reference`
- `### 2.3 `FileEntry` vs `FileInfo``
- `### 2.4 Signature Selection Guide`
- `## 3. IPC Design`
- `### 3.1 Design Motivation`
- `### 3.2 Handler Dispatch`
- `### 3.3 IPC Method Categories`
- `### 3.4 Operational Semantics for External Files`
- `### 3.5 AI SDK Integration`
- `### 3.6 Mutation Propagation to Renderer (deferred — lands in Phase 2)`
- `## 4. Layered Architecture`
- `### 4.1 No-FS-Side-Effect Path (DataApi)`
- `### 4.1.1 DataApi Boundary: SQL-Only, Fixed Shape`
