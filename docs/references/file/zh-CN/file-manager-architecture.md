# 文件管理器架构

> 中文副本，对应英文原文：[docs/references/file/file-manager-architecture.md](../file-manager-architecture.md)。

说明文件管理器的模型、服务、UI 和生命周期。

## 要点

- 文件管理器组织用户文件、附件和预览。
- 主进程拥有实际文件系统操作。
- 渲染端通过 typed bridge 或 DataApi 展示状态。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# FileManager Architecture`
- `## 1. Core Concepts`
- `### 1.0 Management Principle`
- `### 1.1 FileEntry`
- `### 1.2 Origin: internal vs external`
- `#### UNC paths`
- `#### Rejected: Unicode (NFC) normalization of `externalPath``
- `#### Rule-evolution discipline`
- `#### Duplicate-entry detection on insert`
- `#### Content-level dedup detection (`contentHash`)`
- `### 1.3 FileRef (Business Reference)`
- `### 1.4 FileHandle / FileInfo — see `architecture.md §2``
- `### 1.5 FileUpload (AI Provider Upload Cache) — deferred`
- `### 1.6 FileManager Implementation Layout (Facade + Private Internals)`
- `#### 1.6.1 Why It Can Be Split`
- `#### 1.6.2 Module Layout`
- `#### 1.6.3 Dependency Passing Convention`
- `#### 1.6.4 Thin-Delegation Facade`
- `#### 1.6.5 FileHandle Dispatch Convention (Adapter Responsibility at the IPC Boundary)`
- `#### 1.6.6 External Access Constraints`
- `#### 1.6.7 Design Trade-offs`
- `#### 1.6.8 Event Emission & Broadcast (deferred)`
- `## 2. Storage Architecture`
- `### 2.1 Physical Path Rules`
