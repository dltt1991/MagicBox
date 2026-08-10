# 作业和调度程序 — 架构概述

两个独立的主进程生命周期服务：

|服务|角色|坚持|直接消费者|
|---|---|---|---|
|**调度服务**|“何时触发回调” — cron / 间隔 / 一次。无国籍。|没有任何|JobManager + 任何需要简单时间调度的模块|
|**工作经理**|“作业生命周期”——注册、持久化、6状态机、调度、恢复|`jobTable` + `jobScheduleTable`|所有后台工作|

**分层规则**：SchedulerService 不知道作业。 JobManager 使用 SchedulerService 来安排计划。业务模块根据需要选择一个：

- 需要 cron + 持久可观察性 + 重试 → 注册一个 JobHandler + 使用 `jobManager.registerJobSchedule()`
- 仅需要 cron（心跳式，无持久性）→ 直接 `schedulerService.registerSchedule()`
- 需要重复服务-内部GC/自检→`BaseService.registerInterval`（项目约定，不是SchedulerService）

## DB驱动调度

`jobTable` 是**单一事实来源**。内存状态（处理程序映射、队列映射、AbortControllers）是 JobManager 在每次启动时重建的派生视图。

每个队列都有一个持有 `{ name, concurrency, mutex }` 的 `DispatchQueue` 实例。调度循环（`JobManager.dispatch`）：

1. *首先*获取**第 1 层**每队列互斥体
2. 输入**第 0 层** — 同步 `BEGIN IMMEDIATE` 写入事务 (`withWriteTx`) — *第二个*
3. 在该数据库事务中：
   - 计数队列活动作业 → 检查 `queue.concurrency`
   - 计算全局运行的作业 → 检查 `globalMaxConcurrency`
   - 选择下一个待处理 → 更新为运行（声明）
4. 第 0 层事务提交，然后释放第 1 层每队列互斥锁
5. 在锁外生成 `handler.execute`
6. 对微任务进行排队以再次调度同一队列（填充下一个槽）

生成发生在锁的“外部”——处理程序在新的调度继续进行时执行 seconds/minutes。

**获取顺序是固定的**（第 1 层互斥锁，然后是第 0 层写入事务）。第 0 层不持有异步锁——它是一个同步事务——因此第 1 层是调度路径中唯一的互斥体，并且这两层不能相互死锁。

## 六态状态机

```
                  ┌── retry backoff (delayed) ──┐
                  ▼                              │
   enqueue → pending → running → completed       │
                  │       │                      │
                  │       └→ failed ─────────────┘ (if retryable && attempt < max)
                  │       └→ cancelled (terminal)
                  └→ delayed → (scheduledAt ≤ now) → pending
```

终端状态 (`completed` / `failed` / `cancelled`) 永远不会重新打开。重试重新进入 `delayed`，然后在 ScheduleAt 经过时转换回 `pending`。

## 启动恢复

