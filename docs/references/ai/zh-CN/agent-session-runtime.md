# 智能体会话运行时

## 目的

Agent session 需要一个稳定的宿主来管理 UI turn、持久化、运行中的后续输入、恢复，以及底层 runtime 的差异。这个宿主不应该知道底层智能体到底是长驻进程、WebSocket、每轮一次 HTTP 请求，还是 Claude Code SDK 的 `query`。

边界如下：

- `AgentSessionRuntimeService` 管 Magic Box 的 UI/session 生命周期。
- `AgentSessionRuntimeDriver` 管具体智能体 runtime 的生命周期。

目前第一个 driver 是 Claude Code。它的 `query`、warm query、SDK 输入队列和 `resume` 都属于 driver 内部细节。

## 职责划分

| 所有者 | 职责 |
|---|---|
| `AgentChatContextProvider` | 校验 agent session，保存用户消息和 pending assistant 消息，并开始 turn 或把后续消息入队 |
| `AgentSessionRuntimeService` | 每个 session 一个 runtime entry：当前 UI turn、pending queue、runtime connection、resume token、监听器、持久化和 idle timer |
| `AgentSessionRuntimeDriver` | 连接具体 agent runtime，提供 `send`、可选 `redirect`、`applyPolicyUpdate`、`close` 和事件流 |
| `AiStreamManager` | 维持普通 topic stream 契约：开始 turn、给 live turn 附加订阅者、暂停当前 runtime turn、启动下一轮 |
| `AiService.streamText()` | 如果请求是 `runtime.kind === 'agent-session'`，路由到 `AgentSessionRuntimeService.openTurnStream()` |
| `ClaudeCodeRuntimeDriver` | 把 Claude SDK 消息转换成通用 runtime events，并把 opaque resume token 映射到 Claude SDK `resume` |

## 新 turn

1. 渲染端对 `agent-session:<sessionId>` 打开 `Ai_Stream_Open`。
2. `AgentChatContextProvider` 校验 session：必须有关联 agent 和 workspace，workspace 路径必须合法，agent type 必须有 runtime driver，agent 必须有模型。
3. provider 原子保存用户消息和 pending assistant 消息。
4. provider 调用 `AgentSessionRuntimeService.beginTurn(...)`。
5. `beginTurn()` 返回 runtime persistence listener、terminal listener、trace flush listener、`turnId` 和 abort controller。
6. 准备好的 model request 带上 `runtime: { kind: 'agent-session', sessionId, turnId }`。
7. `AiStreamManager` 启动执行。`AiService.streamText()` 检测到 runtime metadata 后调用 `openTurnStream()`。
8. `openTurnStream()` 保证 runtime connection 存在，并通过 `connection.send({ message })` 接纳 turn。

## 运行中的后续输入

如果同一个 topic 已经有 live stream，`AgentChatContextProvider` 不会创建新的 assistant placeholder，也不会再次 `beginTurn()`。它只保存新的用户消息，然后交给 `AgentSessionRuntimeService.enqueueUserMessage()`。

运行中后续输入有两种处理方式：

- 如果当前 driver 支持 redirect，并且新输入的模型、reasoning、fast mode、知识库 scope 与当前 turn 一致，就注入当前 turn。Claude Code 通过 `PreToolUse` hook 在下一次工具调用前把它作为 `additionalContext` 加进去。
- 否则放入 `pendingTurns`，等当前 turn terminal 并完成持久化后再开启下一轮。

如果注入发生，driver 会在后续 assistant 输出前发出 `steer-boundary`。host 会把 assistant 行拆开：边界前的内容落在旧 assistant 行，边界后的内容进入新的 continuation 行，让用户后续输入在排序上位于两段 assistant 输出之间。

## 启动下一轮

当前执行达到 terminal，且持久化释放 runtime 所有权后，`startNextTurn()` 才会读取并移出队列中的下一条用户消息。它会：

1. 从 `pendingTurns` 取出下一条用户消息。
2. 保存一个新的 pending assistant 行。
3. 创建新的 `turnId`。
4. 调用 `AiStreamManager.startRuntimeTurn(...)`。

runtime connection 可以继续保留。Claude Code 会复用 SDK query / input queue，其他 driver 可以选择 WebSocket 或每轮重新连接。

## Resume token

driver 可以发出：

```ts
{ type: 'resume-token'; token: string }
```

host 把 token 当作 opaque 值保存为 `entry.lastResumeToken`，并在 terminal 持久化时写进 assistant 消息的 `runtimeResumeToken`。对 Claude Code 来说，这个 token 就是 SDK 的 `session_id`，下一次连接时映射为 `options.resume`。

## Claude Code driver

Claude Code driver 连接时会调用 `buildClaudeCodeQueryRequestForAgentSession(sessionId, resumeToken)`。resume token 来源优先级是：

1. host 显式传入的 resume token。
2. 数据库里最近一条 agent-session assistant 消息上的 `runtimeResumeToken`。
3. 全新 SDK session，无 resume。

driver 把 Claude SDK 消息转换为 runtime events：

- `stream_event`、assistant/user message 转为 `chunk`。
- `system/init` 转为 `resume-token`。
- `result` 刷新 usage、context usage，并发出 `turn-complete`。
- steer 注入产生 `steer-boundary` 或 `steer-undelivered`。
- compaction 状态转为 compaction 事件。
- 异常转为 `error`，必要时尽量恢复为 terminal 事件。

## 空闲与关闭

runtime connection 会在 turn 之间保持 warm，以降低下一轮延迟。空闲超过 TTL 后由 host 关闭。用户 Stop 是主要的 abort 来源，会关闭 session entry，并让底层连接释放资源。
