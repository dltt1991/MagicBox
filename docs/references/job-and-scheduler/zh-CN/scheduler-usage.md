# 调度程序的使用——决策树

该项目具有三种“定期/稍后触发回调”的机制。选择错误的计时器会产生 v2 统一旨在解决的问题：分散的临时计时器，无法观察，也没有中央控制。

## TL;DR 表

|需要|使用|
|---|---|
|持续重复的后台工作与状态机、重试、可观察性|**作业经理** — `registerJobSchedule()`|
|Cron/间隔/一次性回调**跨服务**，无持久性|**调度服务** — `registerSchedule()`|
|服务私有GC/自检/缓存清理，单一间隔，无可观察性|**`BaseService.registerInterval()`**|
|对运行时状态做出反应的计时器（协议心跳、流保持活动）|**所属模块内的原始 `setInterval` / `setTimeout`**|

## 三个问题

按顺序回答问题。第一个“是”选择了机制。

### 1. 工作是否需要在使用状态机+重试+取消的进程重启后继续存在？

是 → **JobManager**。构建一个 `JobHandler`，注册它，然后调用 `jobManager.registerJobSchedule({ type, trigger, jobInputTemplate, catchUpPolicy })`。

您得到： `jobScheduleTable` 中的持久计划行；下一个进程启动时恢复；重试退避；用户可见的状态； DataApi 列表；渲染器进度挂钩。请参阅 [handler-authoring.md](./handler-authoring.md)。

### 2. 该工作是在 cron 表达式上触发还是跨多个服务触发（横切计时器）？

是 → **SchedulerService**。致电 `scheduler.registerSchedule(id, trigger, callback)`。返回 `Disposable`。

您可以在一个 API 中获得：cron/interval/once 触发器； croner 的 pause/resume/triggerNow 用于 cron 计划；通过 Intl 修正时区；自动未加料计时器；没有 SQLite 接触；没有坚持。

在您的服务的 `onReady` 中重新注册 — SchedulerService 不会保留任何内容。

### 3. 这项工作是否是服务私有的内部标记（GC、过期扫描、刷新），不需要外部可观察性？

是 → **`BaseService.registerInterval()`**。已连接到生命周期（自动取消引用、异常隔离、`onStop` / `onDestroy` 上的自动清理）。

为什么这里没有 SchedulerService 呢？ `registerInterval` 是“服务内部实现细节”的项目约定。它将计时器所有权保留在服务内，这是 GC/自检的正确范围 - 其他任何人都不会对这些回调感兴趣。

### 4. 否则：对运行时状态做出反应的计时器。

在所属模块内使用原始 `setInterval` / `setTimeout` 。典型的例子是协议心跳，其间隔由服务器的 `hello` 帧决定，并且可能会在重新连接时发生变化。 SchedulerService 的 `Trigger` 类型被故意关闭以保持其表面较小——心跳保持在其外部。

这是**有意识的设计边界**，而不是缺陷。理由：SchedulerService 仅接受声明性触发器 (`cron` / `interval` / `once`)；其节奏由对等方决定的心跳从根本上来说是属于所属模块的状态机问题。强制通过 SchedulerService 需要强制重新调度 API，这会污染简单的表面。

## 常见错误

- **当 `registerInterval` 就足够时，使用 SchedulerService。** SchedulerService 用于横切/cron/用户可见的计划。仅需要“每 5 分钟扫描一次自己的缓存”的服务应使用 `registerInterval`。 SchedulerService 在这里没有添加任何内容，并且计时器变得更难以推理。
- **获取原始 `setInterval` 以获得 cron 风格的节奏。** “用户所在时区每天 03:00 一次”是 `croner` 解决的问题。不要写 86_400_000 ms 间隔 — 它会漂移并忽略 DST。
- **构建您自己的持久计划表。** 该项目只有一个：`jobScheduleTable`，由 JobManager 拥有。需要坚持吗？构建一个 JobHandler。 **硬约束**：SchedulerService 是项目的单一通用调度程序 - 每个重复任务都应通过 JobManager（持久）或 SchedulerService（瞬态）到达时间，而不是通过私有并行调度程序。
- **忘记 SchedulerService 是无状态的。** 它无法在重新启动后继续存在。如果直接调用则在`onReady`中重新注册。

## 触发器生命周期语义

三个触发器（`cron` / `interval` / `once`）的不同之处在于它们的条目如何在回调中生存。这两个微妙之处都可以从回调内部观察到。

### `once`：*在*调用之前进行自清洁

当 `once` 计时器触发时，SchedulerService 在调用回调之前**从内部映射中删除其调度条目。激励结果：回调可以使用相同的 id 重新注册调度，而不会发生冲突。

```typescript
scheduler.registerSchedule('reminder.foo', { kind: 'once', at: Date.now() + 1000 }, () => {
  // Safe: the previous entry was removed before we got here.
  scheduler.registerSchedule('reminder.foo', { kind: 'once', at: Date.now() + 5000 }, () => { /* ... */ })
})
```

如果您需要“触发一次，然后可能稍后再次触发”语义，这就是路径。请注意，如果回调抛出异常，则调度 ID *也会*被删除 — 从 SchedulerService 的角度来看，`once` 始终是一次性的。

### `interval`：重新启动安全检查

每次更新后，SchedulerService 都会在重新准备下一个时间间隔之前重新检查计划条目是否仍在其映射中。结果：回调可以同步调用 `scheduler.unregisterSchedule(id)` 并且循环将干净地停止，没有最终的杂散滴答声。

```typescript
scheduler.registerSchedule('healthcheck.foo', { kind: 'interval', ms: 30_000 }, async () => {
  if (await everythingIsTerminal()) {
    scheduler.unregisterSchedule('healthcheck.foo')
    return // No further tick.
  }
  // ...
})
```

检查是在 `map.has(id)` 上进行的，而不是标志上 — 如果您在回调期间重新注册相同的 id，则会使用新触发器重新装备循环。

## SchedulerService 内部 ID 约定

JobManager 拥有这些前缀——第三方调用者应该避免它们以防止冲突：

|前缀|所有者|目的|
|---|---|---|
|`schedule:${scheduleId}`|工作经理|可重复的计划从 `jobScheduleTable` 开始|
|`job:${jobId}`|工作经理|`delayed` 作业的 `scheduledAt` 的一次性计时器|
|`retry:${jobId}:${nextAttempt}`|工作经理|重试退避计时器（尝试次数可防止相同 jobId 冲突）|

当业务模块直接使用SchedulerService时，请选择一个命名空间id（e.g.`myservice.cleanup`）以避免与将来的JobManager前缀发生冲突。
