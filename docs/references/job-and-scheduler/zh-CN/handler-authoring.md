# 处理程序创作

随着真实消费者的迁移，进一步的工作示例（重试/单例恢复、故障率断路器、业务级互斥体）会被添加——推测性示例在任何人使用之前都会发生位腐烂。

## 报名时间

处理程序必须在所属服务的 `onInit` 中注册。 JobManager 的 [启动恢复](./overview.md#startup-recovery) 被安排在 JobManager 自己的 `onAllReady`（一个 `setTimeout`，其 60 秒的“安静窗口”然后到期）内，并在计时器触发时遍历 `this.handlers`。 **重要的不是 60 秒 — 而是您的注册发生在调用 JobManager 的 `onAllReady` 挂钩之前还是之后。**

`onInit` 在阶段初始化期间运行，框架在开始调用任何 `onAllReady` 挂钩之前为每个服务完成该阶段初始化。因此，在 JobManager 安排恢复时，无论阶段或服务顺序如何，`onInit` 内的注册都保证在 `this.handlers` 中。

```typescript
// ✅ Correct — onInit finishes for every service before any onAllReady fires.
protected override async onInit(): Promise<void> {
  this.registerIpcHandlers()
  application.get('JobManager').registerHandler('agent.task', agentTaskJobHandler)
}

// ❌ Unsafe — your onAllReady fires in parallel with JobManager's. Whether
//             your registerHandler lands before JobManager schedules its
//             setTimeout is undefined order. Even if you "win" the race, no
//             future code change can rely on it; reviewers will assume the
//             registry was complete by the start of `allReady`.
protected override onAllReady(): void {
  application.get('JobManager').registerHandler('agent.task', agentTaskJobHandler)
}
```

这场竞赛并不是 60 秒“不够”——当计时器触发时，每个服务的 `onAllReady` 同步体早已运行完毕。竞争是关于**注册相对于 JobManager 的 `onAllReady` 调度计时器的位置**。在 `onInit` 中注册可以让您在 `allReady` 开始之前注册；在 `onAllReady` 中注册会将您置于一组无序的对等挂钩中。框架无法强制执行此操作 - `onAllReady` 中的注册不会抛出异常，只要 JobManager 首先观察注册表，它只会将未注册类型的非终端行泄漏到 `cancelled` 。

## 1. dummy.echo（最小处理程序）

```typescript
import { jobManager } from '@main/core/job/JobManager'

declare module '@main/core/job/jobRegistry' {
  interface JobRegistry {
    'dummy.echo': { message: string }
  }
}

jobManager.registerHandler('dummy.echo', {
  recovery: 'abandon',
  defaultConcurrency: 1,
  defaultTimeoutMs: 5000,
  async execute(ctx) {
    ctx.logger.info('echo start', { message: ctx.input.message })
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 1000)
      ctx.signal.addEventListener('abort', () => {
        clearTimeout(t)
        reject(new Error('aborted'))
      })
    })
    ctx.reportProgress(100, { stage: 'done' })
    return `echo: ${ctx.input.message}`
  }
})
```

## 2. 远程轮询模式（交叉重启切换）

```typescript
async execute(ctx: JobContext<RemotePollInput>): Promise<RemoteResult> {
  let providerTaskId = ctx.metadata.providerTaskId as string | undefined
  if (!providerTaskId) {
    providerTaskId = await startRemote(ctx.input, { signal: ctx.signal })
    // CRITICAL: await — without persistence the restart-recovery will re-submit
    // the remote job, wasting user quota and producing parallel external tasks.
    await ctx.patchMetadata({ providerTaskId })
  }
  while (!ctx.signal.aborted) {
    const status = await pollRemote(providerTaskId, { signal: ctx.signal })
    if (status.done) return status.result
    ctx.reportProgress(status.percent, { stage: status.stage })
    await sleep(POLL_INTERVAL_MS, { signal: ctx.signal })
  }
  throw new Error('AbortError: cancelled')
}
```

反模式：`while (true)`（无法取消）、`await sleep(N)` 无信号（延迟取消最多 N 毫秒）。

### 作业元数据与计划元数据

`ctx.metadata` / `ctx.patchMetadata` 的作用域为 **一个作业行** 并随之消亡（终端作业被 GC 处理）。必须在火灾中生存的时间表拥有的状态属于 **schedule** 行自己的 `metadata` 列 - 要求时间表的命令所有者在 `withWriteTx` 内使用读取-合并-写入写入它（`updateJobScheduleTx` 批量替换列，并且并发用户编辑可以竞争）。 `agent.task` 的 `metadata.reuse.revision` 就是一个例子：它是一个配置纪元，用于隔离在旧设置下排队的作业。将运行时生成的状态保留在 `jobInputTemplate` 之外：这是命令拥有的输入；只有所有者可以更新其配置快照。

通用元数据不能替代域关系。必须通过该实体的服务拥有的生命周期 API 来维护对另一个域拥有的实体的稳定引用，并在关系拓扑允许时使用数据库约束。当约束将创建循环外键时，请改为遵循应用程序级[软引用模式](../../data/database-patterns.md#circular-foreign-key-references)。例如，非循环 `agent.task` 粘性会话关系使用 `AgentSessionService` 维护的约束 `agent_session.taskScheduleId` 关系，而不是计划元数据中的会话 ID。

## 已解决的事件 (`onSettled`)

当作业达到最终状态时 `onSettled?(event: JobSettledEvent<TPayload>)` 触发一次（错误被捕获并记录，从不传播）。该事件是持久终端快照的投影 - 不需要 `jobService.getById` 反向查找：

|场地|类型|笔记|
|---|---|---|
|`jobId`|`string`| |
|`type`|`string`| |
|`scheduleId`|`字符串\|空`|当作业因计划火灾而设置时|
|`parentId`|`字符串\|空`|`opts.parentId` 在队列中； `null` 用于 root 作业|
|`status`|`'已完成'\|'失败的' \|‘取消’`| |
|`input`|`TPayload`|持久输入有效负载，通过处理程序注册键入|
|`output`|`unknown`（可选）|`completed` 上的处理程序返回值|
|`error`|`作业错误\|空`| |
|`attempt`|`number`| |
|`metadata`|`Readonly<Record<string, unknown>>`|最终值 - 包括每个 `patchMetadata` 合并|

`JobContext` 在执行期间公开相同的行级父链接：`ctx.parentId` 在排队时是 `opts.parentId`，对于根作业是 `null`。

## 3. 时间表标识：`(type, name)` 型号

`jobScheduleTable` 中的计划行由 `(type, name)` 对标识。 `type` 可以托管任意数量的**命名**计划以及最多一个**单例**（未命名）。 `(type, name)` 对是 DB 唯一的。

### 外部表示与内部表示

|层|单例 `name`|名为 `name`|
|---|---|---|
|外部API（DTO/快照）|`null`|非空 `string`|
|数据库列 (`job_schedule.name`)|`''`（哨兵）|非空 `string`|
|渲染器/处理程序代码|始终读取 `null`|非空 `string`|

`JobScheduleService.rowToSnapshot` 在读取时执行 `'' → null` 边界映射，__PH2__/__PH3__ 在写入时执行 `null → ''` 边界映射。消费者永远看不到哨兵。

### `name` 有效性 (`JobScheduleNameAtomSchema`)

长度 1-200，已修剪，无控制字符 (NUL/TAB/LF/CR)，无 `__` 前缀（为系统计划保留）。传递 `''`（或违反任何规则的名称）的外部调用者将获得 `JOB_SCHEDULE_NAME_INVALID`。

### 按名称 API 解析

`pauseJobSchedule(type, name?)`（及其 `resume` / `triggerNow` / `unregister` 兄弟姐妹）接受 `name?: string | null`：

|输入|行为|
|---|---|
|非空 `string`|查找`(type, name)`；未找到 → `JOB_SCHEDULE_NOT_FOUND_BY_NAME`|
|`null` / `undefined`|如果该类型总共有**一行**，则解析它。如果**两个或更多**，则抛出 `JOB_SCHEDULE_NAME_REQUIRED`。如果**零**，则抛出 `JOB_SCHEDULE_NOT_FOUND_BY_NAME`|

在多实例类型上传递显式名称 - 当同级计划稍后出现时，依赖“恰好一行”自动解析很脆弱。

## 4.恢复×catchUpPolicy矩阵（6个单元格）

|恢复×追赶|`skip-missed`|`after-startup`|
|---|---|---|
|**放弃**|预先存在的非终端作业 → 在启动时取消。错过计划的火灾会发出 `onMissed` （可观察性），但不会排队。|与左侧相同，加上在 `minutes * 60_000` 毫秒延迟后将补充作业排入队列。|
|**重试**|运行 → 启动时挂起；延迟保持原样。错过的火灾仅发射 `onMissed`。|与左相同，加上 N 分钟后入队化妆。|
|**单例**|保留最新的非终端，取消其余的。错过的火灾仅发射 `onMissed`。|与左相同，加上 N 分钟后入队（空闲时加入单实例槽）。|

### 恢复内部结构

一些不变量决定着恢复决策；上面的矩阵对它们进行了抽象，但消费者有时需要调试启动行为，并且这些旋钮会出现在日志和测试中。

- **`singleton` 保留*最新*行，而不是最旧的行。** 行按 `createdAt DESC` 排序；保留头部（`running` 行重置为 `pending`），取消尾部。结果：因崩溃而中断的长时间运行的单例将被恢复（在 __PH4__/__PH5__ 重置之后）而不是重新启动，而早期运行中的落后者将被清理。不存在“最年长者获胜”的决胜局。
- **`cancelRequested=true` 覆盖每个策略。** 设置了取消标志的行始终在启动时取消，无论 `recovery`、`singleton` 或是否正在运行/挂起/延迟。这可以防止进程崩溃而中断正在进行的取消——用户的意图在重新启动过程中仍然存在。
- **进行中的行永远不会被恢复所触及。**上面的所有内容都描述了*先前进程*剩余的内容。 **当前**进程仍在执行（在 `JobManager.inFlightExecuted` 中跟踪）的作业在任何策略或 `cancelRequested` 覆盖之前被排除，因此它既不是 reset/re-dispatched (`retry` / `singleton`) 也不是在飞行中取消 (`abandon` / `cancelRequested`) — 这可以防止在启动安静窗口期间启动的作业运行两次 (#16291)。排除范围仅限于当前进程：前一进程的崩溃遗留物不在该集合中，并且可以正常恢复。
- **`isScheduleOverdue` 有三个分支**（与选择 `catchUpPolicy: 'after-startup'` 时相关）：
  - **`cron`** 触发器比较持久列中的 `nextRun ≤ now()`。
  - **`interval`** 触发器比较 `lastRun + intervalMs ≤ now()` （SchedulerService 不维护间隔调度的 `nextRun` — `lastRun` 是规范锚点）。
  - **`once`** 触发器永远不会被视为过期：计时器要么仍处于待处理状态（它将触发），要么已经触发并且计划已自我清理。 `once` 的补充队列会双重触发，因此分支无条件返回 `false`。启动恢复强制执行互补的不变量：自然 `once` 触发持续 `lastRun` 钳位到不早于 `trigger.at` （单调时钟上的一次计时器经过，因此未钳位的挂钟读取可以落在 `at - 1` 处），并且 `armSchedule` 跳过具有 `lastRun >= trigger.at` 的行而不是重新装备它们，而从未触发的逾期 `once` 仍然立即重新装备并触发。这是一个恢复端防护，而不是严格的一次性交付 - 火灾队列与其 `markFired` 写入之间的崩溃仍然可以在下次启动时重放一次性。

## 5. 错误代码（通过 i18next 渲染器映射）

常量位于 `src/shared/data/api/schemas/jobs.ts` 处的 `JOB_ERROR_CODES` 中，并由 `JobManager` / `JobScheduleService` 抛出。渲染器从 `JobSnapshot.error` 读取 `code` 字符串。

|代码|起源|可重试|意义|
|---|---|---|---|
| `JOB_UNKNOWN_TYPE` |排队|不|没有为此类型注册处理程序|
| `JOB_PAYLOAD_TOO_LARGE` |排队|不|输入 JSON 超过 1MB|
| `JOB_CANCEL_REASON_TOO_LONG` |取消|不|取消原因超过 500 个字符|
| `JOB_SCHEDULE_NOT_FOUND_BY_NAME` |按名称安排 API|不|提供的（类型、名称）不存在|
| `JOB_SCHEDULE_NAME_REQUIRED` |按名称安排 API|不|多实例类型但未传递名称|
| `JOB_SCHEDULE_NAME_INVALID` |时间表 create/update|不|名称违反 `JobScheduleNameAtomSchema`（空/`__` 前缀/控制字符/未修剪/>200 个字符）|
| `JOB_SCHEDULE_NAME_CONFLICT` |时间表 create/update|不|（类型，名称）已存在|
| `JOB_SCHEDULE_SINGLETON_EXISTS` |计划创建|不|尝试对已具有单例的类型进行未命名计划|
| `JOB_SCHEDULE_TRIGGER_INVALID` |时间表 create/update (`*Tx`)|不|触发器调度语义失败（cron/timezone 解析，延迟超过计时器限制）|
| `JOB_HANDLER_TIMEOUT` |运行时|是的|处理程序超出 `timeoutMs`|
| `JOB_HANDLER_THREW` |运行时|是的|处理程序抛出非中止错误|
| `JOB_CANCELLED` |恢复/取消|不|作业被用户、恢复或关闭取消|

渲染器：__PH0__errors.jobs.${code.__PH2__}\`, params)`。

### 超时哨兵

`JOB_HANDLER_TIMEOUT` 是通过使用 `JobHandlerTimeoutError` 哨兵（专用的 `Error` 子类）中止处理程序的 `AbortController` 来调度的，而不是通过匹配消息字符串来调度。这意味着抛出普通 `new Error('request timeout')` 的处理程序被分类为 `JOB_HANDLER_THREW`，而不是 `JOB_HANDLER_TIMEOUT` — 调度程序仅信任中止原因，而不信任文本。因此，消费者无需担心当自己的错误恰好提到该词时意外触发“超时”分支。

## 6. Handler组织约定

业务作业处理程序位于所属业务模块内的专用 `tasks/` 子目录下。文件名使用 `JobHandler.ts` 后缀：

```
src/main/services/knowledge/tasks/PrepareRootJobHandler.ts
src/main/services/knowledge/tasks/IndexLeafJobHandler.ts
```

|方面|习俗|
|---|---|
|地点|`<module>/tasks/<Name>JobHandler.ts`|
|默认导出|与文件同名（类或 const 处理程序对象都可以）|
|并置测试|`<module>/tasks/__tests__/<Name>JobHandler.test.ts`|

### 为什么“在每个业务模块内部”而不是 `core/job/handlers/`

- 处理程序与业务领域知识紧密耦合（input/output 模式、`recovery` 策略、`catchUpPolicy` 均由业务定义）。将它们与所属服务放在同一位置符合所有权边界。
- `registerHandler` 必须从业务服务的 `onInit` 调用，以便处理程序在 `JobManager.onAllReady` 启动恢复之前就位（§4）。将实现文件放在注册调用站点旁边读起来更自然。
- `src/main/core/job/` 仍然是一个纯粹的框架模块，没有业务代码。

### 适用性

|设想|必需的|
|---|---|
|第一批处理程序（文件处理、知识、代理任务）|✅ 是的|
|稍后添加的所有新处理程序|✅ 是的|
|实验处理程序（不在 `JobRegistry` 中）|⚠ 推荐，不屏蔽|
|现有处理程序（如果有）|当接触附近的代码时机会性地迁移|
