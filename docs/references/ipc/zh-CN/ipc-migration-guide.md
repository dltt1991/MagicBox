# IpcApi 迁移指南

Stage 0（框架）与传统 IPC 一起发布。迁移是后期工作——多个独立的 PR，一次一个域，直到所有内容都收集完毕并且旧机器退役。

## 按域迁移（请求方）

对于每个域，在 **一个原子 PR** 中（四个操作必须一起落地，否则构建会中途中断）：

1. 将域的 `*RequestSchemas` + `*EventSchemas` 添加到 `src/shared/ipc/schemas/`。
2. 将处理程序逻辑移至 `src/main/ipc/handlers/<domain>.ts` （如果小且无状态，则内联纯函数；通过 `application.get` 委托给生命周期服务；通过直接导入其精选条目委托给非生命周期模块）。服务保持其业务逻辑和资源生命周期；它只是停止注册 IPC。
3. 删除该域的旧手写 `preload/preload.ts` method(s)。
4. 将渲染器调用站点切换到 `ipcApi.request(...)` / `useIpcOn(...)`，然后删除旧的 `IpcChannel` 枚举条目。

每个 PR 都是独立可恢复的。

**测试处理程序，而不是架构。** `handlers/__tests__/<domain>.test.ts` 涵盖真实行为（senderId 路由、空回退、委托）。每个域模式是由编译时检查加上一个框架类型测试 (`src/shared/ipc/__tests__/schema.types.test.ts`) 锁定的精简合约 - 不要复制 `schemas/__tests__` 模板。请参阅 [ipc-usage.md](./ipc-usage.md#testing)。

## 架构创作：镜像现有类型

当请求输入重用其他地方定义的 TS 类型（首选项类型、共享模型）时，请使用 `z.ZodType<X>` 将验证 zod 模式绑定到定义中的该类型，因此漂移是**那里**的编译错误 - 而不是在远程测试中：

```ts
import type { SelectionActionItem } from '@shared/data/preference/preferenceTypes'
// repo convention — see uiParts.ts, legacyFileMetadata.ts
const selectionActionItemSchema: z.ZodType<SelectionActionItem> = z.object({ id: z.string() /* …all fields… */ })
```

两个执行层，只有第二层需要花费任何费用：

|层|保证|
|---|---|
|处理程序合同 (`handler → svc.method(x: X)`)|架构涵盖 `X` 的每个 **必填** 字段 - 免费，处理程序已经通过它|
|`z.ZodType<X>` 注释|**精确**相等（存在可选，没有额外的）|

要避免的反模式：JSDoc `{@link X}` 加上单独的 `expectTypeOf` 测试 - 导入读取为未使用，并且检查偏离定义。

**更轻的替代方案。** 如果该值是不透明传递（main 将其转发为 `initData` 并且从不读取其字段）并且渲染器已经对形状进行类型锁定，则 `z.custom<X>()` 会以无运行时字段验证为代价删除场镜像。根据投资回报率进行选择。

## 返回值： `void` 无意义时

遗留处理程序通常 `return` 是调用者从未读取的内部状态 - e.g。 WindowManager 的 __PH1__/__PH2__ 返回一个“是否找到窗口”布尔值，但预加载已将其键入 `Promise<void>` 并且每个调用站点都会忽略它。在这种情况下声明路线 `output: z.void()` 。 **仅**当调用者实际使用该值（如 `window.is_maximized → boolean`、`window.get_init_data → unknown` 之类的查询）时才给出非空输出。处理程序仍然可以计算内部值；薄型适配器只是将其丢弃。这可以使打印表面诚实地了解呼叫者可以依赖的内容。

## 三种能力形态

|能力形态|迁移表格|
|---|---|
|小型无状态逻辑（应用程序信息、字体）|`handlers/` 中的纯函数，无服务|
|生命周期服务（MCP / Knowledge / Window — 注册于 `serviceRegistry.ts`）|`handlers/` 中的处理程序委托给 `application.get('XxxService')`；逻辑+生命周期留在服务中|
|非生命周期模块（文件主题、`printService`、`regionService`）|处理程序导入模块的精选条目（主题桶或直接导入单例）和委托；切勿创建生命周期服务来获取 DI 句柄|

## `BaseService.ipcHandle` / `ipcOn` 移除

这些糖方法只是 `ipcMain.handle/on` + `registerDisposable(removeHandler/removeListener)` — 没有独特的功能。所有服务迁移完成后，在专用终端PR中将其移除。 IPC注册则分解为两种：（1）业务→单一IpcApi通道； （2）基础设施数据子系统（DataApi/Preference/Cache）→自己原生的`ipcMain.handle` + `registerDisposable`，像DataApi的`IpcAdapter`。

## `IpcChannel` 折叠

当域迁移时，它们的通道枚举条目将被删除。最后，`src/shared/IpcChannel.ts` 缩减为 IpcApi 对 + 基础设施 __PH1__/__PH2__/__PH3__ 通道，并移至 `src/shared/ipc/channels.ts`。

## 暴露表面审核

迁移后，渲染器可以达到的每一项主要功能都在 `src/main/ipc/handlers/` 中枚举——一个可审核列表。与已删除的分散的 `this.ipcHandle` 站点进行比较，以确认没有任何内容被扩大或删除。

## M→R `send` 工作列表

约 30 个渠道的约 47 个推送呼叫站点，按目的地分类：

|班级|目的地|笔记|
|---|---|---|
|**A** 类型事件（~35，批量）|IpcApi __PH0__/__PH1__ + `useIpcOn`|窗口 生命周期/state、主题、选择、MCP/adapter 通知、更新进度等。|
|**B** 主题流 (5)|服务持有的侦听器 + 定向 `send`|__PH0__/__PH1__/__PH2__、`file.tree.mutation`（已迁移）；保持16ms/2048批处理+多窗口附加|
|**C** 基础设施 (2)|**未收集**|`Preference_Changed`、`Cache_Sync` — 留在各自的子系统中|
|**D** 特殊寻址 (5)|基于 `ctx.senderId` 的定向 `send`|`CherryIN_OAuthResult` ×4（回复启动器窗口），迁移进度|

约 40 个站点 (A+B) 移至 IpcApi 事件链接；只有 2 个 C 类站点不被排除在外。

### 类示例（之前→之后）

```ts
// A — typed event (WindowManager_MaximizedChanged): IpcChannel enum + win.webContents.send + preload onXxx + manual removeListener
export type WindowEventSchemas = { 'window.maximized_changed': { maximized: boolean } }
application.get('IpcApiService').send(windowId, 'window.maximized_changed', { maximized: isMax })
useIpcOn('window.maximized_changed', ({ maximized }) => setMax(maximized))

// B — topic stream (Ai_StreamChunk): the service's listener/batching/multi-window attach are unchanged; only "how to send" + ctx.senderId replaces event.sender
export type AiEventSchemas = { 'ai.stream.chunk': { topicId: string; chunk: AiChunk } }
'ai.stream.open': (req, { senderId }) => aiStream.attach(senderId, req.topicId)
// service: for (const id of windowsOf(topicId)) application.get('IpcApiService').send(id, 'ai.stream.chunk', { topicId, chunk })
useIpcOn('ai.stream.chunk', ({ topicId, chunk }) => { if (topicId === current) append(chunk) })

// C — not collected (Preference_Changed / Cache_Sync): keep using the subsystem hooks
const [theme] = usePreference('app.theme')
const [pos] = useSharedCache('scroll.position.x')

// D — special addressing (deep-link OAuth result): reply only to the initiator window
export type OAuthEventSchemas = { 'oauth.deep_link_result': { ok: boolean; apiKeys?: ApiKey[]; error?: string } }
'oauth.start_deep_link_flow': (req, { senderId }) => oauth.begin(req, senderId) // remember initiator WindowId
application.get('IpcApiService').send(savedSenderId, 'oauth.deep_link_result', { ok: true, apiKeys }) // no-op if the window is gone
useIpcOn('oauth.deep_link_result', (r) => (r.ok ? saveKeys(r.apiKeys) : showError(r.error)))
```

### 收集期间需要修复的已知不一致问题

`IpcChannel.Notification_OnClick = 'notification:on-click'` (IpcChannel.ts) 未使用；实际推送硬编码 `'notification-click'` (MainWindowService.ts / NotificationService.ts) 并且渲染器侦听硬编码字符串。收集通知域时统一为类型化事件。

## 逃生舱口——当通道可能无法进入时

**默认：每个 R→M 通道都通过 IpcApi。** 逃生舱口是一种罕见的、最后手段的例外 - 今天，整个代码库中恰好有 **一个** 通道清除了障碍 (`Tab_MoveWindow`)。这不是一个需要达到的“高频优化”；它是选择退出打字、门禁、审核的表面，并且必须获得。

两步测试——方向，然后频率：

```
Does this R→M channel go through IpcApi?
├─ M→R?            → never escapes (already one-way send); hot → class B, still in IpcApi
└─ R→M?
   ├─ per-action   → IN IpcApi (request, even void)
   └─ per-frame    → escape candidate → must meet BOTH conditions below
```

**为什么 M→R 永远不会逃逸。** 它的 IpcApi 传输已经是单向 `webContents.send` (`IpcApiService.send`, `WindowManager.broadcast`) — 没有回复腿，没有什么可以逃逸的。热 M→R 流通过 B 类模式（服务持有的注册表 + 定向 `send(windowId)` + 批处理）保留在 IpcApi 中。

**为什么每帧 R→M 可能会逃逸。** R→M 是 __PH0__/__PH1__（往返），因此每帧通道每帧都会支付回复支路，并且 `await` 将拖动循环与 main 的尾部延迟耦合。 `Tab_MoveWindow`（rAF 节流，~60–120/s，即发即忘本机窗口移动）是存储库中唯一的每帧 R→M — 唯一的限定符。

**剥离的两个硬性条件**（或者是一个洞，不是例外）：

- **仍然是门控** — 使用本机 `ipcMain.on` + `registerDisposable` + 显式 `validateSender` 调用进行注册（镜像 DataApi 的 `IpcAdapter` 和 Preference/Cache 处理程序中的显式门）。 **不要**使用 `this.ipcOn` 糖（预定去除，见上文）。
- **仍记录在案** — 将其列在下面的[不在范围内](#not-in-scope-for-ipcapi) 中。记录在案的例外情况（如 `Cache_Sync`）使单一清单暴露审计保持诚实；一个无证的遗漏打破了它。

**范围规则** - 大多数相同的功能仍然迁移到：

|渠道|处置|
|---|---|
|`Tab_MoveWindow`|**出去** — 逃生舱口（门控+记录）|
|`Tab_Detach` / `Tab_DragEnd` / `Ai_AbortImage`|**在** — 一次性 → `void` 请求|
|`Python_ExecutionResponse`|分离 — 渲染器作为服务器反向 RPC（请求 ID 相关，携带错误）； IpcApi 的 main-as-server `request` 模型不适合，自行处理|
|`Cache_Sync`|留在缓存子系统中|

## 不在 IpcApi 范围内

|物品|入住于|
|---|---|
|`Tab_MoveWindow`（每帧 R→M 拖动；原生 `ipcMain.on` + 自己的 `validateSender`）|`SubWindowService`（逃生舱口）|
|`shell.openExternal`, `webUtils.getPathForFile` (preload直接调用Electron，而不是IPC)|`window.electron`|
|`preference.onChanged`，`dataApi.onDataChanged`|自己的子系统|
|`Cache_Sync`“排除自身”（使用数字 `BrowserWindow.id`）|缓存子系统|
