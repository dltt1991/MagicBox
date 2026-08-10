# 可观测性

## 目标

AI 子系统通过 OpenTelemetry 和本地投影记录一次请求的执行链路。trace 用于把主进程 turn、provider 调用、工具调用、Claude Code 子进程事件关联起来。

## Trace 结构

Agent session 使用 session 级 trace id。每个 turn 创建 `ai.turn` span，Claude Code 子进程通过 trace env / traceparent 加入同一棵 trace tree。

## Span 来源

- `AiStreamManager` 拥有 root/turn 生命周期。
- AI SDK adapter 投影 provider 调用和工具调用。
- Claude Code driver 转换 SDK 事件、工具耗时和 usage。
- Persistence 和 terminal listener 在结束时 flush trace。

## 本地投影

除了 OTel，系统还会把部分 span 信息投影到本地读模型，供 UI 展示性能、用量和工具耗时。

## 原则

- 工具耗时和 provider usage 分开记录。
- 不凭空从总耗时推断 TTFT 或 completion 时间。
- resume、steer、compaction 等 runtime 事件要能关联到同一个 session trace。
