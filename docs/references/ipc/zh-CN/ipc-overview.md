# IpcApi 概述

## 范式分裂——为什么 IpcApi 独立于 DataApi

IPC/RPC/REST是分层的，不是竞争对手：

|层|概念|这个项目|
|---|---|---|
|运输|**IPC** (Electron __PH0__/__PH1__) — 跨进程移动字节|DataApi + IpcApi **分享**它|
|范例|**REST**（面向资源）与**RPC**（面向能力）|数据API=休息； IpcApi=RPC|

|方面|数据接口|IpcAPI|
|---|---|---|
|范例|休息/资源|RPC/能力|
|寻址|`path` + HTTP 方法|`namespace[.subdomain].action` 点蛇|
|副作用|禁止（纯数据）|点 (window/system/shell/external/file)|
|未来|可能成为远程服务器|始终是本地的，绑定到 main|
|重试|幂等读取可能会重试|命令默认不重试|
|错误|HTTP状态|RPC 错误 `code`（字符串）|

DataApi 故意拒绝 RPC 语义和副作用，以保持“在真实远程服务器中交换”的可能性。因此，System/command IPC 需要一个**具有显式 RPC 语义的独立通道** — IpcApi。

**独立实现，不是共享内核。** IpcApi 借用了 DataApi 的 *想法*（单点模式、编译时穷举、单通道、一次性清理），但不共享任何代码：DataApi 的 `ApiServer` （路径匹配 + HTTP 状态推断 + 中间件）和 `DataApiError` （HTTP 映射）是 REST 型的且不需要。 IpcApi 是一个平面 `route → { input, output }` 映射，具有纯键路由 — `IpcRouter.dispatch`（~12 行）、`IpcHandlersFor`（~5 行映射类型）、`IpcError`（~40 行）。相同的想法，不同的实现。

## 为什么要缩小表面——通道更少，类型更全

IpcApi 故意**缩小**渲染器→主 IPC 的范围：仅存在 `ipcRequestSchemas` 中声明的路由，而不存在服务临时添加的任何通道。缩小是特征，而不是限制。

| |之前（旧版 IPC）|之后（IpcApi）|
|---|---|---|
|渠道来源|任何服务手动添加 __PH0__/__PH1__ + 手写预加载|仅在 `ipcRequestSchemas` 中声明的内容|
|类型|松散、手动对齐三个文件|一个模式驱动路由+输入+输出，端到端|
|可枚举性|分散在各个服务中，没有单一列表|`handlers/ipcHandlers.ts` — 一份可审核的功能列表|

实际上，这是一种网络便利，而不是限制：

