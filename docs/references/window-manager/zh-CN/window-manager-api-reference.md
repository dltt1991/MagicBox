# WindowManager API 参考

`WindowManager` 的完整方法参考。有关每个组的概念指导和何时使用，请参阅[使用指南](./window-manager-usage.md)。

## 打开/创建/关闭

两层：**消费者**方法是通用API，应该被所有业务代码使用。 **内部**方法是用于防御断言或池范围关闭的较低级别原语 - 消费者代码不应触及它们。请参阅[Window API 层：消费者与内部](./window-manager-usage.md#window-api-layers-consumer-vs-internal)。

|方法|层|签名|描述|
|--------|-------|-----------|-------------|
|`open`|**消费者**|`(type: WindowType, args?: OpenWindowArgs) => string`|生命周期感知开放：单例重用、池回收或每个注册表 `生命周期` 全新创建。返回窗口 ID。|
|`close`|**消费者**|`(windowId: string) => boolean`|生命周期感知版本：销毁 `default` 和单例无配置窗口；将池化/带保留的单例窗口隐藏到预热状态机中（GC 会销毁每个配置）。|
|`create`|内部的|`(type: WindowType, args?: OpenWindowArgs) => string`|强制新鲜创造；如果该类型的单例已经存在，则抛出异常。仅用作防御性断言 - 消费者代码应使用 `open()` + `onWindowCreatedByType` 代替。|
|`destroy`|内部的|`(windowId: string) => boolean`|通过 `window.destroy()` 强制销毁，这会跳过 `close` 事件，因此跳过池的 `close` 拦截，绕过池回收。非池化窗口：与 `close()` 相同。池化窗口：使用 `suspendPool(type)` 进行池范围内的关闭，而不是销毁各个池化窗口。|

## 窗口操作

|方法|签名|描述|
|--------|-----------|-------------|
|`show`|`(windowId: string) => boolean`|显示一个窗口。不会更改 macOS Dock 状态 - Dock 跟踪窗口存在 + 每个类型的覆盖，而不是可见性（与本机 macOS 匹配：Cmd+W 隐藏窗口不会从 Dock 中删除应用程序）。|
|`hide`|`(windowId: string) => boolean`|隐藏一个窗口。不会更改 macOS Dock 状态 — 原因与 `show` 相同。如果呼叫者希望 Dock 也消失（托盘模式 UX），请在 `hide` 之前使用 `wm.behavior.setMacShowInDockByType`。|
|`minimize`|`(windowId: string) => boolean`|最小化一个窗口。|
|`maximize`|`(windowId: string) => boolean`|切换 maximize/unmaximize.|
|`restore`|`(windowId: string) => boolean`|恢复最小化窗口。|
|`focus`|`(windowId: string) => boolean`|聚焦一个窗口。|

## 行为运行时设置器

这些在每个实例的声明性 `behavior` 层上运行，并在 `wm.behavior` （一个 `BehaviorController` 实例）上公开。有关字段语义，请参阅[平台配置 → 声明性行为层](./window-manager-platform.md#declarative-behavior-layer)。

|方法|签名|描述|
|--------|-----------|-------------|
|`wm.behavior.setHideOnBlur`|`(windowId: string, enabled: boolean) => void`|在运行时覆盖声明的 `behavior.hideOnBlur` 。 `enabled: true` 保持自动隐藏； `enabled: false` 抑制（有效地“固定”）。当窗口类型未声明 `behavior.hideOnBlur` （没有要覆盖的侦听器）时，无操作。覆盖在窗口销毁和池 `releaseToPool` 上被清除。|
|`wm.behavior.setAlwaysOnTop`|`(windowId: string, enabled: boolean) => void`|使用 `behavior.alwaysOnTop` 中的 `level` / `relativeLevel` （单一事实来源）切换始终在顶部。当两者都没有声明时，`setAlwaysOnTop(enabled)` 会被无级别地调用——与 Electron 的默认值匹配。|
|`wm.behavior.setMacShowInDockByType`|`(type: WindowType, value: boolean) => void`|在运行时覆盖整个类型的 `behavior.macShowInDock` 。用它来表达“应用程序正在进入/离开托盘模式”：`(Main, false)` before `window.hide()` 让 Dock 跟踪转换； `(Main, true)` 在 `window.show()` 解除抑制之前。按类型（不是 windowId）键入，因此可以在第一个实例存在之前设置它（e.g.tray-on-launch 路径）。当多个窗口类型贡献时（e.g.Main + SubWindow），只要任何贡献类型处于活动状态，Dock 就会保持可见 - 如果子窗口仍然存在，`wm.behavior.setMacShowInDockByType(Main, false)` 将不会隐藏 Dock。|

> 没有提供 WM 级别的 `setVisibleOnAllWorkspaces`：其选项在实际使用中每次调用都不同（e.g.SelectionAction 的全屏显示序列），并且 WM 没有要维护的状态。消费者直接在 `BrowserWindow` 实例上调用 `window.setVisibleOnAllWorkspaces(enabled, options)` 。有关决策规则，请参阅 [README → 何时提供运行时 Setter](./README.md#when-to-provide-a-runtime-setter)。

## 界限持久性

声明性 `rememberBounds` 功能的顶级原语（仅限单例）。这些是 WindowManager 方法，**不是** `wm.behavior` 的一部分。请参阅[自述文件 → 边界持久性](./README.md#bounds-persistence)。

|方法|签名|描述|
|--------|-----------|-------------|
|`setRememberBounds`|`(type: WindowType, enabled: boolean) => void`|`rememberBounds` 功能的运行时切换，与注册表标志正交。 `true` 在拆卸时保留 position/size 并在下次打开时恢复； `false` 停止持久化并立即删除保存的记录，因此下次打开时将使用注册表默认值。影响下次打开时的恢复；实时窗口保持其几何形状。|
|`peekWindowBounds`|`（类型：WindowType）=> WindowBoundsState \|未定义`|读取类型的已保存边界而不恢复它们。让消费者应用 WindowManager 不支持的状态 — e.g。 MainWindowService 在其自己的显示时间表上重新应用保存的最大化标志。 `undefined` 当没有保存任何内容时。|

## 查询

命名约定：名称中带有 `Info` 的方法返回可序列化的 `WindowInfo` 快照（跨 IPC 安全）；没有它的方法返回实时 `BrowserWindow` 实例。

|方法|签名|描述|
|--------|-----------|-------------|
|`getWindow`|`(windowId: string) => BrowserWindow \|未定义`|通过 ID 获取 BrowserWindow 实例。|
|`getWindowInfo`|`(windowId: string) => WindowInfo \|未定义`|获取可序列化的窗口元数据。|
|`getWindowType`|`(windowId: string) => WindowType \|未定义`|通过 ID 获取窗口的注册类型（O(1)；如果 unknown/closed 则为未定义）。|
|`getWindowsByType`|`(type: WindowType) => BrowserWindow[]`|获取特定类型的所有活动窗口实例（跳过销毁）。|
|`getWindowInfosByType`|`(type: WindowType) => WindowInfo[]`|获取特定类型的所有窗口的可序列化元数据。|
|`getWindowId`|`（窗口：BrowserWindow）=>字符串\|未定义`|从 BrowserWindow 解析窗口 ID。|
|`getWindowIdByWebContents`|`(wc: WebContents) => 字符串 \|未定义`|从 WebContents 解析窗口 ID（e.g.、IPC `event.sender`）。|
|`count`|`(getter)`|受管理窗口的数量。|

## 播送

|方法|签名|描述|
|--------|-----------|-------------|
|`broadcast`|`(channel: string, ...args: unknown[]) => void`|发送 IPC 到所有托管窗口。跳过被毁坏的窗户。|
|`broadcastToType`|`(type: WindowType, channel: string, ...args: unknown[]) => void`|向特定类型的窗口发送IPC。|

## 初始化数据

|方法|签名|描述|
|--------|-----------|-------------|
|`open<T>`|`(type: WindowType, args?: { initData?: T, options?: Partial<WindowOptions> }) => string`|当提供 `args.initData` 时，在方法返回之前以原子方式写入存储；还作为重用路径上的 `WindowManager_Reused` 有效负载推送到渲染器。|
|`create<T>`|`(type: WindowType, args?: { initData?: T, options?: Partial<WindowOptions> }) => string`|与 `open` 相同的原子性，但从不触发 `Reused` （所有创建路径都是新创建的）。|
|`setInitData`|`(windowId: string, data: unknown) => void`|低级原语。在新代码中首选 `open/create` args 形式。|
|`getInitData`|`(windowId: string) => 未知 \|空`|检索初始化数据。池释放时清除；保存在单例隐藏上。|
|`pushInitData<T>`|`(windowId: string, data: T) => boolean`|将新的初始化数据推送到已经打开的窗口。一步写入存储并触发 `WindowManager_Reused`。如果窗口丢失或损坏，则返回 `false`。仅主进程。|
|`pushInitDataToType<T>`|`(type: WindowType, data: T) => number`|与 `pushInitData` 相同，但扇出到给定类型的每个实时窗口。返回接收该事件的窗口数。不按可见性进行过滤 - 空闲池窗口也会接收有效负载。|

**计时合同：**

- **冷启动**（全新创建）：`createWindow` 在返回之前将 `initData` 同步写入存储，因此来自渲染器的任何 `getInitData` 调用（React 安装后）都会看到新值。渲染器应该使用 [`useWindowInitData` 钩子](./window-manager-usage.md#渲染进程-usewindowinitdata-hook) — 它自动处理挂载时的调用。
- **重用**（池回收/单例重新打开）：`open()` 同时写入存储并使用相同的有效负载触发 `WindowManager_Reused`。 `useWindowInitData` 钩子直接从事件负载更新其状态 - 没有往返。
- **重用调用上没有 initData**：事件不会被触发。没有“空重用”事件 - 因此钩子永远不需要回退调用。
- **实时更新**（已打开的窗口）：从任何主进程服务调用 `pushInitData` / `pushInitDataToType` 。两条路径都重用 `WindowManager_Reused` 通道，因此 `useWindowInitData` 无需重新安装即可就地获取新的有效负载 - 对于“交换可见窗口的上下文而不会出现 `close()`+`open()` 闪烁”非常有用。与重用不同，这些方法禁止 `undefined` 有效负载：推送任何内容在这里没有任何有意义的语义。

`webContents.send` 是即发即弃的，不会缓冲渲染器注册侦听器之前发送的消息。这正是新窗口不能使用 PUSH 的原因 - 它们仍然必须在挂载时通过 `getInitData` 进行 PULL。

## 矿池管理

|方法|签名|描述|
|--------|-----------|-------------|
|`suspendPool`|`(type: WindowType) => number`|挂起池：销毁空闲窗口，禁用池跟踪。返回已销毁的计数。|
|`resumePool`|`(type: WindowType) => void`|恢复池：恢复生命周期行为，如果配置，则触发急切预热。|

有关暂停时的语义，请参阅[暂停/恢复](./window-manager-warmup-mechanics.md#suspend--resume)。

## 标题栏

|方法|签名|描述|
|--------|-----------|-------------|
|`setTitleBarOverlay`|`(options: TitleBarOverlayOptions) => void`|更新所有已配置覆盖的窗口上的标题栏覆盖。|

## 渲染器 IPC 表面

以上所有方法都是主进程API。 WindowManager 还公开一个 IPC 表面，以便渲染器可以自行驱动窗口操作。通道常量位于 `src/shared/IpcChannel.ts` 中；处理程序在 `WindowManager.registerIpcHandlers()` 中注册。

预加载仅将 `getInitData` 包装为 `window.api.windowManager.getInitData()`。其他通道直接通过 `window.electron.ipcRenderer.invoke(IpcChannel.WindowManager_*, ...)` 调用。 `WindowManager_Reused` 是一个仅推送通道（主 → 渲染器）——参见 [预热机制 → `WindowManager_Reused` IPC](./window-manager-warmup-mechanics.md#windowmanager_reused-ipc)。

|渠道|方向|参数|影响|
|---|---|---|---|
|`WindowManager_Open`|渲染器→主|`(type, initData?)`|`wm.open(type, { initData })`。返回窗口 ID。如果 `type` 未注册，则抛出异常。|
|`WindowManager_GetInitData`|渲染器→主| — |`wm.getInitData(senderWindowId)`。返回存储的初始化数据或 `null`。|
|`WindowManager_Close`|渲染器→主|`(type?)`|`wm.close(resolveTargetWindowId(sender, type))`。返回布尔值。|
|`WindowManager_Show`|渲染器→主|`(type?)`|`wm.show(...)`。|
|`WindowManager_Hide`|渲染器→主|`(type?)`|`wm.hide(...)`。|
|`WindowManager_Minimize`|渲染器→主|`(type?)`|`wm.minimize(...)`。|
|`WindowManager_Maximize`|渲染器→主|`(type?)`|`wm.maximize(...)`。|
|`WindowManager_Focus`|渲染器→主|`(type?)`|`wm.focus(...)`。|
|`WindowManager_Reused`|主 → 渲染器（推送）|`(payload)`|当调用者提供 `initData` 时，在池回收或单例重新打开时触发。|

**可选 `type` 参数的目标分辨率**（关闭/显示/隐藏/最小化/最大化/聚焦）：

- **无 `type`**：目标是发送者自己的窗口，通过 `getWindowIdByWebContents(event.sender)` 解析。这是常见的情况——窗口自行作用。
- **对于 `type`**：目标必须是 **单例** — 该类型的第一个（也是唯一的）窗口。对于通过 IPC 的跨窗口定位，**不支持** `default` 和 `pooled` 生命周期；该调用默默地返回 `false` 并且该操作是无操作。

`Reused` 的裸渲染器消耗模式使用 `ipcRenderer.on(IpcChannel.WindowManager_Reused, ...)` — 但大多数渲染器代码应该更喜欢 [`useWindowInitData` 钩子](./window-manager-usage.md#渲染进程-usewindowinitdata-hook)，它封装了冷启动 `getInitData` 调用和重用有效负载传递。

## 活动

池化窗口遍历四个阶段的概念生命周期，但只有端点具有专用事件：

```
Created ──▶ [Released ──▶ Recycled ──▶ Released ──▶ ...] ──▶ Destroyed
```

对于非池化窗口，应用相同的两个端点，无需任何中间阶段。

|事件|类型|描述|
|-------|------|-------------|
|`onWindowCreated`|`Event<ManagedWindow>`|创建新窗口时（内容加载之前）触发。新鲜路径仅适用于池化窗口。|
|`onWindowDestroyed`|`Event<ManagedWindow>`|当窗口真正被销毁时触发（不是在池释放时触发）。|
|`onWindowCreatedByType(type, listener)`|`(type, listener) => Disposable`|`onWindowCreated` 的便捷变体，可过滤为单个 `WindowType`。相当于 `onWindowCreated` + 内联 `if (managed.type === type)` 保护，但避免了每个调用站点的样板。对于单一类型的订阅（典型的消费者案例）更喜欢这种方式。|
|`onWindowDestroyedByType(type, listener)`|`(type, listener) => Disposable`|与 `onWindowDestroyed` 相对应的类型过滤。与 `onWindowCreatedByType` 相同的过滤语义。|

中间的 Released 和 Recycled 阶段没有专用事件 - 对 `hide` / `close` / `show` 的副作用应表示为声明性 [平台怪癖](./window-manager-platform.md#platform-quirks)，并且每个会话的回收数据通过 `WindowManager_Reused` IPC 有效负载传递（请参阅 [初始化数据](#init-data)）。

**池化窗口的使用说明：**

- **请勿在池化窗口上设置 `paintWhenInitiallyHidden: false`** — 它会抑制本机 `ready-to-show` 事件，从而破坏池的新窗口自动显示路径（`showMode === 'auto'` 侦听 `ready-to-show`）。对于“仅在内容准备好时显示”来说，这不是可接受的解决方法 - 使用 `showMode: 'manual'` + 消费者驱动的显示，或者依赖重用路径 `Reused` 有效负载来确保渲染器在调用 `.show()` 之前拥有数据。
- **macOS 焦点/悬停/始终在顶部的解决方法**是声明性的 - 请参阅[平台怪癖](./window-manager-platform.md#platform-quirks)。
