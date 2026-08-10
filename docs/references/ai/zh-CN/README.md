# AI 参考文档

这里是 Magic Box v2 AI 管线的中文入口。AI 能力主要运行在主进程中，包括聊天流、智能体循环、翻译、摘要、工具调用、MCP、持久化和渲染端传输。

## 顶层架构

| 文档 | 内容 |
|---|---|
| [核心架构](./core-architecture.md) | 从 `Ai_Stream_Open` IPC 到上下文提供器、`AiStreamManager`、Agent loop、AI SDK、广播和持久化的完整链路 |
| [流管理器](./stream-manager.md) | 活跃流注册表、监听器、重连、中止、重启式 steer、持久化后端 |
| [智能体会话运行时](./agent-session-runtime.md) | Agent session 的 host/driver 分层、`pendingTurns` 队列、resume token、Claude Code driver fallback |
| [适配器族](./adapter-family.md) | 如何通过 `provider.endpointConfigs[ep].adapterFamily` 为每次请求选择对应的 `@ai-sdk/*` 包 |

## 子系统

| 文档 | 内容 |
|---|---|
| [Agent Loop](./agent-loop.md) | 主进程 `Agent.stream()`：单次流、hook 组合、观察者模式、错误和中止语义 |
| [Agent Prompt 分层](./agent-prompt-layers.md) | Agent system prompt、workspace `system.md`、`SOUL.md`、优先级、更新边界和变量生命周期 |
| [参数管线](./params-pipeline.md) | `buildAgentParams` 与 `RequestFeature`：能力、插件、工具和 provider 特性的组合方式 |
| [工具注册表](./tool-registry.md) | 内置工具、MCP 工具、meta-tools、延迟暴露机制 |
| [聊天附件](./chat-attachments.md) | 附件如何进入模型：原生文件 part、截断文本、`read_file` 分页读取 |
| [Provider 解析](./provider-resolution.md) | `Provider.endpointConfigs`、endpoint 解析链、variant suffix、自定义 provider 扩展 |
| [模型重试与回退](./model-retry.md) | `ai-retry`：同模型重试、用户配置的 fallback models、`wrapModel`、偏好项 |
| [可观测性](./observability.md) | `AiSdkSpanAdapter`、root span 传播、OTel 属性、本地 span 投影 |
| [AI 用量记录](./ai-usage-records.md) | provider 调用级别的 usage/cost 记录、归属快照、消息投影、查询 API |
| [图片生成参数](./image-generation-parameters.md) | 图片生成参数在不同 provider / model 间的归一化与传递 |

## 渲染端衔接

| 文档 | 内容 |
|---|---|
| [IPC 传输](./ipc-transport.md) | `useChat` + `IpcChatTransport`：发送、重连、dispatch 协调、topic 状态镜像 |
| [执行 Overlay](./execution-overlay.md) | `TopicStreamSubscription` + `useExecutionOverlay`：运行中消息叠加、终态交接 |
| [工具审批](./tool-approval.md) | 审批注册表、主进程作为唯一写入者、持久化决策、`useToolApproval` hook |

## 代码位置

```text
src/main/ai/
├── AiService.ts
├── runtime/
│   ├── aiSdk/
│   └── claudeCode/
├── agentSession/
├── agents/
├── channels/
├── streamManager/
├── provider/
├── mcp/
├── skills/
├── tools/
├── observability/
├── messages/
├── types/
└── utils/
```

## 一次聊天/智能体 turn 的基本流向

1. 渲染端通过 `IpcChatTransport` 发送消息，打开 `Ai_Stream_Open`。
2. `AiStreamManager` 接收 IPC，创建 `WebContentsListener`，再交给 dispatch。
3. dispatch 根据 `topicId` 选择合适的 `ChatContextProvider`，例如普通聊天、临时聊天或 `agent-session`。
4. context provider 负责解析模型、保存用户消息、创建监听器，并返回 `PreparedDispatch`。
5. `AiStreamManager.send()` 启动一个或多个模型执行。
6. 普通聊天会进入 `AiService.streamText()`，构建参数并创建 AI SDK `Agent`。
7. Agent session 是例外：它会被路由到 `AgentSessionRuntimeService.openTurnStream()`，让注册的 runtime driver 接管具体运行时。
8. `pipeStreamLoop` 把流拆成两路：一路广播给 UI，一路聚合成最终消息并持久化。
9. 终态包括完成、错误、中止、等待审批。主进程写入最终消息，渲染端重新读取数据库行并清理 overlay。

## 关键不变量

- 所有流以 `topicId` 为寻址单位。
- 同一个 topic 同时最多只有一个活跃流。
- 主进程拥有持久化权；渲染端关闭不会丢失主进程中的执行结果。
- 工具审批由主进程权威写入，渲染端只提交用户决策。
- endpoint 的 adapter family 是按 endpoint 决定，而不是按 provider 名称猜测。

## 相关参考

- [服务生命周期](../../lifecycle/README.md)
- [数据层](../../data/README.md)
- [消息系统](../../messaging/message-system.md)
- [窗口管理](../../window-manager/README.md)
