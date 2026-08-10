# 生命周期迁移指南

本指南将引导您将现有的**基础设施服务**转换为生命周期系统。管理资源、需要有序初始化或需要清理的服务属于此处。无状态业务逻辑服务（存储库、数据访问层）应保持为简单的单例 — 请参阅[决策指南](./lifecycle-decision-guide.md)。

## 你会遇到的旧模式

### 模式A：手动单例

```typescript
// OLD — manual singleton + exported instance
class MainWindowService {
  private static instance: MainWindowService | null = null

  public static getInstance(): MainWindowService {
    if (!MainWindowService.instance) {
      MainWindowService.instance = new MainWindowService()
    }
    return MainWindowService.instance
  }

  init() { /* ... */ }
  destroy() { /* ... */ }
}

export const windowService = MainWindowService.getInstance()
```

### 模式 B：原始 `new` 导出

```typescript
// OLD — instantiated on import, init called manually
class ThemeService {
  init() { /* ... */ }
}

export const themeService = new ThemeService()
```

### 模式 C：自由函数

```typescript
// OLD — module-scoped state + exported function
let accelerator: string | null = null

export function registerShortcuts(mainWindow: BrowserWindow) { /* ... */ }
```

## 逐步迁移

### 第1步：扩展BaseService并添加装饰器

替换类定义。删除 `static instance`、`getInstance()` 和 __PH2__/__PH3__ — 生命周期系统会处理所有这些。

```typescript
// NEW
import { BaseService, Injectable, ServicePhase, DependsOn, Phase } from '@main/core/lifecycle'

@Injectable('MainWindowService')
@ServicePhase(Phase.WhenReady)          // needs Electron API → WhenReady
@DependsOn(['PreferenceService'])       // reads preferences on startup
export class MainWindowService extends BaseService {
  protected async onInit() {
    // ← what was in init() / constructor logic
  }

  protected async onStop() {
    // ← what was in destroy() / cleanup
  }
}
```

