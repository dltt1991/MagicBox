# 生命周期概述

IoC 容器 + 具有分阶段引导和并行初始化的服务生命周期管理。

> **面向用户的API**（注册、引导、服务访问、运行时控制）请参见【应用概述】(./application-overview.md)。应用程序在内部委托生命周期 - 您很少需要直接使用 `ServiceContainer` 或 `生命周期Manager` 。

## 引导阶段

服务初始化分三个阶段：

|阶段|描述|定时|等待|
| ------------- | ----------------------------------------- | ------------------------ | ----- |
|`BeforeReady`|不需要 Electron API 的服务|在 `app.whenReady()` 之前|是的|
|`Background`|独立服务，即发即忘|立即地|不|
|`WhenReady`|需要 Electron API 的服务（默认）|`app.whenReady()` 之后|是的|

### 引导时间线

```
|--Background (fire-and-forget)------------|
|--BeforeReady--------|                    |
|--app.whenReady()--------|                |
                          |--WhenReady--|  |
                                        isBootstrapped = true
                                        |--await Background--|
                                                             allReady (fire-and-forget) → ALL_SERVICES_READY
```

所有三个阶段完成后（包括后台），`生命周期Manager.allReady()` 在每个初始化的服务上并行调用 `onAllReady()` 并**立即**发出 `ALL_SERVICES_READY` — 它**不**等待挂钩。 `onAllReady` 是引导后补充（请参阅 [Hook 描述](#hook-descriptions)），因此引导程序不会阻止在其中运行延迟工作的服务。

### 相选择指南

#### 阶段如何引导

```
1 Background starts (fire-and-forget) ──────────────────────────────────┐
2 BeforeReady starts ──────────┐                                        │
2 app.whenReady() ─────────────┤                                        │
                               ├─ both complete                         │
                               ▼                                        │
3 WhenReady starts ────────────┐                                        │
                               ├─ complete → isBootstrapped = true      │
                               ▼                                        │
4 await Background ◄────────────────────────────────────────────────────┘
5 onAllReady() called on ALL services
   → ALL_SERVICES_READY emitted
```

要点：
- **BeforeReady** 与 Electron 自己的初始化 (`app.whenReady()`) 并行运行，提供“空闲时间”——只要在 Electron 准备好之前完成，这里的工作就不会增加启动延迟。
- **WhenReady** 仅在 BeforeReady 和 Electron 都准备好之后运行——这是 Electron API 可以安全使用的唯一阶段。
- **后台**完全独立运行。它不会阻塞任何其他阶段，并且没有其他阶段可以依赖它。

#### 选择正确的阶段

```
                    ┌──────────────────────┐
                    │ Does it use Electron │
                    │   APIs directly?     │
                    └──────┬─────────┬─────┘
                       yes │         │ no
                           ▼         ▼
                    ┌───────────┐  ┌───────────────────────────┐
                    │ WhenReady │  │ Is it on the critical     │
                    └───────────┘  │ startup path? (other      │
                                   │ services depend on it)    │
                                   └─────┬──────────┬──────────┘
                                     yes │          │ no
                                         ▼          ▼
                                 ┌─────────────┐ ┌────────────┐
                                 │ BeforeReady │ │ Background │
                                 └─────────────┘ └────────────┘
```

**BeforeReady** — 使用 Electron init 最大化并行性

- 与 `app.whenReady()` 并行运行，因此如果在 Electron 准备好之前完成，这里的初始化基本上是“免费的”。
- 最适合：数据库连接、配置加载、数据迁移、模式验证 - WhenReady 服务所依赖的任何内容。
- 无法使用任何 Electron API（应用程序尚未准备好）。
- 只能依赖其他BeforeReady 服务。

**WhenReady** — 安全默认值

- 在 BeforeReady 和 `app.whenReady()` 完成后运行。
- 完全访问 Electron API（`BrowserWindow`、`Tray`、`screen`、`nativeTheme`、`dialog`、`globalShortcut` 等）。
- 可以依赖其他 WhenReady 服务。
- 最适合：窗口管理、托盘、系统快捷方式、主题管理、需要 Electron API 的 IPC 处理程序。
- 这是默认阶段 — 如果省略 `@ServicePhase`，则服务将放置在此处。

> **⚠️ 跨阶段依赖是自动的。** BeforeReady 服务（`PreferenceService`、`DbService`、`CacheService`、`DataApiService`）保证在 WhenReady 启动之前完成。 **不要**在 WhenReady 服务上声明 `@DependsOn('PreferenceService')` （或类似的） - 这是多余且具有误导性的。仅将 `@DependsOn` 用于同相耦合。

**背景** — 即发即忘

- 立即启动，但完全独立运行，不会阻塞其他阶段。
- 其他阶段的服务**不能**依赖于后台服务（反之亦然）。
- 后台错误会被捕获并记录，但不会中止引导程序。
- 最适合：遥测报告、非关键数据预取、后台清理任务。
- 如果后台服务需要在引导后与其他阶段的服务交互，请使用 `onAllReady()`。

### 依赖规则

|阶段|可以依赖|不能依赖|
| ----------- | ---------------------- | ---------------------- |
|准备之前|准备之前|背景，准备就绪|
|背景|背景|准备前、准备时|
|准备就绪时|准备前、准备时|背景|

**跨阶段依赖是隐式的**——“可以​​依赖”列意味着这些服务保证准备就绪，**而不是**您应该通过 `@DependsOn` 声明它们。预留`@DependsOn`用于同相订购；跨阶段准备就绪由 `生命周期Manager.startPhase()` 自动执行。

**无效的依赖关系会自动更正**并带有警告日志：
```
[WARN] Service 'X' declared as Background but depends on BeforeReady service 'Y', adjusted to BeforeReady
```

## 并行初始化

同一阶段内没有相互依赖关系的服务是并行初始化的：

```
Phase: WhenReady
Layer 1: [DbService, ConfigService]  <- parallel (no inter-dependency)
Layer 2: [PreferenceService]               <- sequential (depends on layer 1)
Layer 3: [MainWindowService]                   <- sequential (depends on layer 2)
```

## 生命周期挂钩

```
Created → Initializing → Ready ⇄ Paused
              ↓            ↓        ↓
           onInit()    onReady() onPause()/onResume()
              ↑           ↓
              │        Stopping → Stopped → Destroyed
              │           ↓           ↓          ↓
              │        onStop()  [restart]   onDestroy()
              └───────────────────────┘

After all phases complete:
  Ready ──── onAllReady() (called once, no state change)
```

### 挂钩说明

|钩|被叫时|可以覆盖|
| -------------- | -------------------------------------------------------- | ------------ |
|`onInit()`|初始化期间（以及重新启动时重新初始化）|是的|
|`onReady()`|`onInit()` 完成后立即|是的|
|`onAllReady()`|一旦所有阶段的所有服务准备就绪|是的|
|`onStop()`|当服务停止时|是的|
|`onDestroy()`|最终清理，服务不可重复使用|是的|
|`onPause()`|当服务暂停时（需要 `Pausable`）|是的|
|`onResume()`|当服务恢复时（需要 `Pausable`）|是的|

#### 拆卸时间合同

|小路|天花板|
| ---- | ------- |
|关机（`stopAll()` / `destroyAll()`）|`SERVICE_STOP_TIMEOUT_MS` (5s)，每次服务，每次通过|
|运行时（`stop()` / `restart()`）|没有任何|

**到期放弃等待，它不取消挂钩。**框架日志，在pass摘要中记录服务，然后继续；钩子继续运行。 *截至截止日期*真实情况是：

|超时挂钩|截止日期的状态|未发出|然后|
| -------------- | --------------------- | ----------- | ---- |
|`onStop()`|`Stopping`，在输入时设置；一次性用品尚未清洗干净| `SERVICE_STOPPED` |`destroyAll()` 跳过仍在飞行中的站点的服务|
|`onDestroy()`|**无论调用之前是什么** — `_doDestroy` 在完成之前不会写入任何状态。正常停止后 `Stopped`，失败后 `Stopping`，当 `destroyAll()` 运行而没有先前停止时 `Ready`（引导程序在 `stopAll` 执行任何操作之前中止）| `SERVICE_DESTROYED` |仅此而已；通行证结束了|

稍后定居的废弃钩子会完成自己的拆卸，但拆卸多远取决于它的**如何**：

|安顿下来|`_doStop()`|`_doDestroy()`|
| ------- | ----------- | -------------- |
|实现了|处置，然后 → `Stopped`|处置，然后 → `Destroyed`|
|被拒绝|处理（调用位于 `finally` 中），状态保持 `Stopping`|两者都没有——没有处置，状态不变|

在所有四种情况下，**记录的结果保持不变**：没有事件触发，并且摘要未修改。因此，迟到的 `onStop()` 是否仍能获得 `onDestroy()` 是与 `destroyAll()` 达到该服务的一场竞赛，并且不能依赖于此。

上限仅限制*异步等待*。同步阻塞挂钩（同步 `fs` 调用、长循环）不能被计时器抢占，并且仍然会挂起进程，整个关闭熔断器 (`SHUTDOWN_TIMEOUT_MS`) 也是如此。计时也从钩子的第一个 `await` 开始，因此长同步前缀将实际边界推过 5 秒。

### 自动资源清理

BaseService 使用单一统一的 Disposable 跟踪机制。所有资源（IPC 处理程序、事件订阅、循环计时器、信号、清理函数）都作为一次性资源进行跟踪，并在停止生命周期期间一起清理。

`registerDisposable()` 接受 `Disposable` 对象和普通 `() => void` 清理函数：

```typescript
this.registerDisposable(someEmitter.on('event', handler))    // Disposable object
this.registerDisposable(() => externalBus.off('topic', fn))  // Cleanup function
```

`ipcHandle()`、`ipcOn()` 和 `registerInterval()` 都返回通过同一通道注册的 `Disposable` — IPC 处理程序和循环计时器不是单独的清理类别。

清理流程：

```
onStop() → all disposables disposed → state = Stopped
```

两个箭头都遵循 `onStop()` 沉降，无论其沉降方式如何：

- **`onStop()` throws** — 处理仍然运行（它的调用位于 `finally` 中）；仅跳过 `Stopped` 转换，因此状态保留在 `Stopping`。 `onDestroy()` 仍在运行：它下面没有执行任何操作。
- **`onStop()` 被遗弃在天花板上**——两支箭都还没有射出。 `_doDestroy` 会跳过停止仍在运行的服务，而不是拆除停止可能仍在使用的资源。如果钩子稍后解决，则随后运行处理，如果它解决而不是抛出，则 `Stopped` 转换也会运行 - 请参阅上面的拆卸时间合同。

请注意谓词：**仍在飞行中停止**，而不是 `state === Stopping`。两个案例都落在 `Stopping` 上，但只有其中一个仍在运行。

`_doDestroy` 是幂等的——在已经销毁的服务上调用它是安全的无操作。

有关使用详细信息，请参阅[IPC 处理程序管理](./lifecycle-usage.md#ipc-handler-management) 和[服务事件](./lifecycle-usage.md#service-events-emitter--event)。

### onAllReady（系统范围就绪）

在所有引导阶段的**所有**服务完成初始化后调用一次。与 `onReady()` （在单个服务准备就绪时触发）不同，`onAllReady()` 在整个系统准备就绪时触发 - 无论 `@DependsOn` 声明如何，都可以安全地访问任何服务。

```typescript
@Injectable('BackgroundReporterService')
class BackgroundReporterService extends BaseService {
  protected onAllReady() {
    // Safe to access any service — the entire system is ready
    const preferenceService = application.get('PreferenceService')
  }
}
```

**关键行为：**
- `onAllReady` 是**引导后补充**，不是初始化的一部分。它不会更改 `生命周期State` — 服务始终保持在 `Ready` 中。
- `生命周期Manager.allReady()` 并行调用每个服务的钩子并且**不等待完成**（即发即忘）。一旦调用了每个钩子，引导程序就会继续进行。
- `ALL_SERVICES_READY` 在所有钩子被调用后立即发出，而不是在它们完成后发出。当此事件触发时，侦听器不得假设 `onAllReady` 副作用已完成。
- 每个服务实例最多调用一次 - `restart()` 不会**重新触发它（由 `_allReadyCalled` 保护）。
- 同步抛出的错误或通过返回的 Promise 抛出的错误由框架中的异步 `.catch` 捕获、记录并作为 `SERVICE_ERROR` （在微任务中）发出 - 它们永远不会传播到引导程序。
- **不要将 `await` 长时间运行的业务直接在 `onAllReady` 中工作。** 因为框架不再等待钩子，钩子中的 `await` 会变成静默的后台工作。如果服务需要推迟业务工作（e.g。一个安静的窗口，然后恢复），请通过 `setTimeout` 安排它，跟踪实例上生成的 Promise，并从 `onStop` 加入它。该连接受限于关闭路径 - 请参阅[生命周期用法 - onAllReady 模式](./lifecycle-usage.md#onallready-business-work-pattern)。

### `onAllReady` 挂钩与 `ALL_SERVICES_READY` 事件

相同的准备时间，两个交付渠道。两者均由一个同步 `生命周期Manager.allReady()` 调用触发 - 框架首先调用每个服务的 `onAllReady`，然后发出 `ALL_SERVICES_READY`。它们在同一个 JS 滴答上相隔微秒。

| |`onAllReady` 钩子|`ALL_SERVICES_READY` 事件|
|---|---|---|
|机制|推送——框架调用每个服务一次|Pub/sub — 仅 `.on(...)` 订阅者接收|
|观众|服务本身，通过方法重写|任何有 `生命周期Manager` 参考资料的人|
|故障处理|被框架捕获，重新发出为 `SERVICE_ERROR`|标准 `EventEmitter` 行为|

**经验法则**：服务通过自己的 `onAllReady` 做出反应；非服务代码（诊断、遥测、临时侦听器）订阅事件。当*特定服务的*延迟工作完成时，两者都不会发出信号 - 为此，公开每个服务 `Signal`。

## 服务状态

|状态|描述|
| -------------- | --------------------------------------- |
|`Created`|实例已创建，未初始化|
|`Initializing`|当前正在运行 `onInit()`|
|`Ready`|完全初始化并可运行|
|`Pausing`|当前正在运行 `onPause()`|
|`Paused`|暂时暂停|
|`Resuming`|当前正在运行 `onResume()`|
|`Stopping`|当前正在运行 `onStop()`|
|`Stopped`|已停止，可以通过 `start()` 重新启动|
|`Destroyed`|已释放，不可重复使用|

## 生命周期事件（内部 API）

> 对于大多数用例，优先使用 `onAllReady()` 钩子或 `application.get()` 而不是原始事件监听。这些事件主要用于基础设施代码（e.g.、诊断、日志记录）。有关挂钩与事件的权衡，请参阅 [`onAllReady` 挂钩与 `ALL_SERVICES_READY` 事件](#onallready-hook-vs-all_services_ready-event)。

通过 `生命周期Manager` （扩展 `EventEmitter`）监听生命周期事件：

```typescript
import { LifecycleEvents, LifecycleManager } from '@main/core/lifecycle'

const manager = LifecycleManager.getInstance()

manager.on(LifecycleEvents.SERVICE_READY, (payload) => {
  logger.info(`${payload.name} is ready`)
})

manager.on(LifecycleEvents.ALL_SERVICES_READY, () => {
  logger.info('All services ready')
})
```

|事件|有效载荷|描述|
| ---------------------- | ------------------------ | ------------------------------------- |
| `SERVICE_INITIALIZING` |`{ name, state }`|服务正在开始初始化|
| `SERVICE_READY`        |`{ name, state }`|服务完成初始化|
| `SERVICE_PAUSING`      |`{ name, state }`|服务正在暂停|
| `SERVICE_PAUSED`       |`{ name, state }`|服务已暂停|
| `SERVICE_RESUMING`     |`{ name, state }`|服务正在恢复中|
| `SERVICE_RESUMED`      |`{ name, state }`|服务已恢复|
| `SERVICE_STOPPING`     |`{ name, state }`|服务正在停止|
| `SERVICE_STOPPED`      |`{ name, state }`|服务已停止|
| `SERVICE_DESTROYED`    |`{ name, state }`|服务被破坏|
| `SERVICE_ERROR`        |`{ name, state, error }`|服务遇到错误|
| `ALL_SERVICES_READY`   |（没有任何）|所有 `onAllReady` 挂钩都已被调用（不一定已完成 - 请参阅 [onAllReady](#onallready-system-wide-readiness)）|

## 服务间通信

`@DependsOn` 保证初始化顺序，但某些服务需要对其他服务在**运行时**（在 `onInit()` 之后）完成的工作做出反应。例如，`ShortcutService` 需要知道 `MainWindowService` 何时创建主窗口 - 这在所有服务初始化之后发生。

生命周期系统为此提供了两种类型原语，避免临时 `EventEmitter` 模式（无类型安全、魔术字符串、手动清理）：

|沟通模式|机制|例子|
|---|---|---|
|“服务 B 必须在服务 A 之后初始化”|`@DependsOn`|PreferenceService 依赖于 DbService|
|“服务A完成运行时工作，其他人做出反应”（可重复）|`Emitter<T>` / `Event<T>`|MainWindowService 触发 `onMainWindowCreated`|
|“服务A完成运行时工作，其他人做出反应”（一次性）|`Signal<T>`|DbService 信号 `migrationComplete`|
|“告诉特定的服务做某事”|通过 `application.get()` 直接方法调用|`windowService.showMainWindow()`|

### 发射器/事件（可重复）

生产者服务拥有 `Emitter<T>` （私有）并公开其 `Event<T>` （公共）。消费者订阅并获得 `Disposable`，用于通过 `registerDisposable()` 自动清理。

### 信号（单发）

`Signal<T>` 只解析一次。它实现了 `PromiseLike<T>`，因此消费者可以直接 `await` 它。迟到的订阅者会立即收到解析值。

有关完整的使用模式和代码示例，请参阅 [服务事件](./lifecycle-usage.md#service-events-emitter--event) 和 [信号](./lifecycle-usage.md#signal-one-shot-completion)。

## 文件结构

```
lifecycle/
├── types.ts              # Phase, LifecycleState, ServiceMetadata, Pausable, errors
├── decorators.ts         # @Injectable, @ServicePhase, @DependsOn, @Priority, etc.
├── BaseService.ts        # Abstract base class with lifecycle hooks
├── event.ts              # Emitter<T>, Event<T>, Disposable — typed inter-service events
├── signal.ts             # Signal<T> — one-shot deferred value (PromiseLike)
├── ServiceContainer.ts   # IoC container with DI and conditional activation
├── DependencyResolver.ts # Topological sort, layered parallel resolution
├── LifecycleManager.ts   # Phased bootstrap, shutdown, pause/resume/stop/start
├── index.ts              # Barrel export
└── __tests__/            # Unit tests for all components
```
