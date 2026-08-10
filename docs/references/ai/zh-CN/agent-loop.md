# Agent Loop

## 是什么

`Agent` 包装了 `@cherrystudio/ai-core` 的 `createAgent(...).stream()`。底层基于 AI SDK 的 `ToolLoopAgent`，上层增加了 hook 组合、内部观察者、usage 观测、工具执行事件和统一的 `ReadableStream<UIMessageChunk>` 输出。

`Agent.stream()` 是单次流：它只运行一次 AI SDK stream 并把结果向外管道化。它不在流中途插入新消息。普通聊天的 steer 由 stream manager 通过中止并重启处理；agent session 则由自己的 runtime 队列处理。

## API

```ts
const agent = new Agent({
  providerId,
  providerSettings,
  modelId,
  plugins,
  tools,
  system,
  options,
  hookParts,
  messageId
})

const stream = agent.stream(initialMessages, signal)
const result = await agent.generate({ messages }, signal)
```

`stream()` 和 `generate()` 共用同一个底层 agent，只是 AI SDK 调用方式不同。

## Hook 模型

Agent loop 支持这些 hook：

```ts
interface AgentLoopHooks {
  onStart?: () => Promise<void> | void
  prepareStep?: PrepareStepFunction
  onStepFinish?: (step) => Promise<void> | void
  onToolExecutionStart?: (event) => Promise<void> | void
  onToolExecutionEnd?: (event) => Promise<void> | void
  onFinish?: () => Promise<void> | void
  onAbort?: () => Promise<void> | void
  onError?: (ctx) => 'retry' | 'abort'
}
```

hook 来源有三类：

1. 内部观察者，例如 usage observer。
2. `RequestFeature` 贡献的 hook。
3. 调用方传入的 hook，例如 AiService 的 analytics hook。

组合规则是确定性的：多数 hook 顺序执行；`prepareStep` 链式传递；`onError` 逐个执行，只要有一个要求 retry，结果就是 retry。

## 工具执行事件

AI SDK 目前没有完整包围单个 `tool.execute` 的 Agent 级 hook，因此 Magic Box 在工具外层包了一层，用来发出 `onToolExecutionStart` 和 `onToolExecutionEnd`。未来 SDK 如果提供同等能力，可以移除这层包装，hook 签名保持不变。

## Steering

普通 `Agent.stream()` 不支持 in-loop steering。运行中提交新聊天消息时，stream manager 会在上一层中止当前 turn、持久化为 paused，然后启动新 turn。

Agent session 不同：它维护自己的 `pendingTurns`，并在 turn 边界或 driver 支持的位置处理后续输入。

## 错误与中止

- `AbortSignal` 会贯穿 `stream()` 和 `generate()`。
- 中止时调用 `onAbort`，不走 `onError`。
- 抛错会进入 `onError`，目前 retry 语义预留，实际调用级 retry/fallback 在更底层的 model wrapper 中完成。
- 可信本地工具可以返回结构化 terminal failure，让 Agent 在 step 边界终止。
- writer 只会 settle 一次，避免半关闭流。
