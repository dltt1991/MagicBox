# 窗口管理器使用指南

从消费者代码中使用 WindowManager 的实用指南。有关架构上下文，请参阅[概述](./window-manager-overview.md)。有关完整方法参考，请参阅 [API 参考](./window-manager-api-reference.md)。

## 快速入门

### 1.添加WindowType枚举值

在 `types.ts` 中：

```typescript
export enum WindowType {
  Main = 'main',
  // ... existing types
  MyWindow = 'myWindow',  // <-- add your new type
}
```

### 2.在window注册表中注册

在 `windowRegistry.ts` 中：

```typescript
WINDOW_TYPE_REGISTRY[WindowType.MyWindow] = {
  type: WindowType.MyWindow,
  lifecycle: 'singleton',
  htmlPath: 'windows/myWindow/index.html',
  // preload omitted → defaults to 'index.js'
  // showMode omitted → defaults to 'auto'
  windowOptions: {
    ...DEFAULT_WINDOW_CONFIG,
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
  },
}
```

### 3.打开窗户

```typescript
import { application } from '@application'
import { WindowType } from '@main/core/window/types'

const wm = application.get('WindowManager')

// open() is lifecycle-aware — handles singleton reuse, pool recycle, etc.
const windowId = wm.open(WindowType.MyWindow)
```

### 4.通过`onWindowCreatedByType`注入域行为

```typescript
// In your domain service's onInit():
const wm = application.get('WindowManager')
wm.onWindowCreatedByType(WindowType.MyWindow, ({ window, id }) => {
  // Store the windowId for later use
  this.myWindowId = id

  // Attach event listeners BEFORE content loads
  window.on('closed', () => {
    this.myWindowId = undefined
  })
})
```

上面的例子使用了**解构**。使用 `mw` 简写的等效项（当回调正文很长或访问许多字段时很有用）：

```typescript
wm.onWindowCreatedByType(WindowType.MyWindow, (mw) => {
  this.myWindowId = mw.id
  mw.window.on('closed', () => { this.myWindowId = undefined })
})
```