- **完整类型检查** — 路线自动完成；错误的路由、输入或输出是编译错误；架构漂移使构建失败。
- **一张备忘单** — `IpcRoute` / `handlers/ipcHandlers.ts` 是渲染器可以调用的所有内容的可发现列表（请参阅[方向备忘单](#direction-cheat-sheet)）。
- **可审核** — 一个可以确认暴露表面既没有变宽也没有下降的地方（请参阅迁移指南的暴露审核）。

交易是经过深思熟虑的：放弃添加任意通道的自由，获得完整类型、单点可发现性和可审计性。缩小是常态；可能被排除在外的罕见通道是个位数的受控异常（请参阅[逃生舱口](./ipc-migration-guide.md)）。

## 分层

```
 Renderer                         Preload              Main
 ─────────────────────────────────────────────────────────────────────
 ipcApi.request('window.x', in)   window.api.ipcApi    IpcApiService
   │ route∈IpcRoute, in/out typed   │ single channel      │ IpcRouter.dispatch
   └──────────────────────────────►│── IpcApi_Request ──►│ validateSender + parse + dispatch
                                    │◄─ {ok,data}|{ok:false,error} ┤ structured result (never reject)
 useIpcOn('window.resized', cb)    │◄─ IpcApi_Event ─────┤ IpcApiService.broadcast/send
```

- **模式层** (`src/shared/ipc/schemas/`)：每个域文件，每个文件分为一个请求块（zod 值，单一事实来源）和一个事件块（纯类型）。
- **传输**：两个通道 — `IpcApi_Request` (R→M) 和 `IpcApi_Event` (M→R)。
- **main**：`IpcApiService` = `IpcRouter`（请求调度）+ __PH2__/__PH3__/__PH4__（事件）+ 每个域处理程序。发送和接收统一在一项服务中。
- **预加载**：一个通用转发器（折叠手写对象）。
- **渲染器**：键式类型外观 `ipcApi.request` （如 `useQuery`）+ `ipcApi.on` / `useIpcOn`。

## 两个正交轴

IpcApi 承载沿两个独立轴处理的两个流（R→M 请求、M→R 事件）：

|轴|要求|事件|
|---|---|---|
|**组织** (dirs/objects/files)|统一 — 相同的 `IpcApiService` 接收请求并发送事件；一个 `schemas/<domain>.ts` 持有两个块|相同的|
|**运行时验证**（信任边界）|渲染器→主交叉进入特权端→ **不受信任→ zod `parse`**|主要→由 TCB 构建的渲染器→**受信任→纯类型，无解析**|

这将信任不对称性投射到模式形状中：**请求是 zod 值**（带验证器），**事件是纯类型**（无验证器）。形状差异*是*信任边界，但两者仍然按域聚合在一个子系统中。

## 信任边界——为什么事件未经验证

渲染器接收到的事件有效负载由 main（TCB）本身构造；验证它并不能保证安全。因此事件是纯类型（仅编译时正确性），没有运行时 `parse`。请求必须 `parse` 因为渲染器→main 跨入特权端并且不受信任。不对称性是由信任边界决定的，而不是由方向魔法决定的。

**警告——类型≠语义有效性。**“No `parse`”解决*安全性*，而不是*正确性*。类型正确的有效负载仍然可能是业务无效的：超出范围的数字、不是真正枚举成员的字符串、破坏不变量的两个字段。同样的间隙也适用于请求的 `output`，路由器也不会 `parse`（只有 `input` ）。出站有效性是构建站点的**发送者**责任 - 从静态类型值构建有效负载，并在数据源自不受信任的上游（e.g。通过 main 清洗的 MiniApp 回复）时进行摄取时验证 - 而不是传输层的。这是故意的，因此将“no `parse`”解读为“运输*拥有的无有效性风险”，而不是“无有效性风险”。

## 方向备忘单

这两个方向是两个独立的注册表——按方向查找：

|方向|抬头|持有|
|---|---|---|
|**R→M**（渲染器调用main）|`IpcRoute` (`keyof IpcRequestSchemas`) + `handlers/ipcHandlers.ts`|每个请求路由|
|**M→R**（主推渲染器）|`IpcEventName` (`keyof IpcEventSchemas`)|每个事件名称|
|**外部 IpcApi**|迁移指南的 [不在范围内](./ipc-migration-guide.md) 表 + Preference / Cache / DataApi 子系统|逃生舱口剥离（`Tab_MoveWindow`）、`Preference_Changed`、`Cache_Sync`、DataApi 订阅|

指向工会——永远不要将路线列表手动复制到文档中，它会漂移。在迁移域之前，两个联合都是 `never`，并且每次迁移都会增长。

## 没有单向 R→M 原语

IpcApi 提供**不**单向渲染器→主原语（没有 `ipcMain.on` 等效项）。每个 R→M 调用都是 __PH1__/__PH2__ (request/response)，因为 R→M 必须验证发送者并返回结构化错误 - 两者都需要回复段。

无效路线仍然乘坐 `invoke`：`output: z.void()` 会丢弃返回*值*，而不是往返。要发出 R→M 命令而不读取结果，请调用 `ipcApi.request(...)` 并且不要等待它 - 答复仍然会产生并被丢弃。

真正需要真正的“即发即忘”（高频、每帧 R→M）的罕见通道没有原语 — 它通过 [逃生舱口](./ipc-migration-guide.md) 离开 IpcApi。今天只有一个频道符合资格。

## 来电者身份 — `IpcContext`

`dispatch` 向处理程序传递 `input` 之外的第二个参数：受控的 `IpcContext` **仅**调用者窗口 ID，而不是原始 __PH3__/__PH4__.

```ts
export type WindowId = string // WindowManager UUID; same id across senderId / send(windowId) / getWindow
export interface IpcContext {
  senderId: WindowId | null
}
```

调用者身份**必须**由 main 从真实的 `event.sender` (`WindowManager.getWindowIdByWebContents`) 派生。它永远不会放在 `input` 中——渲染器可以伪造一个窗口 ID 并操作另一个窗口（权限升级）。连续推回调用者（流）**不**经过 `ctx`；服务拥有一个侦听器注册表并按主题引导 `send`。

**`senderId: null` 语义。** `null` 表示调用者通过了源信任门 (`validateSender`)，但 **不是托管 WindowManager 窗口**。 `validateSender`（框架 URL 允许列表）和 `senderId`（WindowManager 注册表）是两个不交叉检查的独立信任源，因此副作用处理程序必须 **决定如何处理 `senderId: null`** （拒绝，或退回到非窗口范围的路径），而不是假设存在窗口。如今，没有受信任但不受管理的窗口到达敏感路由，但这是由每个窗口配置控制的，而不是通过此处的检查来控制；新的副作用路线应该明确地控制 `senderId` 。

> DataApi 处理程序没有调用者窗口概念（它必须是远程的）。 IpcApi 具有 `IpcContext` 正是因为它是本地的并且绑定到主窗口功能 - 这也是两者无法合并的另一个原因。

## 误差模型

轻量级 `IpcError`（`code: string` + `message` + 可选 `data`），跨 IPC 序列化。 **不是** `DataApiError` （HTTP 语义属于远程数据层）。主端返回一个 **结构化结果** — `{ ok: true, data }` 或 `{ ok: false, error: ipcError.toJSON() }` — 并且 **永远不会抛出 `ipcMain.handle`**，因为 Electron 的 `invoke` 拒绝仅保留 `message` 并丢弃 __PH10__/__PH11__. 渲染器外观展开：在 `ok: false` 上它重建 `IpcError` 并抛出。

路由器将无效输入映射到 `VALIDATION_FAILED`，将未知路由映射到 `ROUTE_NOT_FOUND`；不受信任的发件人产生 `FORBIDDEN_SENDER`；其他任何值均归一化为 `INTERNAL`。

### 错误代码 — `IpcErrorCode`

`IpcErrorCode` (`src/shared/ipc/errors/IpcError.ts`) 是 **框架自身代码的单一事实来源** — `ROUTE_NOT_FOUND`、`VALIDATION_FAILED`、`FORBIDDEN_SENDER`、`INTERNAL`。抛出站点引用 const (`IpcErrorCode.VALIDATION_FAILED`)，而不是裸露的字符串文字，因此拼写错误是编译错误，而不是默默地错误分类的代码。

`IpcErrorCode` **类型** 是故意开放的 — `(the four literals) | (string & {})`：

- 当您在已知的框架代码上进行分支时，文字可以提供 IDE 补全并让 `code` 缩小范围；
- `(string & {})` 尾部故意保持集合开放：代码由 `IpcError.fromJSON` 跨越边界逐字重建，`IpcError.from` 将任何未知的抛出标准化为 `INTERNAL`，并且**迁移的域可以铸造自己的代码**。封闭联合将是反序列化边界上的谎言。

**从处理程序产生错误。** 处理程序发出失败信号，渲染器必须通过 `throw`ing `IpcError` 进行分支 — `IpcApiService` 捕获它，通过 `toJSON` 序列化，并返回 `{ ok: false, error }` （它永远不会到达 `ipcMain.handle`）。这四个框架代码是**由框架生成**，而不是由处理程序手动抛出；想要发出业务故障信号的处理程序会抛出一个**域代码**。任何非 `IpcError` 抛出（未捕获的错误）都会通过 `IpcError.from` 标准化为 `INTERNAL`，因此它永远不会将任意字符串泄漏为 `code`。

|情况|扔什么|
|---|---|
|输入错误/未知路由/不受信任的发件人/意外|没有任何手工操作 — router/service 产生 `VALIDATION_FAILED` / `ROUTE_NOT_FOUND` / `FORBIDDEN_SENDER` / `INTERNAL`|
|渲染器必须在 (`FILE_NOT_FOUND`, `MCP_NOT_CONNECTED`, …) 上分支的业务失败|**域名代码** — 域名拥有的 `SCREAMING_SNAKE_CASE` 字符串；机器可读的细节在 `data` 中，人类文本在 `message` 中|
|任何其他意外的投掷|保留它 — `IpcError.from` 将其映射到 `INTERNAL`|

**域代码 - 它们所在的位置。** 抛出自己代码的域将它们作为 `SCREAMING_SNAKE_CASE` `as const` 映射镜像 `IpcErrorCode` 放入 `@shared/ipc/errors/<domain>.ts` 中。处理程序（抛出）和渲染器（分支）都导入映射并引用常量 - 绝不是纯粹的文字 - 因此拼写错误是实际分支一侧的编译错误。代码必须稳定（渲染器在 `code` 上平等匹配）。固定位置的两条规则：

- **不在 `schemas/<domain>.ts` 中。** 映射是渲染器必须读取到分支 (`e.code === fileErrorCodes.FILE_NOT_FOUND`) 的运行时 *值*，但渲染器只能从 `@shared/ipc/schemas/*` 读取 `import type` （ESLint 规则将 zod 排除在渲染器包之外）——仅类型导入不会产生可比较的运行时值。因此，地图位于 `errors/` 下的框架代码旁边，这是可导入值且无 zod 的。这反映了为什么 __PH5__/__PH6__ 住在 `errors/`，而不是 `schemas/`。
- **没有桶聚合。** 与 `ipcRequestSchemas` / `ipcHandlers` 不同——框架将其作为一个整体来使用并检查其详尽性——*什么都*不会消耗“一次所有错误代码”：`code` 是开放的 `(string & {})`，从未针对其进行调度。直接从 `@shared/ipc/errors/<domain>` 导入每个域的地图； **不**通过 `errors/` 桶聚合域代码（没有 - `errors/IpcError.ts` 仅包含框架核心 `IpcError`、`IpcErrorCode`、`SerializedIpcError`、`IpcResult`）。聚合域代码会将每个域重新耦合到一个共享文件中，并吸引一个封闭的联合来对抗开放尾设计。

在 `data` 中携带机器可读的详细信息（类型化、结构化克隆安全），在 `message` 中携带人类文本 — 从不进行字符串解析 `message`。请参阅 [usage](./ipc-usage.md#4-surface-a-typed-error-optional) 了解处理程序抛出 + 渲染器分支示例。

## 生命周期和时间安排

`IpcApiService` 是 `@ServicePhase(Phase.BeforeReady)` — `DataApiService` 的命令端对等点。 `onInit` 只注册通道； handler/__PH5__ 中的 `application.get(...)` 是惰性的，因此处理程序在第一个窗口打开之前就已准备好（`Application.ts` 在 WhenReady 之前运行 `Promise.all([startPhase(BeforeReady), app.whenReady()])`，并且第一个窗口在 `MainWindowService.onReady` 中打开）。无需 `@DependsOn` 或优先级。

> handlers/__PH1__/__PH2__ 内的运行时 `application.get('WindowManager')` 是一种新模式（BeforeReady 服务延迟解析 WhenReady 服务）。 **仅在 handler/method 体内**（运行时）是安全的，在 __PH3__/__PH4__. 中绝不安全

## 安全——两扇门

单个请求入口处有两个正交、两者都需要的门：

1. **来源信任** (`validateSender`)：一个通道汇集了所有功能，因此首先验证调用者。所有网络框架（iframe、`<webview>` guest）都可以发送 IPC，并且此应用程序使用 `webviewTag: true` + `webSecurity: false` + MiniApps 加载任意远程 URL 运行。根据 Electron 的安全检查表，发送者经过验证：嵌入的 `<webview>` 内容被 WebContents 类型拒绝；只有 **顶级框架** 是受信任的（即使其 URL 看起来是应用程序拥有的，例如嵌入式 `<iframe>` 的子框架也会被拒绝，因为 `webSecurity:false` 让子框架共享渲染器）；并且框架 URL 必须是应用程序自己的 - 在生产中，应用程序包根目录内的 `file:` 路径** (`application.getPath('app.root')`)，因此任何其他本地文件（在 `ipcRenderer` 可访问的窗口中打开的 downloaded/exported HTML）都会被拒绝；在开发中，正是开发服务器的起源。远程来源被拒绝。
2. **输入验证** (zod `parse`)：对于每个请求路由始终打开 - 输入在处理程序运行之前进行解析。

`input` 有效 ≠ `sender` 可信；两个门都是必要​​的。事件（由 TCB 构建）是纯类型，未经验证。

源信任门并非 IpcApi 独有：相同的 `validateSender`（`src/main/core/security/validateSender.ts`，默认为 `app.root` 作为可信根）连接到 DataApi 传输 (`IpcAdapter`) 和 Preference/Cache 子系统处理程序，因此每个数据子系统漏斗都会拒绝不受信任的帧。已弃用的 __PH4__/__PH5__ 糖不会门控 - 仍在其上的遗留通道在迁移到 IpcApi 时获得门控。
