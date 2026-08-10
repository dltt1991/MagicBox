# 生命周期使用指南

使用生命周期系统的实用指南。有关架构详细信息，请参阅[生命周期概述](./lifecycle-overview.md)。要决定是否使用生命周期，请参阅[决策指南](./lifecycle-decision-guide.md)。

## 快速入门

```typescript
// 1. Define a service with decorators
import { BaseService, Injectable, ServicePhase, DependsOn, Phase } from '@main/core/lifecycle'

@Injectable('DbService')
@ServicePhase(Phase.WhenReady)
class DbService extends BaseService {
  protected async onInit() {
    await this.connectToDatabase()
  }

  protected async onDestroy() {
    await this.disconnect()
  }
}

@Injectable('PreferenceService')
@DependsOn(['DbService'])
class PreferenceService extends BaseService {
  protected async onInit() {
    // DbService is guaranteed to be ready
    await this.loadPreferences()
  }
}

// 2. Register in serviceRegistry.ts and bootstrap via Application
//    See: docs/references/lifecycle/application-overview.md
import { application } from '@application'
await application.bootstrap()

// 3. Access service instance
const dbService = application.get('DbService')
```

## 装饰器

|装饰者|描述|默认|
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
|`@Injectable('Name')`|将类标记为可注入的单例服务。名称是**必需的**，因为捆绑程序会破坏类名称。必须与 `serviceRegistry.ts` 中的键匹配。|必需的|
|`@ServicePhase(Phase.X)`|设置引导阶段|`Phase.WhenReady`|
|`@DependsOn([...])`|通过服务名称声明依赖关系| `[]`              |
|`@Priority(n)`|层内的初始化优先级（较低=较早）| `100`             |
|`@ErrorHandling(strategy)`|错误处理策略|`'graceful'`|
|`@Conditional(...)`|仅当满足所有条件时才激活服务（请参阅[条件激活](#conditional-activation)）|始终活跃|

**注意：** 所有服务都是单例的。创建服务类后尝试直接实例化该服务类（通过 `new`）将会引发错误。使用 `application.get('ServiceName')` 访问服务实例（请参阅[应用概述](./application-overview.md)）。

## 错误处理策略

|战略|行为|
| -------------------- | ------------------------------------------------------ |
|`graceful`（默认）|记录错误并继续引导。|
|`fail-fast`|抛出 `ServiceInitError`，中止启动。|
|`custom`|委托给 `生命周期:service:error` 事件侦听器。|

```typescript
@Injectable('DbService')
@ErrorHandling('fail-fast')
class DbService extends BaseService {
  protected async onInit() {
    // If this fails, the entire bootstrap is aborted
    await this.connect()
  }
}
```

## 有条件激活

使用 `@Conditional` 声明服务的激活条件。注册过程中，不满足条件的服务将被静默跳过。

```typescript
// Platform-specific: macOS only
@Injectable('AppMenuService')
@Conditional(onPlatform('darwin'))
class AppMenuService extends BaseService { ... }

// Multiple conditions (AND logic): Windows + Intel CPU
@Injectable('OvmsService')
@Conditional(onPlatform('win32'), onCpuVendor('intel'))
class OvmsService extends BaseService { ... }

// Environment variable driven
@Injectable('DebugService')
@Conditional(onEnvVar('DEBUG', 'true'))
class DebugService extends BaseService { ... }

// Custom function
@Injectable('GpuService')
@Conditional(when((ctx) => checkNvidiaGpu(), 'requires NVIDIA GPU'))
class GpuService extends BaseService { ... }

// Complex boolean: OR(AND(x1, x2), AND(y1, y2))
@Conditional(anyOf(allOf(onPlatform('win32'), onArch('x64')), allOf(onPlatform('linux'), onArch('arm64'))))
```

### 内置条件

|工厂|描述|例子|
|---------|-------------|---------|
|`onPlatform(...platforms)`|比赛平台|`onPlatform('darwin')`|
|`onArch(...archs)`|匹配架构|`onArch('x64', 'arm64')`|
|`onCpuVendor(vendor)`|匹配CPU供应商（CPU型号的不区分大小写的子字符串）|`onCpuVendor('intel')`|
|`onEnvVar(name, value?)`|匹配环境变量|`onEnvVar('DEBUG', 'true')`|
|`when(fn, desc)`|自定义谓词函数|`when((ctx) => check(), 'desc')`|
|`not(cond)`|否定条件|`not(onPlatform('linux'))`|
|`anyOf(...conds)`|OR：任意条件匹配|`anyOf(onPlatform('darwin'), onPlatform('win32'))`|
|`allOf(...conds)`|AND：所有条件都匹配|`allOf(onPlatform('win32'), onCpuVendor('intel'))`|

**传递排除**：如果ServiceA被排除，而ServiceB依赖于ServiceA，则ServiceB也会被自动排除。

### 获得有条件服务

有条件服务必须通过 `getOptional()` 而不是 `get()` 访问。这两种方法是互斥的：

|方法|无条件服务|有条件服务（主动）|有条件服务（不含）|
|--------|----------------------|------------------------------|-------------------------------|
|`get()`|✅ 返回 `T`|❌ 投掷|❌ 投掷|
|`getOptional()`|❌ 投掷|✅ 返回 `T`|✅ 返回 `undefined`|

```typescript
// Unconditional service — always use get()
const db = application.get('DbService')

// Conditional service — always use getOptional()
const ovms = application.getOptional('OvmsService')
ovms?.start()
```

访问 `onAllReady()` 或更高版本（e.g.、IPC 处理程序）中的条件服务，以确保所有服务均已初始化。

## IPC 处理程序管理

当生命周期服务注册IPC处理程序时，它应该使用BaseService的内置跟踪，而不是直接调用`ipcMain`。这确保了当服务停止、重新启动或被销毁时，处理程序会自动清理——无需手动 `unregisterIpcHandlers()` 方法。

### API

|方法|裹布|自动清理通过|退货|
|--------|-------|------------------|---------|
|`this.ipcHandle(channel, listener)`|`ipcMain.handle()`|`ipcMain.removeHandler()`|`Disposable`|
|`this.ipcOn(channel, listener)`|`ipcMain.on()`|`ipcMain.removeListener()`|`Disposable`|
|`this.registerInterval(callback, intervalMs)`|`setInterval()` + `unref()`|`clearInterval()`|`Disposable`|

> 两个助手都不会验证发送者：糖已被弃用（请参阅 [IpcApi 迁移指南](../../ipc/ipc-migration-guide.md)），并且迁移到 IpcApi 的通道将获取其 `validateSender` 门。保持糖度并需要源信任的通道必须在其处理程序中显式调用 `validateSender` (`src/main/core/security/validateSender.ts`)，就像 PreferenceService/CacheService 一样。

> 故意不提供 `ipcOnce()` — 一次侦听器触发一次并自动删除，因此它们不需要生命周期跟踪。

> 有意不提供 `registerTimeout()` — 单次计时器触发一次并自动清除，因此它们不需要生命周期跟踪。

### 习俗

将所有 IPC 注册提取到 **`private registerIpcHandlers()`** 方法中，并从 `onInit()` （或 `onReady()`）调用它。这使得生命周期挂钩专注于编排，并使 IPC 界面易于定位和审查。

```typescript
@Injectable('MainWindowService')
@ServicePhase(Phase.WhenReady)
export class MainWindowService extends BaseService {
  protected async onInit() {
    this.registerIpcHandlers()
  }

  private registerIpcHandlers() {
    this.ipcHandle(IpcChannel.Windows_Minimize, () => this.mainWindow!.minimize())
    this.ipcHandle(IpcChannel.Windows_Maximize, () => this.mainWindow!.maximize())
  }

  protected async onStop() {
    // Only service-specific cleanup here
    // IPC handlers are removed automatically after onStop() returns
  }
}
```

> **命名**：始终使用 `registerIpcHandlers`（复数）。请勿使用 `setupIpcHandlers`、`registerIpcHandler`（单数）或其他变体。

### 清洁保证

1. **停止时**：`onStop()` 返回后**将删除所有跟踪的处理程序，因此如果需要，服务在其自身关闭期间仍然可以使用 IPC。
2. **停止失败**：如果 `onStop()` 抛出，IPC 清理仍然执行（通过 try/finally）。
3. **销毁时**：安全网清理在 `_doDestroy()` 中运行，用于服务在未先停止的情况下被销毁的边缘情况（e.g.，初始化失败）。
4. **重新启动时**：清理后重置 Disposables 数组，因此 `onInit()` 可以干净地重新注册处理程序。
5. **向后兼容**：可以安全地与 `onStop()` 中的手动 `ipcMain.removeHandler()` 混合 — 双重删除是无操作的。
6. **统一清理**：IPC 处理程序和其他一次性事件（事件订阅、清理函数）通过​​单个 `registerDisposable()` 机制进行跟踪并一起清理。

### 相行为

`this.ipcHandle()` 和 `this.ipcOn()` 在任何阶段工作（`BeforeReady`、`WhenReady`、`Background`）。帮助器是 `ipcMain` 的薄包装器 - 阶段系统控制*何时* `onInit()` 运行（以及处理程序何时注册），而不是注册 API 是否可用。

## 循环定时器

`this.registerInterval(callback, intervalMs)` 用于服务生命周期范围内的定期工作（GC、轮询、心跳）。立即启动，`unref`'d，异常隔离（每个刻度的抛出都会被捕获并独立记录，因此一次失败无法停止循环），在 `onStop()` 上自动清除。返回 `Disposable`。

```typescript
private gcInterval: Disposable | null = null

protected async onStop() {
  this.gcInterval = null // auto-disposed; null'd so a restart re-arms it
}

private startGc() {
  if (this.gcInterval) return
  this.gcInterval = this.registerInterval(() => this.gc(), 10 * 60 * 1000)
}
```

如果该字段从未被读取（e.g.，从 `onInit` 中即发即弃），则完全删除它。

**请勿用于**：激活范围的计时器（在 __PH0__/__PH1__ 中手动管理）、一次性延迟（使用 `setTimeout`）、连接范围的心跳（在连接中管理）。

## onAllReady 业务工作模式

`onAllReady` 在每个阶段的每个服务完成 `onInit` / `onReady` 后被调用一次，并且是一个[引导后补充](./lifecycle-overview.md#onallready-system-wide-readiness) - `生命周期Manager.allReady()` **不**等待它。两个结果决定了如何使用钩子：

1. **`_allReadyCalled` 至多一次。** 每个服务实例的 `onAllReady` 只触发一次。 `restart()` 不会重新触发它。每次（重新）启动时需要运行的代码属于 `onInit` / `onReady`，而不是 `onAllReady`。
2. **框架不会观察到挂钩返回值。** 如果您在 `onAllReady` 内 `await` 长时间运行业务工作，框架既不等待也不知道。引导程序立即继续。从框架的角度来看，该钩子本质上是“即发即忘”。

如果服务需要延迟工作，并且应该在系统准备就绪后运行（安静的窗口、一次性恢复扫描等），则补充挂钩是**安排**它的正确位置，而不是**运行**它：

```typescript
@Injectable('DeferredWorkExampleService')
class DeferredWorkExampleService extends BaseService {
  private _isShuttingDown = false
  private _workDone: Promise<void> | undefined

  protected override onAllReady(): void {
    // Schedule the deferred work via setTimeout, return synchronously.
    const handle = setTimeout(() => {
      if (this._isShuttingDown) return
      this._workDone = this.runDeferredWork()
    }, 60_000)

    // Hand the timer to BaseService so onStop's _cleanupDisposables clears it.
    this.registerDisposable(() => clearTimeout(handle))
  }

  private async runDeferredWork(): Promise<void> {
    // Check the shutdown flag between every IO step so a teardown arriving
    // mid-flight short-circuits the remainder.
    if (this._isShuttingDown) return
    await this.stepOne()

    if (this._isShuttingDown) return
    await this.stepTwo()
  }

  protected override async onStop(): Promise<void> {
    this._isShuttingDown = true

    // Join the deferred work if it had already started.
    if (this._workDone) {
      try {
        await this._workDone
      } catch {
        // Errors are already logged inside runDeferredWork.
      }
    }
  }
}
```

三个不变量保证了这一点的安全：

- **关闭标志**：在计时器回调条目处以及延迟流内的每个 IO 步骤之间检查 `_isShuttingDown`，因此到达任一窗口的拆卸都会干净地短路。
- **一次性计时器**：`registerDisposable(() => clearTimeout(handle))` 保证计时器被 `_cleanupDisposables` 清除，即使服务在安静窗口过去之前停止。
- **`onStop` join**：将流的 `Promise` 分配给 `this._workDone` 并从 `onStop` 等待它，为框架提供了一种在拆除依赖资源之前等待中途步骤的方法。

**连接受限于关闭路径。** `stopAll()` 将每个服务限制在 `SERVICE_STOP_TIMEOUT_MS`（5 秒）。到期时，框架会记录该服务，并将其记录为超时，然后移至下一个。上限放弃*等待*，而不是工作：您的 `onStop` 继续运行，如果它稍后解决，它仍然会处理（并且，如果它解决而不是抛出，到达 `Stopped`） - 但没有 `SERVICE_STOPPED` 触发并且记录的结果有效。 `onDestroy()` 是否仍然运行取决于较晚的结算是否优于 `destroyAll()` 为您提供服务；假设没有。运行时 `stop()` / `restart()` 路径没有这样的上限。请参阅[生命周期概述 - 拆卸时间合同](./lifecycle-overview.md#teardown-time-contract)。

加入清理工作*有总比没有好*。永远不要让正确性依赖于它的完成：`kill -9`、崩溃或断电会直接绕过 `onStop`，因此工作必须已经是原子的（tmp + 重命名）或自我修复（在下次启动时恢复）。

真实示例：`JobManager.onAllReady` 注册一个 `setTimeout`，该 `setTimeout` 会在大约 60 秒后触发，然后运行恢复流程。请参阅 [job-and-scheduler/overview.md — 启动恢复](../../job-and-scheduler/overview.md#startup-recovery)。

## 服务事件（发射器/事件）

### 问题

`@DependsOn` 保证初始化顺序，但某些服务需要对其他服务在**运行时**（在 `onInit()` 之后）完成的工作做出反应。例如，当 `MainWindowService` 创建主窗口时，`ShortcutService` 需要绑定快捷方式，这发生在所有服务初始化之后。该窗口也可以重新创建（macOS 激活），因此通知必须是可重复的。

### 何时使用

- 服务完成其他服务需要做出反应的异步工作
- 该工作可能在应用程序生命周期中发生多次（可重复）
- 多个消费者可能需要做出反应（一对多广播）

**不要使用**来告诉特定服务执行某些操作 - 只需通过 `application.get()` 直接调用其方法。

### 生产者模式

生产者拥有私有 `Emitter<T>` 并公开其公共 `Event<T>`。遵循命名约定：私有 `_onXxx`，公共 `onXxx`。

```typescript
import { BaseService, Emitter, type Event, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'

@Injectable('MainWindowService')
@ServicePhase(Phase.WhenReady)
export class MainWindowService extends BaseService {
  // Private: only this service can fire
  private readonly _onMainWindowCreated = new Emitter<BrowserWindow>()
  // Public: consumers subscribe to this
  public readonly onMainWindowCreated: Event<BrowserWindow> = this._onMainWindowCreated.event

  public createMainWindow(): BrowserWindow {
    // ...create window...
    this._onMainWindowCreated.fire(this.mainWindow)
    return this.mainWindow
  }

  // Emitter is owned infrastructure — dispose only on destroy, not stop
  protected async onDestroy() {
    this._onMainWindowCreated.dispose()
  }
}
```

**重要**：请勿 `registerDisposable()` 拥有发射器。它们与服务实例一起存在，并且仅在 `onDestroy()` （而不是 `onStop()`）中进行处理，因此可以重新启动服务而不会丢失 Emitter。

### 消费模式

消费者通过公共`Event<T>`订阅并注册订阅以进行自动清理。

```typescript
@Injectable('ShortcutService')
@DependsOn(['MainWindowService'])
export class ShortcutService extends BaseService {
  protected async onInit() {
    const windowService = application.get('MainWindowService')
    this.registerDisposable(
      windowService.onMainWindowCreated((window) => this.bindShortcuts(window))
    )
  }

  // No manual cleanup needed in onStop() — registerDisposable handles it
}
```

### 错误隔离

`Emitter.fire()` 隔离侦听器错误 - 如果一个侦听器抛出异常，所有其他侦听器仍会收到该事件。侦听器的快照是在迭代之前拍摄的，因此侦听器可以在触发周期期间安全地取消订阅。

## 信号（一次性完成）

### 问题

某些服务只完成一项工作**一次**，其他服务需要等待或做出反应。例如，在初始化期间运行的数据库迁移 — 一旦完成，就永远完成。与多次触发的 `Emitter` 事件不同，这需要一次性通知，以便迟到的订阅者仍然可以获得该值。

### 何时使用

- 异步发生的一次性初始化工作（数据库迁移、存储水合作用）
- 其他服务需要 `await` 完成此操作才能继续
- 迟到的订阅者（信号解析后启动的服务）仍应获得该值

**不要将**用于可重复事件（窗口创建、配置更改）——请使用 `Emitter<T>` 代替。

### 用法

```typescript
import { BaseService, Injectable, Signal } from '@main/core/lifecycle'

// Producer
@Injectable('DbService')
export class DbService extends BaseService {
  readonly migrationComplete = new Signal<void>()

  protected async onInit() {
    this.registerDisposable(this.migrationComplete)
    await this.runMigrations()
    this.migrationComplete.resolve()
  }
}

// Consumer — await style
@Injectable('UserService')
@DependsOn(['DbService'])
export class UserService extends BaseService {
  protected async onInit() {
    await application.get('DbService').migrationComplete
    // migration is guaranteed complete here
  }
}

// Consumer — callback style
@Injectable('AuditService')
@DependsOn(['DbService'])
export class AuditService extends BaseService {
  protected async onInit() {
    this.registerDisposable(
      application.get('DbService').migrationComplete.onResolved(() => {
        this.logMigrationEvent()
      })
    )
  }
}
```

### 关键行为

- 实现 `PromiseLike<T>` — 可以直接 `await`ed
- `resolve()` 只能被调用一次——双重解析会抛出错误
- 迟到的订阅者立即通过 `onResolved` 收到解析值
- 如果在 `resolve()` 之前处理，任何挂起的 `await` 将无限期挂起（服务按反向依赖顺序停止，因此消费者在生产者之前停止）

## Pause/Resume（可选）

服务可以实现 `Pausable` 接口来支持 pause/resume 操作：

```typescript
import { BaseService, Injectable, type Pausable } from '@main/core/lifecycle'

@Injectable('RealTimeService')
class RealTimeService extends BaseService implements Pausable {
  private intervalId: NodeJS.Timeout | null = null

  protected onInit() {
    this.startPolling()
  }

  onPause() {
    clearInterval(this.intervalId!)
    this.intervalId = null
  }

  onResume() {
    this.startPolling()
  }

  private startPolling() {
    this.intervalId = setInterval(() => { /* ... */ }, 1000)
  }
}
```

## Stop/Start/Restart

所有服务都支持 stop/start 操作（不需要特殊接口）：

```typescript
import { application } from '@application'

await application.stop('HeavyComputeService')    // calls onStop()
await application.start('HeavyComputeService')   // calls onInit() again
await application.restart('HeavyComputeService') // stop + start
```

## 可激活（可选 - 按需资源加载）

服务可以实现 `Activatable` 接口来推迟加载大量资源（本机模块、窗口、缓存、文件 I/O），直到运行时满足条件。

与 `@Conditional` （在启动时完全排除服务）不同，可激活服务始终会注册和初始化 - 无论激活状态如何，它们的 IPC 处理程序都保持可用。只有重资源才按需 loaded/released 。

与 `Pausable`（暂时挂起执行）不同，`Activatable` 控制是否分配资源。激活状态与 `生命周期State` 正交 — Ready 服务可以激活或不活动。

### 界面

```typescript
import { application } from '@application'
import { BaseService, Injectable, type Activatable } from '@main/core/lifecycle'

@Injectable('SelectionService')
class SelectionService extends BaseService implements Activatable {
  protected onInit() {
    this.registerIpcHandlers()
    // Set up trigger: subscribe to preference changes
    // Note: PreferenceService is Phase.BeforeReady — guaranteed ready before WhenReady services
    const prefService = application.get('PreferenceService')
    this.registerDisposable(
      prefService.subscribeChange('feature.selection.enabled', async (enabled) => {
        if (enabled) await this.activate()
        else await this.deactivate()
      })
    )
  }

  protected async onReady() {
    // Initial activation check (state is Ready, so activate() works)
    if (application.get('PreferenceService').get('feature.selection.enabled')) {
      await this.activate()
    }
  }

  onActivate() {
    // Load native module, create windows, etc.
  }

  onDeactivate() {
    // Release native module, close windows, etc.
  }
}
```

### Hook 职责（五阶段模型）

|钩|责任|例子|
|------|---------------|---------|
|`onInit()`|基础设施：IPC 处理程序、事件订阅、触发器设置、循环计时器|`registerIpcHandlers()`、`registerDisposable(...)`、`registerInterval(...)`|
|`onReady()`|初始激活检查（状态 = 就绪，`activate()` 有效）|`if (enabled) await this.activate()`|
|`onActivate()`|加载大量资源|本机模块、窗口、缓存|
|`onDeactivate()`|释放大量资源|关闭窗口，清除缓存|
|`onStop()`|生命周期清理（`_doStop()` 在此之前自动停用）|清理非激活订阅|

### 两种激活路径

两条路径在 `_doActivate()` 中共享相同的基本状态检查（就绪状态、幂等性、并发防护）。区别在于它们的包装方式：

- **自激活**（在服务内）：`this.activate()` / `this.deactivate()` — 直接调用 `_doActivate()`，无生命周期事件或日志记录
- **外部激活**（来自其他代码）：`application.activate('ServiceName')` / `application.deactivate('ServiceName')` — 添加 生命周期Manager 验证、日志记录和生命周期事件发射

### 方法级保护模式

对于外部调用的方法（e.g.，由其他服务或通过 IPC），请使用 `isActivated` 作为保护：

```typescript
createSpan(span: ReadableSpan) {
  if (!this.isActivated) return
  // ... heavy work only when activated
}
```

### `onActivate()` 失败合同

如果 `onActivate()` 在部分分配资源后抛出，它**必须**在抛出之前清理这些资源。由于 `isActivated` 在失败时仍保留 `false`，因此可以重试激活 - 部分状态不得泄漏。

### 自动停用

- `_doStop()` 在调用 `onStop()` 之前自动停用（故障不会阻止停止）
- `_doDestroy()` 作为安全网自动停用（用于不停地销毁场景）

### 快速切换 - 当您需要协调器时

`_doActivate()` 的并发防护是 **drop-style**：激活时到达的调用
飞行中是短路的，不是排队的。对于常见情况来说这是正确的，但是如果服务是
在运行时切换，其 __PH0__/__PH1__ 是 **异步**，这是一种快速相反的切换
过渡中的土地被**丢弃**——运行状态可能会偏离最新的意图。

这**不是** `BaseService` 变更（守卫和上面的 `onActivate` 失败合约保持不变）
记录）。相反，受影响的服务**自我保留**
[`createLatestReconciler`](../../../../src/main/core/concurrency/README.md) 并路由其切换
通过它（`getSnapshot: () => ({ desired, actual: this.isActivated })`，
`apply: ({ desired }) => desired ? this.activate() : this.deactivate()`)。看README的判断
表准确显示何时需要（异步 activate/deactivate **和** 运行时切换源；a
完全同步或仅启动服务不需要它）。 `ApiGatewayService` 是参考。
