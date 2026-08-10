# 窗口管理器概述

WindowManager 的体系结构、生命周期模式和事件计时契约。

WindowManager 是在生命周期系统中注册的 `@Injectable()` 服务（`Phase.WhenReady`，优先级 5）。窗口配置位于 `windowRegistry.ts` 中； WindowManager 在运行时使用它们。

## 核心类型关系

```
WindowType (enum)
  └─ WindowTypeMetadata (discriminated union on `lifecycle`)
       ├─ { lifecycle: 'default' }
       ├─ { lifecycle: 'singleton', singletonConfig?: SingletonConfig }
       └─ { lifecycle: 'pooled', poolConfig: PoolConfig }

WindowManager
  ├─ windows: Map<windowId, ManagedWindow>            ── all tracked windows
  ├─ windowsByType: Map<WindowType, Set<windowId>>    ── type index
  ├─ warmupStates: Map<WindowType, WarmupState>       ── per-type warmup state (pool + singleton)
  └─ initDataStore: Map<windowId, unknown>            ── one-shot init data
```

## 三种生命周期模式

```
┌────────── open() ──────────┐
│                             │
│   ┌─────────────────────┐   │
│   │  lifecycle check    │   │
│   └────────┬────────────┘   │
│       ┌────┼────┐           │
│       ▼    ▼    ▼           │
│   default  singleton  pooled│
│     │        │          │   │
│     │     existing?  idle?  │
│     │     ┌──┴──┐  ┌──┴──┐ │
│     │     Y     N  Y     N │
│     │     │     │  │     │  │
│     │  show()   │ recycle │ │
│     │  focus()  │  │     │  │
│     │     │     ▼  │     ▼  │
│     └─────┼─ create() ──┘  │
│           │     │           │
│           ▼     ▼           │
│      return windowId        │
└─────────────────────────────┘
```

### `default` — 打开时创建，关闭时销毁

多实例模式。每个 `open()` 调用都会创建一个新窗口。 `close()` 永久摧毁它。

**用于**：同时出现多次的窗口（e.g.，子窗口）。

```typescript
// windowRegistry.ts
WINDOW_TYPE_REGISTRY[WindowType.SubWindow] = {
  type: WindowType.SubWindow,
  lifecycle: 'default',
  htmlPath: 'sub-window.html',
  windowOptions: { ...DEFAULT_WINDOW_CONFIG },
}

// Usage — each call creates a new window
const tab1 = wm.open(WindowType.SubWindow)
const tab2 = wm.open(WindowType.SubWindow)
wm.close(tab1) // destroyed
```

### `singleton` — 最多一个实例，打开时重用

一次只能存在一个实例。 `open()` 显示并聚焦现有窗口（如果存在）；如果不存在则创建一个。如果 `create()` 已经存在，则抛出异常。

**用于**：不应该有重复项的窗口（e.g.、主窗口、设置）。

```typescript
WINDOW_TYPE_REGISTRY[WindowType.Main] = {
  type: WindowType.Main,
  lifecycle: 'singleton',
  htmlPath: 'index.html',
  windowOptions: { ...DEFAULT_WINDOW_CONFIG, minWidth: 350, minHeight: 400 },
}

// First call creates; second call shows + focuses the existing window
const id1 = wm.open(WindowType.Main) // creates
const id2 = wm.open(WindowType.Main) // shows + focuses, id2 === id1
```

