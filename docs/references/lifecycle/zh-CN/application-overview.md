# 应用概述

应用程序是将生命周期系统和 Electron 应用程序联系在一起的顶级编排器。它是运行时引导、关闭和控制服务的单一入口点。

## 与生命周期的关系

```
Application          — "what to do" (register services, bootstrap, shutdown, runtime control)
  └── lifecycle/     — "how to do it" (IoC container, dependency resolution, state machine)
```

应用程序不重复生命周期逻辑。它在内部委托给 `ServiceContainer` 和 `生命周期Manager`，同时提供干净的应用程序级 API。

有关生命周期内部结构（阶段、钩子、状态、装饰器、事件），请参阅[生命周期概述](./lifecycle-overview.md)。

## 快速入门

`application` 从 `@application` 路径别名导入，直接解析为 `Application.ts`（在 `tsconfig.node.json` 和 `electron.vite.config.ts` 中配置）。 bootstrap-internal `serviceList` 直接从 `serviceRegistry.ts` 导入 - 它不是 `@application` 表面的一部分，因此导入定位器永远不会拉入整个服务图：

```typescript
import { application } from '@application'
import { serviceList } from '@main/core/application/serviceRegistry'

// 1. Register all services
application.registerAll(serviceList)

// 2. Bootstrap (handles all three phases + Electron lifecycle)
await application.bootstrap()

// 3. Access a service
const dbService = application.get('DbService')
```

## 引导流程

`application.bootstrap()` 编排完整的启动序列：

```
setupSignalHandlers()                    ← SIGINT/SIGTERM → graceful shutdown
setupQuitHandlers()                      ← before-quit (preventQuit gate) + will-quit (shutdown)
    │
    ├── startPhase(Background)           ← fire-and-forget (non-blocking)
    │
    ├── startPhase(BeforeReady)  ─┐
    │                             ├──── run in parallel
    └── app.whenReady()          ─┘
            │
            ├── setupElectronHandlers()  ← window-all-closed, preventQuit IPC
            │
            ├── startPhase(WhenReady)    ← services requiring Electron API
            │
            ├── await Background         ← ensure background services finished
            │
            └── allReady()               ← notify all services the system is fully ready
```

如果 `fail-fast` 服务在引导期间抛出异常，则会显示一个对话框，提供“退出”或“重新启动”。

## 关机流程

`application.shutdown()` 是每个“优雅”出口的收敛点 - `will-quit` 只是 Electron 事件链收敛的地方。进出路线：

|扳机|路线|
| ------- | ----- |
|托盘/菜单退出，窗口关闭，`window-all-closed`|`application.quit()` → `before-quit` → `will-quit` → `shutdown()`|
|macOS Cmd+Q|Electron内置`app.quit()`，同链|
| `SIGINT` / `SIGTERM` |handler 绕过 Electron 链直接等待 `shutdown()`|
|数据重置|`dataReset.ts` 直接调用 `application.shutdown()`|
|系统关闭|`PowerService` 让我们*进入*这条道路；操作系统不会等待它完成|
|`forceExit()` / `relaunch()`|**故意**绕过它 - 立即`app.exit()`，无需拆解|
|`kill -9`、崩溃、断电|完全绕过——服务在下次启动时自我修复|

```
shutdown()
    ├── bootConfigService.flush()   ← save pending debounced writes
    ├── stopAll()                   ← onStop() in reverse initialization order
    ├── destroyAll()                ← onDestroy() in reverse initialization order
    └── loggerService.finish()      ← close logger (must be last)
```

`stopAll()` / `destroyAll()` 将每个服务的上限限制为 `SERVICE_STOP_TIMEOUT_MS`（5 秒），因此陷入 `onStop()` 的人不再拒绝其轮流后的每个服务。两者都会返回超时或失败的摘要，并且 `Shutdown complete` 行说明退出是否干净 - 在诊断错误关闭时首先读取它。

### 强制退出保险丝

每个入口点在 `shutdown()` 周围配备一个 `SHUTDOWN_TIMEOUT_MS`（30 秒）`process.exit(1)` 计时器。这是最后的手段，不是工作机制：

- 健康关闭只需不到一秒即可完成，并且永远不会接近它。
- 它**不**保证每项服务的上限始终运行到完成 - 六项服务各自消耗全部 5 秒来达到该上限，并且 `stopAll()` + `destroyAll()` 共享预算。截断超过该点是正确的；该应用程序已经处于不良状态。
- 与这里的每个基于计时器的绑定一样，它对于同步阻塞 `onStop()` 是无能为力的，它永远不会产生事件循环来触发计时器。

## 服务注册中心

服务注册在 `serviceRegistry.ts` 中。添加服务只需一行：

```typescript
// serviceRegistry.ts
import { NewService } from '@main/services/NewService'

export const services = {
  // ... existing services
  NewService,    // ← add one line, types are auto-derived
} as const
```

这使您可以通过 `application.get('NewService')` 进行类型安全访问。

## 服务访问规则

由生命周期系统管理的服务不得**导出单例实例。导出服务 CLASS 仅用于类型引用（e.g.、`ServiceRegistry`、`@DependsOn`）。所有运行时访问都通过 `application.get()` （无条件服务）或 `application.getOptional()` （带有 `@Conditional` 的条件服务）。

### 使用前分配给局部变量

**不要**直接将 `application.get('...')` 与方法调用链接起来。首先将服务分配给局部变量，然后使用它：

