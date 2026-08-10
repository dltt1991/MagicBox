# 窗口平台配置

WindowManager 将每个窗口的配置分为三个正交层：

- **`windowOptions`** — Electron `BrowserWindow` 构造函数参数（包括针对每个操作系统的静态差异的 `platformOverrides`）。
- **`behavior`** — Electron 构造函数无法表达的跨平台声明性 WM 行为（模糊自动隐藏、`setAlwaysOnTop` 级别、`setVisibleOnAllWorkspaces` 选项、Dock 可见性）。请参阅[自述文件 → 配置层](./README.md#configuration-layers-windowoptions--behavior--quirks)。
- **`quirks`** — 通过 `hide()` / `show()` / `close()` 周围的方法槽猴子补丁应用特定于操作系统的黑客/解决方法。

命名规则：任何仅在一个平台上有效的字段都带有 `mac` / `win` / `linux` 前缀，无论层如何（e.g. `behavior.macShowInDock`, `quirks.macRestoreFocusOnHide`）。

## 操作系统怪癖

一些特定于操作系统的行为在每个调用站点都需要手动操作（e.g。macOS 焦点围绕 `hide()`）。 WindowManager 将它们作为 `WindowTypeMetadata.quirks` 下的**声明性选择加入标志**提供。设置后，管理器会透明地对相应的 `BrowserWindow` 实例方法进行猴子修补，以便业务代码继续像往常一样调用 `window.hide()` / `window.show()` 。

### 可用的怪癖

|怪癖|补丁|行为|
|---|---|---|
|`macRestoreFocusOnHide: boolean`|`hide()`，`close()`|在调用本机方法之前，迭代每个可见的可聚焦 `BrowserWindow` 和 `setFocusable(false)`； 50ms后恢复它们。当该窗口消失时，防止其他窗口被带到前面。|
|`macClearHoverOnHide: boolean`|`hide()`|调用本机 `hide()` 后，发送 `webContents.sendInputEvent({ type: 'mouseMove', x: -1, y: -1 })` 以清除任何残留的悬停状态。|
|`macReapplyAlwaysOnTop: boolean`|`show()`，`showInactive()`|调用本机方法后，使用从 `behavior.alwaysOnTop`（单一事实来源）读取的值调用 `setAlwaysOnTop(true, level, relativeLevel)`。当 `behavior.alwaysOnTop.level` 未设置时，回退到 `'floating'`。补偿 hide/show. 之间的 macOS 级别重置|

所有怪癖仅适用于 macOS：在其他平台上，方法保持不变，并且 `window.hide === originalHide` （保留身份）。

### 例子

```typescript
[WindowType.SelectionToolbar]: {
  type: WindowType.SelectionToolbar,
  lifecycle: 'singleton',
  showMode: 'manual',
  windowOptions: { /* ... */ },
  behavior: {
    hideOnBlur: true,
    alwaysOnTop: { level: 'screen-saver' },  // level lives here, not in quirks
    visibleOnAllWorkspaces: { enabled: true, visibleOnFullScreen: true },
    macShowInDock: false
  },
  quirks: {
    macRestoreFocusOnHide: true,
    macClearHoverOnHide: true,
    macReapplyAlwaysOnTop: true              // boolean switch; reads level from behavior above
  }
}
```

完成后，域服务中的 `this.toolbarWindow.hide()` 将：

1. 拍摄每个可见的可聚焦窗口并对它们调用 `setFocusable(false)` 。
2. 调用本机 `hide()`。
3. 发送合成 `mouseMove(-1, -1)` 来清除悬停。
4. 安排 50 毫秒后对快照进行 `setFocusable(true)` 恢复。

域服务不携带任何此类代码。

### 实施说明

- `w.hide.bind(w)` 捕获正确绑定 `this` 的本机方法，因此 Electron 的 C++ 绑定继续看到真正的 `BrowserWindow`。
- EventEmitter 行为 (`.on('hide', ...)`, `.once('close', ...)`) 未受影响 - 怪癖仅修补方法槽，而不修补发射器接线。
- 怪癖在 `onWindowCreated` 和 *之后* `applyWindowBehavior` 火灾后运行。这种顺序意味着行为层的初始 setter 调用（e.g.第一个 `setAlwaysOnTop(true, level)`）不会触发猴子修补的 show/showInactive.
- 怪癖在创建时应用于每个窗口；没有运行时切换。

## 声明性行为层

`behavior` 捕获非 hacky、跨平台且超出 Electron 构造函数所需的配置。 WindowManager 通过 `applyWindowBehavior` （在 `src/main/core/window/behavior.ts` 中）将这些应用于窗口创建。

|场地|类型|它的作用|
|---|---|---|
|`hideOnBlur`|`boolean`|安装一个调用 `window.hide()` 的模糊监听器（通过 `wm.behavior.setHideOnBlur(id, enabled)` 进行可选的运行时覆盖）。|
|`alwaysOnTop`|`{ level?: AlwaysOnTopLevel, relativeLevel?: number }`|提供 `level` / `relativeLevel` 到 `setAlwaysOnTop` 调用 — 单一事实来源，阅读者：(1) 创建后的初始应用程序（当 `windowOptions.alwaysOnTop` 为 `true` 时），(2) `wm.behavior.setAlwaysOnTop(id, enabled)` 运行时调用，(3) `macReapplyAlwaysOnTop` 怪癖。|
|`visibleOnAllWorkspaces`|`{ enabled: boolean } & VisibleOnAllWorkspacesOptions`|创建时运行 `window.setVisibleOnAllWorkspaces(enabled, options)` 一次。每次调用 true/false 选项不同的 Windows 不应*声明此 (e.g.SelectionAction) — 相反，直接在 `BrowserWindow` 上驱动。|
|`macShowInDock`|`boolean`|仅 macOS 默认设置此类型的窗口是否有助于 Dock 可见性（如果任何活动窗口都有贡献，则显示 Dock）。基于存在，而不是基于可见性：隐藏贡献窗口不会隐藏 Dock（Cmd+W 语义）。省略时，默认为 `true`。 `false` 用于辅助窗口（浮动面板、菜单栏样式覆盖），永远不应该影响 Dock。通过 `wm.behavior.setMacShowInDockByType(type, value)` 运行时覆盖 — 在 `window.hide()` 之前将其设置为 `false` 以进入托盘模式，在 `window.show()` 之前将其设置为 `true` 以离开。 Windows/Linux. 上无操作|

### 运行时设置器

行为层的运行时设置器位于 `wm.behavior`（在 `src/main/core/window/behavior.ts` 中定义的 `BehaviorController` 实例）上。将它们分组在此子命名空间下反映了 API 表面的三层 `windowOptions` / `behavior` / `quirks` 分割。

|塞特|目的|
|---|---|
|`wm.behavior.setHideOnBlur(id, enabled)`|覆盖每个实例声明的 `behavior.hideOnBlur` 。在销毁和池 `releaseToPool` 上清除 - 需要非默认值的池使用者必须在 `open()` / 重用后重新申请。当窗口未声明 `behavior.hideOnBlur` 时无操作。|
|`wm.behavior.setAlwaysOnTop(id, enabled)`|使用 `behavior.alwaysOnTop` 中声明的 `level` / `relativeLevel` 切换始终在顶部。如果两者均未声明，则调用无级别的 `setAlwaysOnTop(enabled)`。|
|`wm.behavior.setMacShowInDockByType(type, value)`|为整个窗口类型（而不是单个实例）覆盖 `behavior.macShowInDock`。用于应用程序级托盘模式转换：`(Main, false)` 然后 `hide()` 向下拉 Dock 图标； `(Main, true)` 然后 `show()` 将其带回来。按类型键入，因此可以在第一个实例存在之前进行设置（启动时托盘）。多窗口安全：`Main + SubWindow` 都起作用，当任何子窗口处于活动状态时，单独的 `wm.behavior.setMacShowInDockByType(Main, false)` 不会隐藏 Dock。|

`setVisibleOnAllWorkspaces` 故意没有** WM 级别的设置器 - 消费者在需要时直接在 `BrowserWindow` 上调用它。请参阅[自述文件 → 何时提供运行时设置器](./README.md#when-to-provide-a-runtime-setter)。

## 平台覆盖

每个操作系统不同的静态 `BrowserWindowConstructorOptions` 位于 `windowOptions.platformOverrides` 中。只有与当前运行时匹配的分支才会深度合并到最终配置中；不匹配的分支将被丢弃，并且 `platformOverrides` 字段本身在到达 `new BrowserWindow(...)` 之前被剥离。

```typescript
windowOptions: {
  width: 350, height: 43,
  frame: false, transparent: true,
  platformOverrides: {
    mac: { type: 'panel', hiddenInMissionControl: true, acceptFirstMouse: true },
    win: { type: 'toolbar', focusable: false },
    linux: { type: 'toolbar' } // focusable is set at runtime by the domain service
  },
  webPreferences: { /* ... */ }
}
```

在 `mergeWindowOptions` 内合并时的优先级（后来获胜）：

1. `baseOptions`（注册表 `windowOptions`）
2. `baseOptions.platformOverrides[currentPlatform]`
3. 调用者提供的 `overrides` （通过 `wm.open(type, { options })`）
4. 调用者提供的 `overrides.platformOverrides[currentPlatform]`

`webPreferences` 以相同的顺序进行深度合并。

## 何时使用哪一层

|情况|层|
|---|---|
|`BrowserWindow`构造函数可以直接接受它|`windowOptions`|
|只有操作系统的子集需要不同的静态值|`windowOptions.platformOverrides[mac/win/linux]`|
|跨平台、非 hacky 声明行为（模糊时自动隐藏、初始 `setAlwaysOnTop` 级别、停靠可见性、初始 `setVisibleOnAllWorkspaces`）|`behavior`|
|需要 hide/show/close 挂钩的操作系统特定错误解决方法|`quirks`|

这些层是可组合的：选择的工具栏使用所有三个（`windowOptions.platformOverrides` 用于静态每个操作系统差异，`behavior.hideOnBlur` / `behavior.alwaysOnTop` / `behavior.visibleOnAllWorkspaces` / `behavior.macShowInDock` 用于声明性行为，`quirks.*` 用于 macOS hide/show hack）。

## 电子边缘情况

- `setAlwaysOnTop(false, level)` — 当 `enabled` 为 false 时，Electron 会忽略 `level`。 WM `wm.behavior.setAlwaysOnTop(id, false)` 保留注册表声明的 `level` arg 仅用于签名对称性；效果是一样的。
- `VisibleOnAllWorkspacesOptions` — `visibleOnFullScreen` 和 `skipTransformProcessType` 在 Electron 中都记录为 `@platform darwin`。它们在 Windows / Linux 上被默默地忽略。
- **Linux Wayland“幻像弹出窗口”错误** — `setVisibleOnAllWorkspaces` 可以使 KDE Wayland 上的窗口进入损坏的“浮动弹出窗口”状态。请参阅 `MainWindowService.ts:573` 了解上下文。 WM 不干预；在 Linux 上使用 `behavior.visibleOnAllWorkspaces` 的消费者应该通过运行时显示协议检查来防范是否看到回归。
- **`Parameters<>` 类型派生** — `AlwaysOnTopLevel` 派生自 `Parameters<BrowserWindow['setAlwaysOnTop']>[1]`。如果 Electron 将方法重载添加到 `setAlwaysOnTop`，则此派生仅针对最后一个重载进行解析，并且可能会默默地缩小范围。 Electron升级后重新验证。
