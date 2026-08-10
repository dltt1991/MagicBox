# 并发与锁（四层模型）

JobManager在并发调度下使用四个正交锁层。

|层|所有者|范围|举行时间|目的|
| --- | --- | --- | --- | --- |
|**0** 同步写事务|`DbService.withWriteTx`|应用程序中的所有写入事务（每个 `withWriteTx` 事务；单个写入使用相同的连接，无需发送）|µs — 一笔交易|在单个 better-sqlite3 连接上（在 isReady 防护后面）将每次写入作为一个同步 `BEGIN IMMEDIATE` 事务运行。一个持久连接上的同步执行本质上序列化所有写入，无需互斥或重试。可由任何服务重复使用。|
|**1** 每队列调度互斥体|`DispatchQueue.mutex`|一个队列的（计数 → 声明）部分|微秒|对同一队列进行序列化，以避免浪费第 0 层流量。并发上限由 SQL `countRunningByQueueTx` 强制执行，而不是由该互斥锁强制执行。|
|**2** 队列并发限制|`DispatchQueue.concurrency`|每个队列运行多少个处理程序|完整的处理程序运行时|每队列并行度限制。仅计算 `running` 行（__PH1__/__PH2__ 不占用工作槽），因此无论积压深度如何，上限都会限制并发处理程序 — 队列可以在任何 `concurrency` 处保存无限制的待处理积压。|
|**3** 业务互斥体|处理者拥有|特定于资源（向量存储写入、文件 IO，...）|处理程序决定|在进程重新启动时序列化关键部分（仅第 2 层无法在重新启动后继续存在）。|

## 收购订单

首先获取第 1 层（每队列调度互斥体）； count→claim 部分然后通过 `withWriteTx` 进入第 0 层，然后释放第 1 层。由于 `withWriteTx` 现在作为不持有异步锁的同步 `BEGIN IMMEDIATE` 事务运行，因此第 1 层是调度路径中唯一的互斥锁，因此无需防范跨层锁排序死锁。

非调度写入（`scheduleRetry`、`finalizeJob`、`patchMetadata`、`cancel`、`cancelMany`、恢复、GC、调度 CRUD）在调度路径之外运行 — 无队列标记语义，因此不涉及第 1 层。多语句（e.g.`cancelMany`）使用`withWriteTx`；单语句直接通过 `getDb()` 写入。两者仍然在一个同步连接上进行序列化。

第 2 层和第 3 层是计数器/资源锁，而不是互斥体 - 在此排序规则之外。

## 常见陷阱

**`queue=base.${baseId}` 与 `concurrency=1` 不会替换业务互斥锁。** 崩溃+重新启动后，recovery='retry' 会为同一作业生成一个新的处理程序实例。第 2 层看到新的正在运行的行，但仍可以在操作系统级别观察到旧的正在进行的写入。 **始终将第 2 层与第 3 层配对，以便在重新启动时实现资源序列化。**

## 故障恢复

卡在 `running` 中的行（e.g。`spawnExecute` 后备链吞噬了数据库错误）将在下一次进程重新启动时由 `runStartupRecovery` 回收。未实现会话中恢复 - 这种情况需要持续的数据库级故障 (__PH3__/__PH4__)，这也会破坏任何进程内回收尝试。

## 使用 `withWriteTx` 的其他服务

`DbService.withWriteTx` 是多语句/先读后写突变的常规包装器（直接 `db.transaction()` 在单同步连接下等效）；单次写入直接通过 `getDb()` （请参阅 [Write Serialization](../../data/database-patterns.md#write-serialization-dbservicewithwritetx)）。 JobService / JobScheduleService 在其热写入路径中遵循这种分割。

读取不需要 `withWriteTx` — WAL 为读取器提供快照隔离，永远不会被写入器阻止。

## 总结图

```
┌─ Layer 0: Sync write tx (DbService.withWriteTx) ──────┐  Serializes ALL writes
│ ┌─ Layer 1: Per-queue dispatch mutex ────────────────┐ │  Serializes same-queue ticks
│ │ ┌─ Layer 2: Queue concurrency limit ─────────────┐ │ │  N handlers per queue
│ │ │ ┌─ Layer 3: Business mutex ──────────────────┐ │ │ │  Resource serialization across restart
│ │ │ │ handler.execute() runs                     │ │ │ │
│ │ │ └────────────────────────────────────────────┘ │ │ │
│ │ └────────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
       ↑ outside the orchestrator's lock — long
       ↑ inside the orchestrator's lock — microseconds
```
