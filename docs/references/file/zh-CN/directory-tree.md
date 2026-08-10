# 目录树

> 中文副本，对应英文原文：[docs/references/file/directory-tree.md](../directory-tree.md)。

说明目录树读取、监听、更新和渲染端消费方式。

## 要点

- 目录树用于浏览系统 workspace 或文件区域。
- 主进程负责读取和变更通知。
- 渲染端只消费结构化树节点。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Directory Tree Architecture`
- `## 1. Positioning`
- `### 1.1 Why a Separate Primitive`
- `### 1.2 Why It's Not Just `chokidar` Inline`
- `### 1.3 Relationship to DirectoryWatcher`
- `## 2. Module Layout`
- `### 2.1 Why `search.ts` and `gitignore.ts` Live Here`
- `### 2.2 No `@main/data` Imports`
- `## 3. Resource Model`
- `### 3.1 Identity: `treeId` vs `(rootPath, options)``
- `### 3.2 Dispose Grace Window`
- `### 3.3 In-Flight Cancellation`
- `### 3.4 webContents-Destroyed Cascade`
- `### 3.5 Children Ordering`
- `## 4. IPC Contract`
- `### 4.1 Routes`
- `### 4.2 Validation`
- `### 4.3 Renderer Surface`
- `### 4.4 Explicit Rename`
- `## 5. `TreeNode` Class Hierarchy`
- `### 5.1 Why Classes, Not Plain DTOs`
- `### 5.1.1 Why `TreeDirRoot` Is a Separate Class`
- `### 5.2 Wire Shape: `SerializedTreeNode``
- `### 5.3 Mutation Events`