**可选`singletonConfig`**：启用急切预热and/or关闭→隐藏并延迟销毁。请参阅[预热机制 → 单例变体](./window-manager-warmup-mechanics.md#singleton-variant)。

### `pooled` — 具有主动待机 + 被动回收功能的两轴泳池

窗户被重复使用而不是被销毁。池有两个正交轴：

1. **生产者轴 (`standbySize`)：** 预热的备件始终保留在空闲队列中，并通过 `setImmediate` 在每个 `open()` 上主动补充。无论并发使用情况如何，都保证下一个调用者的零等待。
2. **消费者轴（`recycleMinSize` / `recycleMaxSize`）：** 在 `close()` 上，窗口被推回到空闲队列（以 `recycleMaxSize` 为界）以供重用。 `recycleMinSize` 是一种被动腐烂地板。

两个轴均通过配置独立启用。 `open()` 弹出一个空闲窗口（当提供 `initData` 时触发 `WindowManager_Reused` IPC）或创建新窗口（如果为空）。 `close()` 根据回收配置回收或销毁。

**用于**：创建成本较高的频繁打开的窗口（选择操作、屏幕截图覆盖）。

```typescript
// Example: SelectionAction — hybrid (standby + recycle).
WINDOW_TYPE_REGISTRY[WindowType.SelectionAction] = {
  type: WindowType.SelectionAction,
  lifecycle: 'pooled',
  htmlPath: 'selectionAction.html',
  poolConfig: {
    standbySize: 1,          // always keep 1 pre-warmed spare
    recycleMaxSize: 3,       // recycle up to 3 windows for burst handling
    decayInterval: 60,       // decay one excess idle per minute
    inactivityTimeout: 300,  // after 5min idle, trim back to standbySize
    warmup: 'eager'
  },
  windowOptions: { ...DEFAULT_WINDOW_CONFIG, width: 400, height: 300 },
}
```

有关完整池配置矩阵、GC 计时器行为、预热策略和 suspend/resume 语义，请参阅[预热机制](./window-manager-warmup-mechanics.md)。请注意，不活动计时器会在 `open()` 和 `close()` 上重置（通过 `lastActivityAt`），因此长时间按住然后关闭的窗口不会立即触发修剪。

## 主要特点

|特征|描述|
|---------|-------------|
|生命周期模式|`default`、`singleton`、`pooled` — 涵盖所有窗口图案|
|窗口生命周期挂钩（`onWindowCreated` / `onWindowDestroyed`，加上类型过滤的 `onWindowCreatedByType` / `onWindowDestroyedByType`）|域服务在创建时注入行为，并通过类型化 `Emitter<ManagedWindow>` 事件在销毁时进行清理|
|`broadcast()` / `broadcastToType()`|IPC 扇出到所有窗口或类型过滤窗口|
|`open({ initData })` / `create({ initData })` / `setInitData()` / `getInitData()`|初始化有效负载以原子方式在 open/create 上传递；在重用路径上通过 `WindowManager_Reused` 自动推送到渲染器|
|`suspendPool()` / `resumePool()`|暂停池跟踪而不破坏正在使用的窗口|
|macOS Dock 可见性管理|基于存在：当任何具有 `behavior.macShowInDock !== false` 的窗口处于活动状态（未销毁）时，Dock 是可见的。服务通过 `wm.behavior.setMacShowInDockByType(type, value)` 表达托盘模式意图，暂时选择 Dock 贡献之外的类型。匹配本机 macOS 语义，其中 Cmd+W 不会从 Dock 中删除应用程序。|
|`setTitleBarOverlay()`|在所有适用的窗口上批量更新覆盖|
|边界持久性 (`rememberBounds`)|仅单例选择在启动时持久保存并恢复窗口的 position/size （到其最后一个显示），由主持久缓存支持。可通过 `wm.setRememberBounds` 运行时切换。请参阅[自述文件 → 边界持久性](./README.md#bounds-persistence)。|

## 赛事计时合同

`createWindow()` 方法遵循严格的 5 步执行顺序：

```
1. new BrowserWindow(config)        ── native window exists
2. setupWindowListeners()           ── close/closed/show/hide handlers attached
3. windows.set() / windowsByType    ── window is queryable
4. _onWindowCreated.fire()          ── domain services inject behavior (sync)
5. loadWindowContent()              ── HTML loads, ready-to-show may fire
```

### 为什么这个顺序很重要

- **第 2 步在第 4 步之前**：内部生命周期处理程序（池拦截、Dock 跟踪）在任何域代码运行之前就位。
- **第 3 步在第 4 步之前**：域服务可以在 `onWindowCreated` 回调中调用 `getWindow()`、`getWindowInfo()` 等。
- **第 4 步在第 5 步之前**：域服务可以附加 `ready-to-show`、`did-finish-load` 和其他内容相关侦听器，并保证内容尚未开始加载。

### 保证

- `onWindowCreated` 每个窗口同步触发一次。
- 当 `metadata.htmlPath` 为空时，将跳过内容加载（步骤 5）——域服务负责加载内容。
- 对于池化窗口， `onWindowCreated` 仅在新创建时触发 - 回收的打开不会重新触发，因为 BrowserWindow 已被创建和跟踪。因此，每个实例侦听器（e.g.`resized`、每个窗口 `closed` 清理）必须附加在 `onWindowCreated` 内，而不是附加在 `open()` 调用站点上，否则回收的窗口要么在第一次重用时错过侦听器，要么在连续打开时累积重复项。
