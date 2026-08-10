# 核心架构

## 总览

Magic Box 的 AI 调用集中在主进程。渲染端负责收集输入、订阅流和展示消息；主进程负责 provider 解析、参数构建、工具注入、运行、广播和持久化。

主链路：

```text
Renderer
  -> Ai_Stream_Open IPC
  -> AiStreamManager
  -> ChatContextProvider
  -> AiService.streamText
  -> Agent / AgentSessionRuntime
  -> AI SDK 或 Claude Code SDK
  -> UIMessageChunk
  -> listeners + persistence
```

## Context Provider

不同 topic 由不同 context provider 处理。普通聊天、临时聊天、agent session 都遵守同一个 `PreparedDispatch` 契约，但各自负责自己的数据读取和消息预写。

Agent session provider 会额外校验 session、agent、workspace 和 runtime driver，并创建 pending assistant 行。

## AiStreamManager

`AiStreamManager` 是流生命周期中心：

- 注册 IPC open/attach/detach/abort。
- 按 topic 管理 active stream。
- 支持多 listener。
- 把 chunk 同时广播和持久化。
- 在 terminal 时统一收尾。

## AiService

普通请求进入 `AiService.streamText()` 后，会构建 `buildAgentParams`，创建 AI SDK Agent，并返回 `ReadableStream<UIMessageChunk>`。

如果请求携带 `runtime.kind === 'agent-session'`，它不创建普通 AI SDK Agent，而是转给 `AgentSessionRuntimeService.openTurnStream()`。

## 持久化

主进程拥有最终消息写入权。渲染端可以看到 overlay，但最终状态要以数据库行为准。这样即使窗口关闭、刷新或重连，执行结果仍能落库。
