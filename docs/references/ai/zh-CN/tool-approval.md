# 工具审批

## 模型

主进程是审批状态的唯一写入者。渲染端只展示 `approval-requested` tool part，并把用户的决定提交给主进程。主进程把决定应用到数据库权威的 anchor parts，持久化后恢复流。

## 端到端流程

1. 工具需要审批：执行 wrapper 检查 `tool.needsApproval` 和 assistant 的 auto-approve 策略。需要审批时，写出 `approval-requested` part，并让工具 promise 进入等待状态。
2. 流暂停：`AiStreamManager` 把 topic 状态改成 `awaiting-approval`。共享缓存里的 topic status 会让所有窗口同时看到暂停状态。
3. 用户决策：审批卡提交 `approvalId`、`approved`、可选 `reason` / `updatedInput`、`topicId`、`anchorId`。
4. 主进程应用：
   - Claude-Agent 快路径：把决定交给 `AgentSessionRuntimeService.respondToolApproval`，解析 live `canUseTool` promise，继续当前流。
   - MCP 路径：读取 DB 中 anchor message 的 parts，只有目标 approval part 已在 DB 行中时才写入，避免 overlay 先到、持久化后到造成覆盖。
5. 恢复流：当所有审批都已决定，主进程派发 synthetic `continue-conversation` 请求。新流广播 `pending` 时，共享缓存清除 awaiting 状态。

## 持久化决策

`useToolApproval` 只对 MCP 工具提供 `autoApprove` 操作。它会 PATCH server 的 `disabledAutoApproveTools`，让后续同一工具跳过审批卡。非 MCP 工具没有通用的每工具默认审批开关。

## 设计原因

- 渲染端不写审批状态，避免和主进程权威 re-read 竞争。
- 共享缓存保证多窗口一致。
- overlay 可能早于 DB 持久化到达，因此主进程只在 DB 行中确实存在对应 approval part 时写入，避免覆盖并发持久化。