启动恢复是 JobManager 的延迟扫描，可协调数据库驱动的状态机与新启动的进程。它是服务级别的业务工作，**不是**引导初始化副作用 - 请参阅 [onAllReady 业务工作模式](../../lifecycle/lifecycle-usage.md#onallready-business-work-pattern) 了解框架级别的基本原理。

**顺序**

1. `JobManager.onAllReady()` 以 60 秒的“安静窗口”安排 `setTimeout` 并同步返回。 `生命周期Manager.allReady()` 是一劳永逸的；引导程序未被阻止。
2. 60 秒后，计时器回调将恢复流程承诺分配给 `this._recoveryDone` （仅当未请求关闭时）并且流程开始运行。
3. 该流程按顺序运行四个 IO 步骤：
   1. `runStartupRecovery(handlers, isJobInFlight)` — 根据处理程序恢复策略重置非终端行 (`abandon` / `retry` / `singleton`)； `cancelRequested=true` 优先于所有策略。当前进程**已经执行**的行（通过 `isJobInFlight` 报告，由 `JobManager.inFlightExecuted` 支持）在任何策略之前都会被排除，因此在安静窗口期间排队并在扫描触发时仍在运行的作业永远不会重置或重新分派（#16291）。
   2. **复活队列** — 在非终端行上遍历不同的 `(queue, type)` 对，并确保每个对都存在 `DispatchQueue` 。如果没有此步骤，`dispatchAll` 将迭代一个空的 `queues` 映射，并且挂起的行将等待下一个 `enqueue`。
   3. **Catch-up THEN arm** — 对于每个启用的计划，*在* `armSchedule(schedule)` 之前调用 `detectAndDispatchOverdue(schedules)`。该顺序是承载的：如果我们首先武装，带有 `protect: true` 的 cron 可以与追赶队列同时触发其自然日历（`protect` 只阻止重叠的回调，而不阻止外部调用者）。首先进行排序追赶可以保证补充队列在 croner 第一次自然触发之前着陆。
   4. `dispatchAll()` 会启动每个队列泵，以便通过步骤 1 重置的待处理行立即开始运行，而不是等待下一个队列。

**60年代静窗**

延迟（`JOB_MANAGER_STARTUP_DELAY_MS = 60_000`，硬编码）为冷启动 IO（数据库预热、窗口绘制、客户端引导）提供了在计划工作堆积之前稳定下来的时间。测试通过 `vi.useFakeTimers + advanceTimersByTimeAsync(60_000)` 绕过它，然后等待 `_recoveryDone`。

**关闭安全性——三层**

可以通过 `onStop` 随时中断流程。三种机制协同：

|窗户|防御|
|---|---|
|安静的窗口（计时器尚未启动）|`registerDisposable(() => clearTimeout(handle))` 在 `_cleanupDisposables` 期间清除定时器；回调还会重新检查 `_isShuttingDown`，因此与 `clearTimeout` 竞争的拆卸仍然是安全的。|
|飞行途中流动|每个 IO 步骤都会在下一个 `await` 之前重新检查 `_isShuttingDown`，并在关闭时提前返回。|
|流程已经开始|`onStop` 在拆除资源之前等待 `this._recoveryDone`，因此当前步骤在队列、中止控制器和一次性资源被释放之前正常完成。加入是有意无条件的——在最后期限内进行比赛会让拆卸在恢复仍在写入时运行。|

连接受到外部限制：关闭将每个服务限制在 `SERVICE_STOP_TIMEOUT_MS`（5 秒）。如果运行中的恢复步骤持续时间超过了该时间，框架将停止等待 JobManager 并继续前进 — 没有 `SERVICE_STOPPED`，并且该过程将被记录为不干净。只要恢复完成，连接后的拆卸仍然会运行，只是太晚了，无法计数：它现在与顺序下游的服务关闭重叠。 `onDestroy` 是否仍然在其之上运行取决于最后完成击败 `destroyAll()` 到 JobManager - 一场竞赛，而不是保证（请参阅[生命周期概述 - 拆卸时间合同](../../lifecycle/lifecycle-overview.md#teardown-time-contract)）。无论哪种方式都可以接受，因为它们都不是承载的——立即排队写入数据库，启动恢复修复飞行中留下的任何内容。

**处理程序注册时间**

处理程序必须在所属服务的 `onInit` 中注册（请参阅 [handler-authoring.md — 注册计时](./handler-authoring.md#registration-timing)）。当 60 秒计时器触发时，每个消费者都已完成 `onInit` / `onReady`，因此 `runStartupRecovery` 会看到完整的处理程序集。从另一个服务的 `onAllReady` 注册处理程序是不安全的：该挂钩与 JobManager 的挂钩并行运行，并且在恢复期间未注册类型的任何非终端作业都会被视为孤立作业并被取消。

## 暂停并耗尽（写静止）

提供备份恢复服务 (#16850)：在时间 T 拍摄恢复快照后，任何对旧活动数据库的 JobManager 写入都会导致指纹重新检查失败并浪费整个恢复尝试。 `pause()` 停止**自主**写入以避免浪费；指纹门保持正确性。恢复协调器不得作为 JobManager 作业运行 - 一个暂停并排出其自己的管理器死锁直到超时的处理程序。

```ts
const hold = jobManager.pause('backup restore')
const verdict = await jobManager.drainInFlight({ timeoutMs: 15_000 })
const clean = verdict.stragglerIds.length === 0 && !verdict.startupRecoveryPending
if (!clean) {
  hold.dispose() // abort path ONLY — give the manager back its autonomy
  return abortRestoreAttempt()
}
await createSnapshot()
// Happy path: NEVER dispose. The release pass writes to the old live DB
// (promotion, markFired, catch-up enqueues) — post-snapshot that fails the
// fingerprint re-check and voids the attempt. The hold stands until the
// process relaunches into the restored DB (a lost hold fails closed).
```

|规则|细节|
|---|---|
|没有 `resume()`|释放=处置你自己的持有。保留重新计票；最后一个处理运行补偿通道：任何未完成的恢复首先解决 - 内部释放障碍使自主 fires/claims 冻结，直到它冻结（间隔链和计时器计时器否则会在保留消失时恢复并与流程的陈旧快照追赶） - 然后延迟升级 + 调度，抑制 - 一旦重新准备，计时器恢复。失去的保持会失败关闭 - 暂停直至重新启动。|
|排水前提条件|呼叫者必须保持实时暂停。如果没有，则判决是时间点快照（警告，不抛出）并且不得门控数据库快照。|
|干净的判决|`stragglerIds` 空 **和** `startupRecoveryPending === false`。延迟启动恢复是 JM 内部编写器，不是一份工作，因此它有自己的裁决字段 - 决不会在 `stragglerIds` 中伪造 id。 `true` 表示步骤内流仍然被阻塞；在步骤边界短路的流程不再写入任何内容并报告 `false` （其余部分是释放的债务）。|
|暂停|`drainInFlight` 从不拒绝。落后者**不会**中止 - 中止会将它们作为 `cancelled` 放入快照中，并且它们在恢复后永远不会重新运行；离开 `running`，启动恢复应用处理程序策略。 Orchestrator 规则：任何耗尽超时 → 中止恢复尝试。|
|无误差面|没有API因为暂停而抛出异常；没有与暂停相关的错误代码。|

**暂停时阻塞**（自主写入）：分派声明（条目检查 + 互斥后重新检查）、调度触发回调（crons 在 croner 层另外暂停，因此 `limit` 配额在窗口中存活）、GC / 延迟提升滴答声、delayed/retry 提升触发和新的启动恢复步骤 - 一个已启动的步骤（一个调度的 `onMissed` + 追赶队列，原子）运行完成并被执行等待下水道。

**暂停时允许**（请求驱动）：`enqueue` / `enqueueTx`（行在静止时着陆，快照捕获它们）、`cancel` / `cancelMany`、调度突变和 `triggerJobScheduleNow*` - 强制进入其直接入队后备（行着陆 `pending` + `markFired`；`true` 仍然意味着“行持续存在”）。

错过的 cron 触发将被跳过，而不是被捕获（croner 语义）。被抑制的 `once` 火力在从记录的 id 集释放时重新启动 — 恰好一次；永远不会通过扫描“启用∧缺少调度程序条目”来重建，这也匹配历史完成的一次性。

## 为什么是数据库驱动而不是内存队列？

我们考虑了 BullMQ/bee-queue/better-queue/agenda/graphile-worker/bree 等并选择了这种设计，因为：

- 所有持久性都已在 SQLite 中（无 Redis / MongoDB / PostgreSQL 依赖性）
- 重启恢复是自动的——从数据库重放内存
- 竞赛安全仅需要 `count → claim` 周围的一对互斥体（第 0 层 + 第 1 层）
- 无双事实来源簿记（PQueue + DB）及其同步规则

吞吐量：单进程 better-sqlite3 吞吐量约为 200 dispatch/s，远高于 Magic Box 的最大场景（1000 多个知识库，每个知识库的并发度 = 5，永远不会超过 globalMaxConcurrency=50 个同时运行的作业）。

## 强类型JobRegistry

业务模块使用 TypeScript 声明合并来注册 `type → payload` 映射：

```typescript
declare module '@main/core/job/jobRegistry' {
  interface JobRegistry {
    'agent.task': AgentTaskPayload
    'knowledge.index-leaf': IndexLeafPayload
  }
}
```

在此声明之后：

- `jobManager.enqueue('agent.task', payload)` 是编译时类型检查的
- 通过 TypeScript 错误管道重命名类型显示每个调用站点
- 错误的有效负载形状是一个编译错误

## 事务队列 (`enqueueTx`)

`enqueue` 将行保留在裸连接上 - 当排队是唯一的写入时很好。当业务状态翻转并且作业 INSERT 必须以原子方式提交时（e.g。标记项目 `deleting` **和** 将清除作业排入队列），请在 `DbService.withWriteTx` 回调中使用事务变体：

```ts
application.get('DbService').withWriteTx((tx) => {
  itemService.setStatusTx(tx, ids, 'deleting') // business write
  return jobManager.enqueueTx(tx, 'my.purge', { ids }) // job INSERT, same tx
})
```

提交后的副作用（状态发布、分派/延迟装备）将被推迟到同步事务之后的一个微任务。回滚时，该行从未存在：返回的句柄的 `finished` 永远不会解析，并且幂等键唯一索引冲突会中止整个调用者事务。有关完整合同，请参阅 `enqueueTx` JSDoc。

## 事务计划突变 (`registerJobScheduleTx` / `updateJobScheduleTx` + `syncJobScheduleTimerById`)

当计划行和相关业务写入必须以原子方式提交时，请在 `DbService.withWriteTx` 回调中组合事务原语，然后在事务返回后同步计时器：

```ts
const { id } = application.get('DbService').withWriteTx((tx) => {
  const created = jobManager.registerJobScheduleTx(tx, { type: 'agent.task', ... }) // schedule row
  agentChannelService.replaceTaskSubscriptionsTx(tx, created.id, channelIds) // business write, same tx
  return created
})
jobManager.syncJobScheduleTimerById(id) // post-commit timer sync (create: always; update: when the patch carried trigger/enabled)
```

`*Tx` 原语预先验证（处理程序、名称、触发器语义→ `JOB_SCHEDULE_TRIGGER_INVALID`）并且从不触及计时器，因此回滚对计时器的副作用为零。计时器同步是调用者显式的提交后步骤 - `enqueueTx` 的提交后重新读取不能在此处重用，因为其回滚测试（“行缺失”）仅适用于 INSERT；更新回滚将被读取为已提交并重新准备，从而重置间隔阶段。有关完整合同，请参阅 `registerJobScheduleTx` JSDoc。

## 渲染器端消费者

渲染器永远不会通过 DataApi 排队、取消或以其他方式改变作业。它仅以只读方式观察作业状态：

- `useJob(jobId)` → 当前 `JobSnapshot`（状态/计数器/错误/...）。来源：共享缓存 `jobs.state.${id}` 与 GET `/jobs/:id` 作为冷启动后备。
- `useJobProgress(jobId)` → 细粒度的进展。来源：仅限共享缓存 `jobs.progress.${id}`。

触发作业由main中的相关业务模块拥有：

1. 业务服务决定语义——哪种作业类型、什么有效负载、队列、幂等键、最大尝试次数、超时。
2. 它直接调用 `application.get('JobManager').enqueue(...)` 。
3. 如果渲染器需要发起工作，则业务模块暴露专用的IPC路由（e.g.`knowledge.add_items` IpcApi路由）；路由处理程序内部调用 `JobManager.enqueue(...)`。

调度突变（CRUD /暂停/恢复/立即运行）遵循相同的模式：渲染器→专用IpcApi路由（e.g.`ai.agent.task.*`→`AgentJobsService`）→JobManager调度API；计划读取保留在仅 GET DataApi 上。

这可以保持 `JobRegistry` 的编译时 `JobPayloadOf<K>` 类型安全完整，并防止渲染器依赖 JobManager 基础结构详细信息（队列名称、重试策略、幂等键）。

## 参见

- [concurrency-and-locks.md](./concurrency-and-locks.md) — 完整的四层锁模型
- [handler-authoring.md](./handler-authoring.md) — 如何编写处理程序
- [migration-checklist.md](./migration-checklist.md) — 迁移现有服务
