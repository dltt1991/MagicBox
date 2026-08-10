# 窗口管理器参考

这是 Magic Box 的 WindowManager 文档的主要入口点。 WindowManager 是一个生命周期管理的服务，它创建、跟踪和重用 Electron `BrowserWindow` 实例，具有三种生命周期模式（默认/单例/池化）、IPC 广播、域服务事件挂钩和弹性池重用。

## 快速导航

### 系统概述（架构）

- [概述](./window-manager-overview.md) — 核心类型、三种生命周期模式、事件计时契约

### 使用指南（代码示例）

- [使用指南](./window-manager-usage.md) — 快速入门、领域服务集成模式、消费者与内部 API 分层、反模式、`useWindowInitData` 挂钩

### 参考指南

- [预热机制](./window-manager-warmup-mechanics.md) — 共享预热状态机（池化两轴模型 + 单例变体）、配置矩阵、GC 计时器、suspend/resume、`WindowManager_Reused` IPC
- [平台配置](./window-manager-platform.md) — 静态 `platformOverrides`、声明性 `behavior` 和操作系统 `quirks`（macOS 焦点/悬停/始终在顶部）
- [API 参考](./window-manager-api-reference.md) — 完整方法表：open/close/create/destroy、窗口操作、查询、广播、初始化数据、池管理、运行时设置器、事件
- [迁移指南](./window-manager-migration-guide.md) — 将直接 `BrowserWindow` 用法转换为 WindowManager

---

## 配置层（`windowOptions` / `behavior` / `quirks`）

`windowRegistry.ts` 中的每种类型元数据分为三层。每个字段都属于一个 — 通过**如果配置错误会出现什么问题**进行选择：

|层|它是什么|错误配置的后果|示例|
|---|---|---|---|
|`windowOptions`|`new BrowserWindow(...)` 的参数 - 电子原生构造函数选项|Electron 拒绝构建或构建时行为错误|`width`、`alwaysOnTop: true`、`frame: false`、`platformOverrides`|
|`behavior`|Electron 构造函数无法表达的跨平台、非 hacky 声明行为|WindowManager 行为偏离意图（e.g。模糊时不自动隐藏）|`hideOnBlur`、`alwaysOnTop: { level, relativeLevel }`、`visibleOnAllWorkspaces`、`macShowInDock`|
|`quirks`|通过猴子补丁应用特定于操作系统的黑客/解决方法|特定操作系统上的低于标准的用户体验（焦点窃取、Dock 闪烁、级别降级）|`macRestoreFocusOnHide`、`macClearHoverOnHide`、`macReapplyAlwaysOnTop`|

**命名规则（与分层正交）**：仅在一个平台上有效的任何字段都带有 `mac` / `win` / `linux` 前缀 - 无论层如何。 `behavior.macShowInDock` 是一个行为字段，但其 `mac` 前缀表示平台范围； `quirks.macRestoreFocusOnHide` 是具有相同前缀的 hack。

---

## 界限持久性

`rememberBounds` 是每个类型的元数据标志 - `showMode` / `生命周期` 的同级，**不是**上面三个配置层的一部分。设置后，WindowManager 在拆卸时保留窗口的 position/size ，并在下次打开时将其恢复到上次打开的显示器上（如果移除显示器或调整大小，则钳位到该显示器的工作区域 - 永远不会重置到主显示器）。它由主进程持久缓存（`window.bounds` key）支持；旧的几何图形是可以丢失的，因此不存在迁移。

**仅限单例。** 边界回答“此窗口在哪里重新打开？”，仅当窗口标识等于窗口类型 — i.e 时，它才有唯一的答案。单个实例。对于非单例类型，该标志将被忽略（带有开发警告）。多实例类型需要每个实例*内容标识*（e.g。选项卡 ID）以及重新打开恢复和陈旧 ID GC；这是一个记录在案的未来扩展。

