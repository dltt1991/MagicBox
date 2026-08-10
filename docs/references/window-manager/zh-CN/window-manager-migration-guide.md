# 窗口迁移指南

如何将现有窗口从直接 `BrowserWindow` 创建迁移到 WindowManager。

## 第 1 步：添加窗口类型

在 `types.ts` 中，添加一个新的枚举值：

```typescript
export enum WindowType {
  // ...
  MyWindow = 'myWindow',
}
```

## 第2步：在windowRegistry.ts中注册

定义窗口的元数据和默认配置：

```typescript
WINDOW_TYPE_REGISTRY[WindowType.MyWindow] = {
  type: WindowType.MyWindow,
  lifecycle: 'singleton',       // or 'default' or 'pooled'
  htmlPath: 'my-window.html',
  // preload omitted → defaults to 'preload.js'. Write basename (with extension)
  // to select a different file in src/preload/. Empty string → no preload.
  // preload: 'simplest.js',
  showMode: 'auto',             // 'auto' | 'immediate' | 'manual'
  windowOptions: {
    ...DEFAULT_WINDOW_CONFIG,
    width: 800,
    height: 600,
  },
  behavior: {
    // Declarative WM-level behaviors (all optional). See the README "Configuration Layers" section.
    // hideOnBlur: true,                    // auto-hide on blur (runtime override: wm.behavior.setHideOnBlur)
    // alwaysOnTop: { level: 'floating' },  // level/relativeLevel for setAlwaysOnTop (runtime override: wm.behavior.setAlwaysOnTop)
    // visibleOnAllWorkspaces: { enabled: true, visibleOnFullScreen: true },
    // macShowInDock: false,                // do not contribute to Dock visibility (macOS helper windows only; default true)
    //                                      // runtime override: wm.behavior.setMacShowInDockByType(type, value) for tray-mode transitions
  },
  // quirks: { ... },                       // OS hacks — see Platform Configuration
}
```

请参阅[生命周期模式](./window-manager-overview.md#three-生命周期-modes) 在 `default` / `singleton` / `pooled` 之间进行选择。

可选：对于受益于预热或关闭→隐藏的单例类型，设置 `singletonConfig`。请参阅[预热机制 → 单例变体](./window-manager-warmup-mechanics.md#singleton-variant)。

## 步骤 3：将域逻辑移至 onWindowCreated

将直接 `new BrowserWindow()` + 设置代码替换为域服务中的 `onWindowCreated` 订阅：

**前：**

```typescript
class MyService {
  private window: BrowserWindow | null = null

  createWindow() {
    this.window = new BrowserWindow({ width: 800, height: 600, ... })
    this.window.loadFile('my-window.html')
    this.window.on('closed', () => { this.window = null })
  }
}
```

**后：**

```typescript
@Injectable('MyService')
@ServicePhase(Phase.WhenReady)
class MyService extends BaseService {
  private windowId: string | undefined

  protected override onInit(): void {
    const wm = application.get('WindowManager')

    wm.onWindowCreatedByType(WindowType.MyWindow, ({ window, id }) => {
      this.windowId = id
      // attach listeners here — use `window` directly, or switch to the `mw` shorthand
      // if the callback body has inner closures (see Usage Guide → Callback styles).
    })

    wm.onWindowDestroyedByType(WindowType.MyWindow, () => {
      this.windowId = undefined
    })
  }

  openWindow(): void {
    const wm = application.get('WindowManager')
    this.windowId = wm.open(WindowType.MyWindow)
  }
}
```

有关此模式背后的完整原理，请参阅[注入行为：`onWindowCreated` 是规范挂钩](./window-manager-usage.md#injecting-behavior-onwindowcreated-is-the-canonical-hook)。

## 步骤 4：替换直接的 BrowserWindow 引用

|旧模式|新模式|
|-------------|-------------|
|`this.window = new BrowserWindow(...)`|`wm.open(WindowType.MyWindow)`|
|`this.window.show()`|`wm.show(windowId)`|
|`this.window.hide()`|`wm.hide(windowId)`|
|`this.window.close()`|`wm.close(windowId)`|
|`this.window.webContents.send(...)`|`wm.getWindow(windowId)?.webContents.send(...)` 或 `wm.broadcastToType(...)`|
|`BrowserWindow.fromWebContents(e.sender)`|`wm.getWindowIdByWebContents(e.sender)`|

注意：故意没有 `this.window.destroy()` 条目。 `wm.close()` 已经处理非池化窗口的销毁和池化窗口的池返回。 `wm.destroy()` 是一个内部原语 - 请参阅[Window API 层](./window-manager-usage.md#window-api-layers-consumer-vs-internal)。

## 第 5 步：处理表演行为

如果使用 `showMode: 'auto'`（默认值），请删除手动 `show` / `ready-to-show` 逻辑。窗口管理器句柄：

- 创建隐藏窗口
- 显示在 `ready-to-show` （新鲜路径）或立即（回收路径）

如果您的窗口需要自定义显示时间，请在注册表中设置 `showMode: 'manual'` 并自行管理可见性。

## 清单

- [ ] 在 `types.ts` 中添加了 `WindowType` 枚举值
- [ ] 已在 `windowRegistry.ts` 的 `WINDOW_TYPE_REGISTRY` 中注册元数据
- [ ] 选择正确的生命周期模式 (`default` / `singleton` / `pooled`)
- [ ] 如果不使用默认值 (`'preload.js'`)，请设置 `preload` 文件名
- [ ] 设置 `showMode` 行为 (`'auto'` / `'immediate'` / `'manual'`)
- [ ] 仅针对帮助窗口（浮动面板、选择覆盖）设置 `behavior.macShowInDock: false`；主应用程序窗口将其保留为默认值 `true`。使用 `wm.behavior.setMacShowInDockByType(type, value)` 进行运行时托盘模式转换，而不是不同的注册表默认值。
- [ ] 根据需要声明 `behavior.hideOnBlur` / `behavior.alwaysOnTop` / `behavior.visibleOnAllWorkspaces`
- [ ] 将域逻辑从构造函数移至 `onWindowCreated` 挂钩
- [ ] 将直接 `BrowserWindow` 引用替换为 WindowManager API 调用
- [ ] 删除了手动 `ready-to-show` 处理（如果使用 `showMode: 'auto'`）
- [ ] 如果窗口消耗初始化数据：用`useWindowInitData`钩子替换手卷`getInitData` +重置IPC接线
- [ ] 如果合并：选择适当的 `PoolConfig` 轴（`standbySize` 用于主动预热，__PH2__/__PH3__ 用于回收）。为一次性“关闭破坏”语义保留 `recycleMaxSize` 未设置；当零等待在并发打开下很重要时，设置 `standbySize` 。
- [ ] 已验证域服务中的 `onWindowDestroyed` 清理