**选择正确的相：** 请参阅[相选择指南](./lifecycle-overview.md#phase-selection-guide)。

**选择错误策略：**

|战略|何时使用|
| ----------- | ----------------------------------------------- |
|`graceful`|应用程序可以在没有此服务的情况下运行（默认）|
|`fail-fast`|应用程序无法运行（数据库、核心配置）|

### 第 2 步：删除单例样板

删除所有这些：

```typescript
// DELETE all of the following
private static instance: MainWindowService | null = null

public static getInstance(): MainWindowService { ... }

// DELETE the exported instance
export const windowService = MainWindowService.getInstance()
// or
export const windowService = new MainWindowService()
```

生命周期容器自动创建和管理单例。

### 第3步：在serviceRegistry.ts中注册

```typescript
// src/main/core/application/serviceRegistry.ts
import { MainWindowService } from '@main/services/MainWindowService'

export const services = {
  // ...existing
  MainWindowService,      // ← one line
} as const
```

### 第 4 步：替换所有导入站点

查找导入旧单例的每个文件并更新：

```typescript
// OLD
import { windowService } from '@main/services/MainWindowService'
windowService.createMainWindow()

// NEW
import { application } from '@application'
const windowService = application.get('MainWindowService')
windowService.createMainWindow()
```

> **有条件服务**：如果迁移的服务使用 `@Conditional`，请将导入站点处的 `application.get()` 调用替换为 `application.getOptional()`：
> ```打字稿
> 常量菜单服务 = application.__PH0__
> 菜单服务？.buildMenu()
> ```

### 步骤 5：将依赖项替换为 `@DependsOn`

如果旧服务在顶层导入了其他服务单例，请将它们转换为 `@DependsOn` 并通过 `application.get()` 内部方法访问它们：

```typescript
// OLD — tight coupling via top-level import
import { windowService } from './MainWindowService'

class TrayService {
  init() {
    windowService.show()
  }
}

// NEW — loose coupling via lifecycle
@Injectable('TrayService')
@DependsOn(['MainWindowService'])
export class TrayService extends BaseService {
  protected async onInit() {
    const windowService = application.get('MainWindowService')
    windowService.show()
  }
}
```

### 步骤 6：从 main.ts 删除手动 init/destroy 调用

迁移完成后，删除`src/main/main.ts`中的手动调用：

```typescript
// DELETE from index.ts
themeService.init()
windowService.createMainWindow()
new TrayService()
nodeTraceService.init()
analyticsService.init()
```

生命周期系统在 `application.bootstrap()` 期间以正确的顺序自动调用 `onInit()`。

### 步骤 7：将免费功能迁移到服务类

对于模式 C（具有模块状态的自由函数），将它们包装在服务中：

```typescript
// OLD
let accelerator: string | null = null
export function registerShortcuts(mainWindow: BrowserWindow) { ... }

// NEW
@Injectable('ShortcutService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['MainWindowService', 'PreferenceService'])
export class ShortcutService extends BaseService {
  private accelerator: string | null = null

  protected async onInit() {
    this.registerShortcuts()
  }

  protected async onStop() {
    globalShortcut.unregisterAll()
  }

  private registerShortcuts() { /* ... */ }
}
```

### 步骤 8：将 IPC 处理程序迁移到 BaseService 跟踪

如果您的服务注册了 `ipcMain.handle()` 或 `ipcMain.on()` 调用，请将它们替换为 `this.ipcHandle()` / `this.ipcOn()` 并删除手动取消注册方法：

```typescript
// OLD — channel appears twice (register + unregister)
private registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.MyService_Action, (_, arg) => this.doAction(arg))
}
private unregisterIpcHandlers(): void {
  ipcMain.removeHandler(IpcChannel.MyService_Action)
}

// NEW — auto-tracked, cleanup is automatic
private registerIpcHandlers(): void {
  this.ipcHandle(IpcChannel.MyService_Action, (_, arg) => this.doAction(arg))
}
// DELETE unregisterIpcHandlers() entirely
```

从 `onStop()` 中删除 `unregisterIpcHandlers()` 方法及其调用。 BaseService 在 `onStop()` 返回后自动清理所有跟踪的处理程序。

> **提示**：`ipcHandle()` 和 `ipcOn()` 现在返回 `Disposable`，允许在需要时手动提前取消注册（e.g.、`const d = this.ipcHandle(...); d.dispose()`）。对于大多数服务，停止时自动清理就足够了。

**迁移警告**：使用 `ipcMain.removeAllListeners(channel)`（e.g.、CacheService）的服务需要仔细审查 — `this.ipcOn()` 跟踪特定侦听器并使用 `removeListener()`，而不是 `removeAllListeners()`。如果其他代码也在同一通道上侦听，则这是正确的行为；如果目的是删除所有侦听器，请验证迁移不会留下孤立侦听器。

### 步骤 8b：将循环计时器迁移到 `registerInterval`

将生命周期范围的 `setInterval()` 替换为 `this.registerInterval()` — 通过一次性通道处理 `unref()`、异常隔离和清理。

```typescript
// OLD
private gcInterval: NodeJS.Timeout | null = null
protected async onStop() {
  if (this.gcInterval) { clearInterval(this.gcInterval); this.gcInterval = null }
}
private startGc() {
  if (this.gcInterval) return
  this.gcInterval = setInterval(() => this.gc(), 60_000)
  this.gcInterval.unref()
}

// NEW
private gcInterval: Disposable | null = null
protected async onStop() {
  this.gcInterval = null // auto-disposed; null'd so restart re-arms
}
private startGc() {
  if (this.gcInterval) return
  this.gcInterval = this.registerInterval(() => this.gc(), 60_000)
}
```

如果该字段从未被读取（e.g.，从 `onInit` 中即发即弃），则完全删除它。

**不要迁移**：一次性 `setTimeout` （去抖）、连接范围的心跳（Discord/Slack/QQ 适配器）、`Activatable` 服务中的激活范围的计时器。

## Before/After 摘要

|方面|前|后|
| -------------- | ------------------------------------------- | -------------------------------------------- |
|辛格尔顿|`private static instance` + `getInstance()`|`@Injectable('Name')` — 容器管理它|
|初始化|从 `index.ts` 调用手册 `init()`|`onInit()` — 自动调用|
|清理|在 `will-quit` / `before-quit` 处理程序中手动清理|`onStop()` / `onDestroy()` — 自动|
|依赖关系|`import { otherService } from '...'`|`@DependsOn([...])` + `application.get()`|
|使用权|`import { myService } from '...'`|`application.get('MyService')`|
|订购|`index.ts` 中的手动调用顺序|`@ServicePhase` + `@DependsOn` + `@Priority`|
|错误处理|try/catch 在 `index.ts` 中|`@ErrorHandling('快速失败' \|‘优雅’)`|
|IPC 处理程序|手册 `ipcMain.handle()` + `removeHandler()`|`this.ipcHandle()` — 停止时自动清理|
|循环定时器|手动 `setInterval()` + `clearInterval()` + `unref()`|`this.registerInterval()` — 自动清理、自动取消引用、异常隔离|

### 步骤 9：将临时事件通信迁移到 Emitter/Event

如果旧服务使用 `app.emit()` / `app.on()` 或自定义 EventEmitter 模式进行服务间通信，请将它们替换为类型化的 `Emitter<T>` / `Event<T>`：

```typescript
// OLD — ad-hoc event on Electron's app object
// Producer:
app.emit('main-window-created', this.mainWindow)
// Consumer:
;(app as NodeJS.EventEmitter).on('main-window-created', (event, window) => { ... })
// Manual cleanup in onStop():
;(app as NodeJS.EventEmitter).off('main-window-created', this.handler)

// NEW — typed Emitter/Event
// Producer:
private readonly _onMainWindowCreated = new Emitter<BrowserWindow>()
public readonly onMainWindowCreated: Event<BrowserWindow> = this._onMainWindowCreated.event
// Fire:
this._onMainWindowCreated.fire(this.mainWindow)

// Consumer:
this.registerDisposable(
  windowService.onMainWindowCreated((window) => { ... })
)
// No manual cleanup needed — registerDisposable handles it
```

有关完整模式，请参阅[服务事件](./lifecycle-usage.md#service-events-emitter--event)。

## 常见陷阱

1. **构造函数副作用** - 旧服务通常在构造函数中工作（事件侦听器、计时器）。将所有副作用移至 `onInit()`。构造函数应该只分配默认值。

2. **顶级 `application.get()` 调用** — `application.get()` 仅在服务注册且引导启动后才起作用。切勿在模块范围内调用它：

    ```typescript
    // ✗ BAD — runs at import time, before bootstrap
    const preferenceService = application.get('PreferenceService')

    @Injectable('MyService')
    export class MyService extends BaseService {
      // ✓ GOOD — runs during bootstrap, dependencies are ready
      protected async onInit() {
        const preferenceService = application.get('PreferenceService')
      }
    }
    ```

3. **循环依赖** — 如果 ServiceA 依赖于 ServiceB，反之亦然，请重构，以便非关键方向使用 `onAllReady()` 而不是 `@DependsOn`：

    ```typescript
    @Injectable('ServiceA')
    @DependsOn(['ServiceB'])          // ← hard dependency
    export class ServiceA extends BaseService { ... }

    @Injectable('ServiceB')
    // No @DependsOn on ServiceA — would be circular
    export class ServiceB extends BaseService {
      protected onAllReady() {
        // Safe to access ServiceA here — all services are ready
        const a = application.get('ServiceA')
      }
    }
    ```

4. **忘记删除旧导出** — 迁移后，在代码库中 grep 查找旧导出名称（e.g.、`windowService`）。任何剩余的导入都会在运行时中断。