**最大化保留在消费者端。**最大化标志被保留，但重新应用 `maximize()` 留给消费者（通过 [`peekWindowBounds`](./window-manager-api-reference.md#bounds-persistence) 读回）。几何图形在构造时以声明方式注入（`x/y/width/height` 是 `BrowserWindow` 构造函数选项），但 Electron 没有 `maximized` 构造函数选项 - 因此最大化是构造后命令式调用，其正确时间与每个窗口的显示编排耦合（e.g.Main 将其推迟到启动到托盘时首先显示）。拆分：WindowManager拥有保存+恢复几何图形；消费者拥有重新应用最大化。

**运行时切换。** [`wm.setRememberBounds(type, enabled)`](./window-manager-api-reference.md#bounds-persistence) 在运行时覆盖注册表标志并与其正交 - 它可以禁用带有标志的类型或启用未声明标志的类型。关闭它也会立即删除保存的记录，因此下次打开时将使用注册表默认值。全屏既不保留也不恢复。

---

## WM 不认识“Pin”

**Magic Box 窗口不共享单一的“固定”概念** — 三个可固定的窗口各自具有不同的含义：

|窗户|什么“pin”切换|
|---|---|
|快助手|抑制模糊自动隐藏（`alwaysOnTop` 保持 true）|
|选择动作|切换 `alwaysOnTop` （无模糊自动隐藏来抑制）|
|选择工具栏|没有引脚概念（总是隐藏在模糊中）|

另外，SelectionAction 具有独立的 `auto_close` 用户首选项，可在其自己的轴上驱动模糊自动隐藏 - 因此所有四个 `{hideOnBlur, alwaysOnTop}` 象限均可到达。

因此，WindowManager **公开正交基元，而不是 `pin` 抽象**。消费者在自己的服务层中编写 pin 语义：

```typescript
// QuickAssistant (pin = suppress blur-hide only)
wm.behavior.setHideOnBlur(id, !isPinned)

// SelectionAction (pin = toggle alwaysOnTop only)
wm.behavior.setAlwaysOnTop(id, isPinned)

// SelectionAction (auto_close + pin composed in renderer)
wm.behavior.setHideOnBlur(id, isAutoClose && !isPinned)
```

### 何时提供运行时设置器

声明性行为层的运行时设置器位于 `wm.behavior` （{@link BehaviourController} 实例）上。 WindowManager 在那里提供 `setHideOnBlur`、`setAlwaysOnTop` 和 `setMacShowInDockByType`，但故意**不**提供 `setVisibleOnAllWorkspaces`。仅当至少满足以下条件之一时， `behavior` 字段才值得运行时 setter：

1. **WM 必须维持状态** — e.g。 `hideOnBlur` 需要模糊监听器读取的覆盖映射； `macShowInDock` 需要 Dock 谓词读取的每个类型的覆盖映射。
2. **WM 可以从注册表中获取参数** — e.g。 `setAlwaysOnTop` 自动填充 `level` / `relativeLevel`。

`visibleOnAllWorkspaces` 都不满足（无状态；每个调用的选项不同，如 SelectionAction 的全屏显示序列）——消费者直接在 `BrowserWindow` 实例上驱动它。

**关于 `wm.behavior.setMacShowInDockByType`** 的注意事项：由窗口 TYPE（而不是 windowId）唯一键控，因为 Dock 可见性是应用程序级 UI 决策 - 同一类型的两个实例应该做出相同的贡献，并且服务通常需要在任何实例存在之前翻转覆盖（e.g。托盘启动在第一个 `open(Main)` 之前调用 `wm.behavior.setMacShowInDockByType(Main, false)`）。有关语义，请参阅[平台 → 声明性行为层](./window-manager-platform.md#declarative-behavior-layer)。

### 消费者决策指南

|情况|做|
|---|---|
|只需要创建时的初始状态|在注册表中声明 `behavior.*`|
|单驱动程序，运行时切换|使用 `wm.behavior.setHideOnBlur` / `wm.behavior.setAlwaysOnTop` （如果不存在 setter，则使用 `window.*`）|
|多个独立驱动程序（pin + auto_close）|在消费者端计算最终目标状态，然后调用一次设置器。 **不要** 在 WM 中存储中间状态。|
|每个呼叫都不同的特定于呼叫的选项|直接驱动`BrowserWindow`（e.g.SelectionAction的显示序列）|

### 类型推导约定

- 当Electron导出一个**命名类型**（e.g.`VisibleOnAllWorkspacesOptions`）时，直接导入它。
- 当它仅公开 **内联联合**（e.g。`setAlwaysOnTop` 上的 `level` 参数）时，通过 `Parameters<BrowserWindow['setAlwaysOnTop']>[1]` 派生。
- **永远不要**手动重新声明 Electron 参数联合。
- **警告**：如果 Electron 添加方法重载，`Parameters<>` 仅针对最后一个重载进行解析 - 在 Electron 升级后重新验证。

### 值得关注的 Electron 边缘案例

- `setAlwaysOnTop(false, level)`：当 `enabled` 为 false 时，`level` **被 Electron 忽略**。安全，但要记录呼叫站点的意图。
- `setVisibleOnAllWorkspaces`：两个选项（`visibleOnFullScreen`、`skipTransformProcessType`）均为 `@platform darwin`。 Electron 在其他地方默默地忽略它们。
- Linux / KDE Wayland 存在 `setVisibleOnAllWorkspaces` 的“幻影弹出窗口”错误 — 请参阅 `MainWindowService.ts` 了解上下文。消费者须自行守护本平台； WM 不干预。

---

## 选择正确的生命周期

|模式|实例|`open()` 行为|`close()` 行为|用于|
|---|---|---|---|---|
|`default`|许多|新鲜创造每一次通话|永久毁坏|并行出现的窗口（e.g.子窗口）|
|`singleton`|最多一个|创建或显示 + 聚焦现有的|默认销毁；当 `singletonConfig.retentionTime` 设置时隐藏并稍后销毁|独特的窗口（主窗口、设置窗口）。请参阅预热机制 → 单例变体了解 `singletonConfig` 选项。|
|`pooled`|很多，可重复使用|弹出一个空闲窗口，或者如果为空则创建新窗口|返回到空闲池，如果超过上限则销毁|经常打开的窗口，其中创建成本很重要（选择操作）|

完整模式语义和注册表示例：[概述 → 三种生命周期模式](./window-manager-overview.md#three-生命周期-modes)。

---

## 消费者 API 与内部 API

WindowManager 的生命周期方法分为两层。 **消费者代码应该只调用 `open()` 和 `close()`** - 注册表的 `生命周期` 声明告诉它们如何针对每种窗口类型进行操作。

|层|方法|角色|
|---|---|---|
|**消费者**|`open(type, args?)`，`close(windowId)`|生命周期感知；业务代码应该需要的唯一 API|
|内部的|`create(type, args?)`，`destroy(windowId)`|防御/逃生舱口原语；更喜欢 `open()` + `onWindowCreatedByType`|

行为注入通过 **`onWindowCreated`** （或其类型过滤的方便变体 **`onWindowCreatedByType`** 对于单一类型订阅） - 请参阅[用法 → 注入行为](./window-manager-usage.md#injecting-behavior-onwindowcreated-is-the-canonical-hook)。

---

## 常见的反模式

|错误的选择|为什么这是错误的|正确的选择|
|---|---|---|
|在 `wm.open()` 返回后直接附加监听器|重复使用的窗口（单例重新打开、池回收）会积累重复的侦听器；迫使您从 `open()` 转到 `create()`|订阅 **`onWindowCreatedByType(type, listener)`**|
|在业务代码中使用 `wm.create()`|单例唯一性已由注册表 `生命周期` 保证； `onWindowCreatedByType` 处理“新鲜运行设置”|使用 `wm.open()` + `onWindowCreatedByType`|
|在业务代码中使用 `wm.destroy()`|在非池化窗口上，与 `close()` 相同。在池化窗口上，绕过池——很少需要|使用 `wm.close()`;对于池范围内的关闭，请使用 `suspendPool(type)`|
|在池化窗口的 `open()` 调用站点附加 `resized` / 每个窗口 `closed` 侦听器|池回收不会重新触发 `onWindowCreated`，因此重复使用的窗口会错过它们或在重新打开时加倍|附加到 `onWindowCreatedByType` 内部 — 每个 `BrowserWindow` 实例只触发一次|
|将池窗口上的 `paintWhenInitiallyHidden: false` 设置为“延迟显示直到内容准备好”|抑制原生`ready-to-show`，打破新鲜窗口自动显示路径|使用 `showMode: 'manual'` + 消费者驱动的 `show()`，或依靠 `Reused` 负载来确保数据在 `.show()` 之前到达|

---

## 相关源代码

### 核心基础设施

- `src/main/core/window/WindowManager.ts` — 服务实施；运行时行为设置器位于 `wm.behavior` 上（请参阅 `behavior.ts`）
- `src/main/core/window/behavior.ts` — 初始 `applyWindowBehavior` + `BehaviorController` （运行时设置器：`setHideOnBlur`、`setAlwaysOnTop`、`setMacShowInDockByType`）
- `src/main/core/window/windowRegistry.ts` — 每个类型的元数据（生命周期、池配置、`windowOptions`、`behavior`、`quirks`、平台覆盖）
- `src/main/core/window/types.ts` — `WindowType`、`WindowTypeMetadata`、`WindowBehavior`、`WindowQuirks`、`PoolConfig`、`SingletonConfig`、`WarmupMode`、`WarmupState`、`WarmupStateInit`、`ManagedWindow`
- `src/main/core/window/quirks.ts` — macOS 方法槽猴子补丁

### 渲染器集成

- [`src/renderer/windows/README.md`](../../../../src/renderer/windows/README.md) — 渲染器窗口入口点约定（`entryPoint.tsx` + `XxxApp.tsx` 三层结构）
- `src/renderer/hooks/useWindowInitData.ts` — 用于初始化数据消耗的规范钩子
- `src/shared/IpcChannel.ts` — `WindowManager_*` IPC 通道常量