两者都是有效的 - 请参阅[回调样式](#callback-styles-destructuring-vs-mw-shorthand) 了解何时选择哪一个。

## 领域服务集成

`onWindowCreated` 事件是域服务注入特定于窗口的行为的规范挂钩，并与 `wm.open()` / `wm.close()` 配对作为通用消费者 API。对于单一类型订阅（典型情况），更喜欢 `onWindowCreatedByType` / `onWindowDestroyedByType` 便利变体 - 它们按类型为您进行过滤，因此回调主体专注于行为，而不是防护。

### 模式

```typescript
@Injectable('MyWindowService')
@ServicePhase(Phase.WhenReady)
export class MyWindowService extends BaseService {
  private myWindowId: string | undefined

  protected override onInit(): void {
    const wm = application.get('WindowManager')

    wm.onWindowCreatedByType(WindowType.MyWindow, ({ window, id }) => {
      // 1. Store the windowId
      this.myWindowId = id

      // 2. Attach listeners BEFORE content loads
      window.once('ready-to-show', () => {
        this.sendInitialData(window)
      })

      window.on('closed', () => {
        this.myWindowId = undefined
      })
    })

    wm.onWindowDestroyedByType(WindowType.MyWindow, () => {
      this.myWindowId = undefined
    })
  }
}
```

### 注入行为：`onWindowCreated` 是规范的钩子

域服务在 `onWindowCreated` 订阅中附加特定于窗口的行为。这与 `wm.open()` 配对作为通用消费者 API：`open()` 根据其注册表 `生命周期` 生成或重用一个窗口，并且 `onWindowCreated` 每个新的 `BrowserWindow` 实例只触发一次。您永远不需要在调用站点上进行“新与重用”的分支。

对于只关心单个窗口类型（典型的消费者情况）的订阅，请使用 `onWindowCreatedByType(type, listener)` / `onWindowDestroyedByType(type, listener)` 便利变体 - 它们为您应用类型过滤器，因此回调正文永远不会以 `if (managed.type !== X) return` 开头。通用 `onWindowCreated` / `onWindowDestroyed` 仍然可用于罕见的“观察所有窗口”用例。

**`onWindowCreated` 免费为您提供什么：**

- **每个新的 BrowserWindow 只触发一次。** Singleton 重新打开并且池回收不会重新触发 - 因此附加到此处的侦听器永远不会累积重复项，并且无论重用路径如何， `open()` 始终是安全的。
- **通过一个订阅覆盖每个 `open()` 调用站点。** 主路径、崩溃恢复、测试装置以及任何未来添加的入口点都流经同一事件。您不能忘记连接一条新路径。
- **在 `loadURL` 之前触发。** 可以及时应用预加载配置，例如 `setFocusable` (Linux Wayland)、`setContentProtection` 或 `webContents` 会话设置，以影响首次绘制。
- **也适用于池化窗口。** 必须在此处附加诸如 `resized` 或 `closed` 之类的每实例侦听器 - 回收路径不会重新触发事件，因此将它们附加到 `open()` 调用站点将要么错过回收的实例，要么在重新打开时累积。

**反模式：`open()` 调用站点处的直接 ID 附件。**

在 `wm.open()` 返回后内联附加侦听器是很诱人的，因为 ID 就在那里：

```typescript
const id = wm.open(WindowType.MyWindow)
const window = wm.getWindow(id)!
window.on('blur', this.hideIfUnpinned)
window.once('closed', () => { this.windowId = null })
```

这看起来比订阅活动更干净，但它带来了三个隐藏成本：

1. **强制您关闭 `open()`。** 如果重用窗口（单例重新打开或池回收），这些侦听器将第二次附加到已经拥有它们的窗口上。为了使模式安全，您必须切换到 `create()` — 这是一个内部原语，而不是消费者 API（请参阅下面的“Window API 层”）。
2. **多个入口路径默默解耦。** 崩溃恢复、测试装置或任何未来的 `open()` 调用站点都需要记住运行安装程序。 `onWindowCreated` 订阅将所有内容集中在一处。
3. **与注册表配置的隐式耦合。**如果侦听器安全性取决于特定的 `showMode` / `paintWhenInitiallyHidden` / 等值（e.g。预显示 `setFocusable` 计时仅在 `showMode: 'manual'` 时有效），则稍后的注册表更改会在没有编译时信号的情况下破坏正确性。

如果您对这种模式感兴趣，请订阅 `onWindowCreatedByType(type, listener)` — 多一行，所有三项费用都会消失。

### 回调样式：解构与 `mw` 简写

`onWindowCreatedByType` / `onWindowDestroyedByType` 听众收到 `ManagedWindow` — 与通用变体相同的唱片形状。访问其字段的两种惯用方法：

**解构（推荐默认，短回调）：**

```typescript
wm.onWindowCreatedByType(WindowType.MyWindow, ({ window, id }) => {
  this.myWindowId = id
  window.on('closed', () => { this.myWindowId = undefined })
})
```

从参数中准确提取所需的字段 — `{ window }`、`{ window, id }`、`{ window, id, metadata }`。自记录并避免 `mw.window.on(...)` 视觉噪音。

**`mw` 简写（具有内部闭包或多次访问的回调）：**

```typescript
wm.onWindowCreatedByType(WindowType.SelectionAction, (mw) => {
  // Inner closure reads mw.window's methods repeatedly — keeping the whole
  // record under one short name reads better than re-destructuring.
  mw.window.on('resized', () => {
    if (mw.window.isDestroyed()) return
    this.saveBounds(mw.id, mw.window.getBounds())
  })
})
```

`mw` 是 `ManagedWindow` 的首字母缩写 — 简短、具体，并且不会像名为 `window` 的参数那样与 `.window` 字段发生冲突。

**选择在上下文中读起来更好的那个。**将它们混合在文件中——甚至在同一个服务中——是可以的；参数名称是唯一的区别。

### Window API 层：消费者与内部

WindowManager 公开了四个生命周期方法，分为两层：

|层|方法|语义学|何时致电|
|---|---|---|---|
|**消费者**|`open(type, args?)`|生命周期感知：全新创建、单例重用或每个注册表的池回收|总是要获得一个窗口|
|**消费者**|`close(windowId)`|生命周期感知：销毁非池化，释放到池化为池化|总是，释放一个窗口|
|内部的|`create(type, args?)`|强制新鲜创造；如果单例已经存在则抛出|防御性断言——消费者代码不应该需要它|
|内部的|`destroy(windowId)`|强行破坏；绕过池回收|消费者代码中不需要（见下文）|

**消费者代码应该只调用 `open()` 和 `close()`。** 注册表的 `生命周期` 声明是这些方法行为的唯一事实来源，因此调用站点不需要在窗口类型上分支。

**为什么 `create()` 不是消费者 API。** 实现 `create()` 的每个常见动机都有一个更清晰的基于 `open()` 的解决方案：

|敦促|解决|
|---|---|
|“我需要我的设置仅在新窗口上运行”|订阅 `onWindowCreatedByType` — 它仅在新鲜时触发，从不重复使用时触发|
|“我需要确保不存在重复的单例”|注册表 `生命周期: 'singleton'` 已经保证了； `open()` 返回现有实例|
|“我的服务的本地 `windowId` 必须与 WindowManager 的匹配”|订阅 `onWindowDestroyedByType` 以清除本地状态，与 WM 的 `'closed'` 跟踪同步|

**为什么 `destroy()` 不是消费者 API。** 在非池化窗口（默认和单例）上，`close()` 会执行相同的 `destroyWindow()` 调用 — 没有行为差异。在池化窗口上，`destroy()` 绕过池，这几乎不是消费者真正想要的； “停止整个池”的正确 API 是 `suspendPool(type)`，它会销毁空闲窗口并防止进一步回收而不触及正在使用的窗口。

### 消费者加载的窗口 (`htmlPath: ''`)

具有 `htmlPath: ''` 的注册表项是**消费者加载的**：WM 连接窗口（预加载、行为、边界、生命周期），但不加载任何内容 — 域服务在 `open()` 之后加载它。用于隐藏的一次性表面渲染*生成的*内容（打印/PDF、离屏渲染）。

```typescript
const id = wm.open(WindowType.MyPrintSurface)          // WM wires; loads nothing
const win = wm.getWindow(id)                           // the sanctioned handle to load into
await win?.webContents.loadURL(generatedHtmlDataUrl)   // consumer owns content + show + close()
// ... await 'did-finish-load', e.g. webContents.printToPDF(), then wm.close(id)
```

`getWindow(id)` 是“消费者仅调用 `open()` / `close()`”的一个例外 - 仅将其用于 `webContents` 加载（​​有效负载编码是消费者的调用）。主启动的 `loadURL` / `loadFile` 不会被 WM 的导航防护阻止（它们只拦截渲染器启动的导航）。

### 域键到窗口 ID 映射

对于以域数据为键的窗口类型（e.g.，特定于主题的窗口），域服务维护其自己的映射：

```typescript
// Domain service tracks which topic is shown in which window
private topicWindows = new Map<string, string>()  // topicId -> windowId

wm.onWindowCreatedByType(WindowType.TopicView, ({ id }) => {
  const topicId = wm.getInitData(id) as string
  this.topicWindows.set(topicId, id)
})

// Open a topic — reuse existing or create new
openTopic(topicId: string): void {
  const existingId = this.topicWindows.get(topicId)
  if (existingId) {
    wm.show(existingId)
    wm.focus(existingId)
    return
  }
  const windowId = wm.open(WindowType.TopicView, { initData: topicId })
}
```

## 渲染器：`useWindowInitData` 钩子

`src/renderer/hooks/useWindowInitData.ts` 为任何托管窗口提供了在两个创建路径上使用其初始化数据的规范方法：

```typescript
import { useWindowInitData } from '@renderer/hooks/useWindowInitData'

const MyWindowApp: FC = () => {
  const data = useWindowInitData<MyInitData>()
  if (!data) return null
  return <ControlledContent data={data} />
}
```

- 安装时：通过 `WindowManager_GetInitData` 调用拉取（冷启动路径）。
- 重用时：接收 `WindowManager_Reused` 有效负载（PUSH 路径，零往返）。
- 每会话状态重置应位于 `useEffect([data.someStableId], …)` 中的子组件内部，因此 DOM 在回收过程中保持连续 - 切勿使用 `key={resetKey}` 强制重新挂载；重新引入了该合同旨在消除的闪存。

有关完整的冷启动与重用计时协定，请参阅 API 参考中的 [Init Data](./window-manager-api-reference.md#init-data)。
