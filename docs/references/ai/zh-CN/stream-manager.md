# 流管理器

## 职责

`AiStreamManager` 管理 AI 流的生命周期。它不是具体模型调用者，而是 topic 级别的执行编排器。

主要职责：

- 注册 stream IPC。
- 按 `topicId` 维护 active stream。
- 管理 listener 的 attach/detach。
- 启动 model execution。
- 处理 abort、pause、terminal。
- 将 chunk 分发给 UI、SSE、channel adapter 和 persistence。

## Topic 级寻址

所有流都以 `topicId` 为 key。普通聊天 topic 和 agent session topic 都走同一套 stream 管线。Agent session 的 topic 形如：

```text
agent-session:<sessionId>
```

同一个 topic 同时最多一个 live stream。新 listener 可以附加到已有 stream。

## Dispatch

打开流时，manager 调用 dispatch。dispatch 选择第一个能处理该 topic 的 `ChatContextProvider`。provider 返回：

- topic id
- 要执行的 models
- listeners
- 预留/已持久化的消息
- lifecycle 信息

## 执行

manager 为每个 model 创建 execution，并调用 `AiService.streamText()`。得到的 `ReadableStream<UIMessageChunk>` 会进入共享的 pipe loop。

## Chunk 管道

pipe loop 把流拆成两条逻辑路径：

- 广播路径：把 chunk 发给 webContents、SSE、channel adapter 等 listener。
- 聚合路径：用 `readUIMessageStream` 累积最终 `CherryUIMessage`，交给 persistence backend 写入。

## Abort 与 pause

用户 Stop 会通过 manager 传播 abort。普通聊天可以中止并在后续重启；agent session 的 Stop 会关闭 runtime session，因为它可能持有 warm query、子进程和工具状态。

工具审批会让 stream 进入 paused/awaiting 状态。审批完成后主进程派发继续请求。

## 不变量

- 主进程拥有流和持久化。
- listener 不拥有流，窗口关闭不会自动杀死执行。
- terminal 只结算一次。
- 持久化完成后，渲染端通过 DB 刷新替换 overlay。
