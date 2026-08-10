# 执行 Overlay

## 目的

数据库消息是最终权威状态，但流式输出需要即时显示。Execution overlay 负责把正在执行的 assistant 输出临时叠加到已持久化消息上。

## 核心概念

- `TopicStreamSubscription` 订阅主进程广播的 chunk。
- `useExecutionOverlay` 根据 active executions 维护运行中 assistant 消息。
- `useMessageStreamingLayers` 把数据库消息、overlay、live assistant 合成最终 UI。

## 交接

当流进入 terminal 后，主进程持久化最终 assistant 消息。渲染端通过 handoff 刷新数据库消息，并清理 overlay。这样可以避免“流式消息”和“数据库最终消息”同时显示两份。

## 为什么需要 overlay

如果 UI 只读数据库，流式体验会迟钝；如果 UI 只信本地状态，窗口关闭或重连会丢上下文。overlay 让 UI 快，数据库让结果可靠。