```typescript
// ✗ BAD: chained calls
application.get('PreferenceService').get('app.zoom_factor')
application.get('PreferenceService').set('app.zoom_factor', 1)

// ✓ GOOD: assign first, then use
const preferenceService = application.get('PreferenceService')
preferenceService.get('app.zoom_factor')
preferenceService.set('app.zoom_factor', 1)
```

这提高了可读性，避免了重复的容器查找，并使代码更容易重构。

### 有条件的服务访问

具有 `@Conditional` 的服务必须通过 `getOptional()` 访问，它返回 `T | undefined`。即使该服务在当前平台上处于活动状态，在条件服务上使用 `get()` 也会引发错误 - 这可以防止跨平台错误。

```typescript
// ✗ BAD: get() on conditional service — throws even if service is active
const menu = application.get('AppMenuService')

// ✓ GOOD: getOptional() for conditional services
const menu = application.getOptional('AppMenuService')
menu?.buildMenu()
```

## 运行时服务控制

在运行时控制各个服务而无需重新启动应用程序：

```typescript
// Stop a service (cascades to dependents)
await application.stop('HeavyComputeService')

// Start a stopped service (re-runs onInit, cascades to dependents)
await application.start('HeavyComputeService')

// Restart = stop + start
await application.restart('HeavyComputeService')

// Pause/Resume (service must implement Pausable interface)
await application.pause('RealTimeService')
await application.resume('RealTimeService')
```

所有操作都会自动通过依赖图级联。

### 级联操作

当 pausing/stopping 一个服务时，所有依赖它的服务都会自动首先 paused/stopped 。当 resuming/starting 时，相关服务按相反顺序恢复。

```typescript
// If PreferenceService depends on DbService:
await application.stop('DbService')
// → PreferenceService is stopped first, then DbService

await application.start('DbService')
// → DbService is started first, then PreferenceService
```

**重要**：对于 pause/resume，级联链中的所有服务都必须实现 `Pausable`。如果任何依赖服务不这样做，则操作将中止并显示错误日志。

## 应用程序重新启动

始终使用 `application.relaunch()` 而不是直接调用 `app.relaunch()`。它处理：

- **开发模式检测**：显示对话框并正常退出（开发模式下无法自动重新启动）
- **平台修复**：Linux AppImage `execPath` 重写，Windows Portable 可执行路径

```typescript
import { application } from '@application'

// Simple relaunch
application.relaunch()

// With custom options (forwarded to Electron's app.relaunch)
application.relaunch({ args: ['--safe-mode'] })
```

## 应用程序退出

始终使用 `application.quit()` 或 `application.forceExit()` 而不是直接调用 `app.quit()` / `app.exit()`。如果在 `Application.ts` 之外的 `src/main/` 中使用 `app.quit()` 或 `app.exit()`，ESLint 规则 (`no-restricted-properties`) 将发出警告。

```typescript
import { application } from '@application'

// Graceful quit — triggers the Electron before-quit / will-quit event chain
application.quit()

// Force exit — skips the event chain, for fatal/unrecoverable errors only
application.forceExit(1)

// Mark as quitting without triggering quit — for external quit flows (e.g. autoUpdater)
application.markQuitting()

// Prevent quit during critical operations (e.g. data migration)
const hold = application.preventQuit('Migrating data')
try { /* critical work */ } finally { hold.dispose() }

// Check quit status
if (application.isQuitting) { /* ... */ }
```

|方法|事件链|使用案例|
|--------|-------------|----------|
|`quit()`|触发器 `before-quit` → `will-quit`|正常用户发起的退出|
|`forceExit(code)`|跳过|致命错误，渲染器反复崩溃|
|`markQuitting()`|无（仅标志）|`autoUpdater.quitAndInstall()` 拥有自己的退出流程|
|`preventQuit(reason)`|块 `before-quit`|关键操作（使用 `dispose()` 返回保持）|

**例外**（可以接受直接 `app.quit()` 的情况）：
- `application`初始化之前（e.g.，`index.ts`中单实例锁失败）
- 在完整应用程序生命周期之前运行的迁移文件 (`src/main/data/migration/`)

### 渲染器使用

渲染器通过 `window.api.application` 访问应用程序生命周期方法：

```typescript
// Quit the app (triggers before-quit → will-quit event chain)
await window.api.application.quit()

// Relaunch the app
await window.api.application.relaunch()
await window.api.application.relaunch({ args: ['--safe-mode'] })

// Prevent quit during critical operations (returns opaque holdId)
const holdId = await window.api.application.preventQuit('Migrating user data')
try {
  await performCriticalWork()
} finally {
  await window.api.application.allowQuit(holdId)
}
```

|方法|退货|描述|
|--------|---------|-------------|
|`quit()`|`Promise<void>`|通过 Electron 事件链优雅退出|
|`relaunch(options?)`|`Promise<void>`|重新启动应用程序（使用可选参数）|
|`preventQuit(reason)`|`Promise<string>`（持有ID）|阻止应用程序退出直至发布|
|`allowQuit(holdId)`|`Promise<void>`|释放特定的戒烟预防保留|

## `application` 代理

导出的 `application` 常量是一个惰性代理 - 在调用 `bootstrap()` 之前可以安全地在模块顶层导入。实际的 `Application` 实例是在第一次属性访问时创建的。

```typescript
// Safe to import anywhere, even at module scope
import { application } from '@application'
```

## 文件结构

```
application/
├── Application.ts      # Application singleton + lazy proxy — the `@application` alias target
└── serviceRegistry.ts  # Central service registry (add services here); imported directly, no barrel
```
