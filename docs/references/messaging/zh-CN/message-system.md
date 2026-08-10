# 消息系统

> 中文副本，对应英文原文：[docs/references/messaging/message-system.md](../message-system.md)。

说明 Cherry message、UI message、parts、blocks 和持久化之间的关系。

## 要点

- 消息由多个 part 组成。
- 工具调用、引用、图片、reasoning 都是结构化内容。
- 主进程负责最终消息快照。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Message System`
- `## Message Lifecycle`
- `# messageBlock.ts Usage Guide`
- `## Core Goals`
- `## Key Concepts`
- `## State Structure`
- `## Actions`
- `## Selectors`
- `## Integration`
- `# messageThunk.ts Usage Guide`
- `## Core Functions`
- `## Key Thunks`
- `### 1. `sendMessage(userMessage, userMessageBlocks, assistant, topicId)``
- `### 2. `fetchAndProcessAssistantResponseImpl(dispatch, getState, topicId, assistant, assistantMessage)``
- `### 3. `loadTopicMessagesThunk(topicId, forceReload)``
- `### 4. Delete Thunks`
- `### 5. Resend/Regenerate Thunks`
- `### 6. `appendAssistantResponseThunk(topicId, existingAssistantMessageId, newModel, assistant)``
- `### 7. `cloneMessagesToNewTopicThunk(sourceTopicId, branchPointIndex, newTopic)``
- `### 8. `initiateTranslationThunk(messageId, topicId, targetLanguage, sourceBlockId?, sourceLanguage?)``
- `## Internal Mechanisms`
- `# useMessageOperations.ts Usage Guide`
- `## Core Goals`
- `## How to Use`
