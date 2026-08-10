# IpcApi 参考

**IpcApi** 的入口点 — Magic Box 用于 RPC-over-IPC 的统一、类型安全通道：从渲染器到主进程的 command/capability 调用，以及类型化的 main→渲染进程 事件。

IpcApi 是与 BootConfig / Cache / Preference / DataApi 并列的**第五个并行子系统**。它**不**吸收其中任何一个——它收集这四个不能覆盖的“业务能力IPC”（window/system/shell/notification/external-service/file命令）。

> **状态：** Stage-0 框架（模式机制、`IpcRouter`、`IpcApiService`、预加载转发器、渲染器外观、`useIpcOn`）已发布，业务通道迁移基本完成 - `IpcChannel.ts` 现在仅包含 data/IpcApi 基础设施通道以及有意不迁移的组（仅 v1、冻结文件集群、延迟 lan_transfer / 微域 / copilot、技能脚手架和`Tab_MoveWindow` / Python 逃生舱口；每个舱口在 `IpcChannel.ts` 中都有一个独立的注释。残局崩溃（将`IpcChannel.ts`缩小到`ipc/channels.ts`，删除__PH8__/__PH9__，缩小`window.electron`）仍然悬而未决。

## 快速导航

- [IpcApi 概述](./ipc-overview.md) — 范式分割（RPC 与 REST）、表面缩小 + 方向备忘单、无单向 R→M、分层、两个正交轴、信任边界、`IpcContext`、错误模型、安全性
- [IpcApi 用法](./ipc-usage.md) — 添加请求（架构 + 处理程序）、添加事件（类型 + __PH1__/__PH2__ + `useIpcOn`）、三进程端到端示例
- [IpcApi 架构指南](./ipc-schema-guide.md) — route/event 命名、__PH1__/__PH2__、__PH3__/__PH4__、ESLint 密钥验证
- [IpcApi 迁移指南](./ipc-migration-guide.md) — 收集每个域分散的 __PH1__/__PH2__/hand-written 预加载、`send` 工作列表、逃生舱口（当通道停留在外面时）、暴露表面审核

## 边界——何时使用哪个子系统

|需要|系统| API |
|---|---|---|
|Read/write SQLite业务数据|数据接口|`useQuery` / `useMutation`|
|用户设置（跨窗口同步）|偏爱|`usePreference`|
|一次性/共享瞬态|缓存|`useCache` / `useSharedCache` / `usePersistCache`|
|生命周期前启动配置|启动配置|`usePreference('BootConfig.*')`|
|**对 main 的任何其他命令式调用** (window/system/shell/notification/external/file)|**IpcAPI**|`ipcApi.request` / `useIpcOn`|

决策规则：SQLite数据→DataApi；用户设置→首选项； losable/shared 状态 → 缓存；生命周期前配置 → BootConfig； **其他一切，每个命令式功能都会调用 main → IpcApi**。相同的 `BeforeReady` 阶段并不意味着相同的责任 - 边界是责任（data/state/config 与命令），而不是阶段。

## 命名快速参考

|概念|标识符|
|---|---|
|产品名称|`IpcApi`|
|渠道|`IpcApi_Request` (`ipc-api:request`) / `IpcApi_Event` (`ipc-api:event`)|
|主要协调员|`IpcApiService`（`request` 调度 + __PH2__/__PH3__）|
|预载桥|`window.api.ipcApi` (`{ request, on }`)|
|渲染器立面|`ipcApi` (`ipcApi.request('window.set_minimum_size', x)`) + `useIpcOn`|
|路线/活动名称|点 **snake_case**，任意深度 ≥ 2 (`file.read_doc`, `ai.agent.task.create`)；资源路径在前，动词在后；有效负载字段保持驼峰命名法|
|请求模式|`*RequestSchemas` → `ipcRequestSchemas` / `IpcRoute`|
|事件合约（纯类型）|`*EventSchemas` → `IpcEventSchemas` / `IpcEventName`|
|路由器/处理程序/错误|`IpcRouter` / `ipcHandlers` / `IpcError`|
|目录|`src/{shared,main,渲染进程}/ipc/`，`src/preload/ipc.ts`|

## 源图

|文件|角色|
|---|---|
|`src/shared/ipc/define.ts`|`defineRoute` + `RouteDef`|
|`src/shared/ipc/schemas/ipcSchemas.ts`|`ipcRequestSchemas` / `IpcRoute` / `IpcEventSchemas` / `IpcEventName`|
|`src/shared/ipc/types.ts`|`InputFor` / `OutputFor` / `EventPayload` / `IpcHandlersFor` / `IpcContext` / `WindowId`|
|`src/shared/ipc/errors/IpcError.ts`|框架核心： `IpcError` / `IpcErrorCode` （框架代码，单一事实来源） / `SerializedIpcError` / `IpcResult`|
|`src/shared/ipc/errors/<domain>.ts`|每个域的错误代码映射 (`as const`)，由处理程序 + 渲染器直接导入 — `errors/` 没有聚合桶|
|`src/main/ipc/IpcRouter.ts`|请求路由器（键查找+zod解析+调度）|
|`src/main/ipc/IpcApiService.ts`|`BeforeReady` 协调员：处理程序注册 + __PH1__/__PH2__|
|`src/main/core/security/validateSender.ts`|源信任门 (`validateSender` / `isAppRendererUrl`)，与 DataApi `IpcAdapter`、Preference/Cache 子系统处理程序和 `will-navigate` 防护程序共享|
|`src/main/ipc/handlers/ipcHandlers.ts`|global `ipcHandlers` （详尽的、经过审计的暴露面）|
|`src/preload/ipc.ts`|通用转发器 → `window.api.ipcApi`|
|`src/渲染进程/ipc/index.ts`|类型立面 `ipcApi`|
|`src/渲染进程/ipc/useIpcOn.ts`|事件订阅钩子|
