# IpcApi 用法

两个重复任务：添加请求路由（R→M 调用）和添加事件（M→R 推送）。新请求更改**2个地方**（架构+处理程序）；新事件会更改 **1 个合约** 及其发出和订阅站点。预加载和通道枚举永远不会改变。

## 添加请求路由

### 1.声明模式(`src/shared/ipc/schemas/<domain>.ts`)

```ts
import { z } from 'zod'
import { defineRoute } from '../define'

export const windowRequestSchemas = {
  // route: dot snake_case; payload fields stay camelCase
  'window.set_minimum_size': defineRoute({
    input: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
    output: z.void()
  })
}
```

将其注册到组合（`src/shared/ipc/schemas/ipcSchemas.ts`）中：

```ts
export const ipcRequestSchemas = {
  ...windowRequestSchemas
} satisfies Record<string, RouteDef>
```

### 2. 实现处理程序 (`src/main/ipc/handlers/<domain>.ts`)

```ts
import type { IpcHandlersFor } from '@shared/ipc/types'
import type { windowRequestSchemas } from '@shared/ipc/schemas/window'

export const windowHandlers: IpcHandlersFor<typeof windowRequestSchemas> = {
  // input is the parsed type; ctx.senderId is the caller WindowId (omit ctx if unused)
  'window.set_minimum_size': async ({ width, height }, { senderId }) => {
    if (senderId != null) application.get('WindowManager').setMinimumSize(senderId, width, height)
  }
}
```

注册它（`src/main/ipc/handlers/ipcHandlers.ts`）：

```ts
export const ipcHandlers: IpcHandlersFor<IpcRequestSchemas> = {
  ...windowHandlers
}
```

错过声明的路线 → 编译错误。为未声明的路由添加处理程序 → 编译错误。

### 3.从渲染器中调用它

```ts
import { ipcApi } from '@renderer/ipc'

await ipcApi.request('window.set_minimum_size', { width: 800, height: 600 })
const info = await ipcApi.request('app.get_info') // void input → no second argument
```

`route` 是 completed/checked 对 `IpcRoute`； input/output 类型随之而来。失败时，调用会以 `IpcError` 拒绝（其 `code` 允许您分支）。

### 4. 显示输入错误（可选）

要发出失败信号，渲染器必须分支，抛出带有 **域代码** 的 `IpcError` — `IpcApiService` 将其序列化为 `{ ok: false, error }`，渲染器外观重建 `IpcError` 并拒绝。 **不要**手动抛出框架代码（`VALIDATION_FAILED` / `ROUTE_NOT_FOUND` / `FORBIDDEN_SENDER` / `INTERNAL`） - 路由器拥有这些代码，任何未捕获的非 `IpcError` 抛出都会为您标准化为 `INTERNAL` 。请参阅[错误模型](./ipc-overview.md#error-codes--ipcerrorcode) 了解框架与域代码规则以及为什么代码位于 `errors/` 而不是 `schemas/` 下。

将域的代码作为 `as const` 映射放入 `@shared/ipc/errors/<domain>.ts` 中，并在两侧**直接**导入它（无桶 — `errors/` 没有聚合索引；每个域映射都直接导入）：

```ts
// src/shared/ipc/errors/file.ts — the domain's code map (zod-free, value-importable by both processes)
export const fileErrorCodes = { FILE_NOT_FOUND: 'FILE_NOT_FOUND' } as const
```

```ts
// main handler (src/main/ipc/handlers/file.ts)
import { IpcError } from '@shared/ipc/errors/IpcError'
import { fileErrorCodes } from '@shared/ipc/errors/file'

'file.read_doc': async ({ path }) => {
  if (!(await exists(path))) {
    // reference the constant, not a literal; machine-readable detail rides in `data`
    throw new IpcError(fileErrorCodes.FILE_NOT_FOUND, `No file at ${path}`, { path })
  }
  return read(path)
}
```

```ts
// renderer — branch on the rebuilt IpcError's `code` using the same constant
import { IpcError } from '@shared/ipc/errors/IpcError'
import { fileErrorCodes } from '@shared/ipc/errors/file'

try {
  await ipcApi.request('file.read_doc', { path })
} catch (e) {
  if (e instanceof IpcError && e.code === fileErrorCodes.FILE_NOT_FOUND) showMissing((e.data as { path: string }).path)
  else throw e
}
```

## 添加事件

### 1. 声明合约（`schemas/<domain>.ts`的事件块）

```ts
export type WindowEventSchemas = {
  'window.maximized_changed': { maximized: boolean }
}
```

将其注册到组合（`schemas/ipcSchemas.ts`）中：

```ts
export type IpcEventSchemas = WindowEventSchemas & AppEventSchemas
```

### 2. 从主服务发出

```ts
// to all windows
application.get('IpcApiService').broadcast('window.maximized_changed', { maximized: true })
// to all windows of one type (e.g. only the Main windows)
application.get('IpcApiService').broadcastToType(WindowType.Main, 'window.maximized_changed', { maximized: true })
// to one window (e.g. the caller, by its WindowId)
application.get('IpcApiService').send(windowId, 'window.maximized_changed', { maximized: true })
```

### 3. 在渲染器中订阅

```ts
import { useIpcOn } from '@renderer/ipc/useIpcOn'

useIpcOn('window.maximized_changed', ({ maximized }) => setMax(maximized)) // cleanup is automatic
```

在 React 之外，使用命令式：

```ts
const unsubscribe = ipcApi.on('window.maximized_changed', (p) => { /* ... */ })
```

## 处理程序：纯函数与服务委托

|能力|处理者居住的地方|
|---|---|
|小型无状态逻辑（应用程序信息、字体列表）|直接在 `handlers/` 中使用纯函数 — 无需服务|
|生命周期服务（MCP / Knowledge / Window — 注册于 `serviceRegistry.ts`）|`handlers/` 中的处理程序，通过 `application.get('XxxService').method()` 进行委托；业务逻辑和资源生命周期留在服务中|
|非生命周期模块（文件主题、`printService`、`regionService`）|`handlers/` 中的处理程序，导入模块的精选条目（主题桶或直接导入单例）并委派 - 不存在 DI 句柄，也不应制作任何句柄|

`handlers/` 目录是渲染器可以达到的每个主要功能的单一审核列表。

## 测试

测试 **处理程序**，而不是架构。每个域模式是一个薄结构契约（TS 类型的运行时镜像），因此断言 `z.boolean()` 拒绝字符串，或者 `z.infer` 产生 `boolean`，仅重新测试 zod。合约已经通过三种方式锁定：

1. 编译时 `IpcHandlersFor<typeof schemas>` — 每个路由都需要一个处理程序，没有额外的东西；
2. `z.infer` 驱动处理程序签名和渲染器调用类型 - 不匹配是编译错误；
3. 单一框架类型测试 (`src/shared/ipc/__tests__/schema.types.test.ts`) 练习一次可重用的 `IpcHandlersFor` 泛型。

因此，对处理程序 (`src/main/ipc/handlers/__tests__/<domain>.test.ts`) 的真实行为进行单元测试 — senderId 路由、空窗口回退、服务委托 — 并且不要**添加每个域的 `schemas/__tests__`。业务验证属于 handler/service，而不是模式，因此具有值得有效测试的自定义逻辑的模式永远不会出现；如果出现真正的自定义 `.refine` 谓词，请将该谓词作为普通函数而不是通过模式进行测试。

## 高频/主题流

令牌流和文件树突变**不**经过`broadcast`。拥有的服务保留一个侦听器注册表（保留其批处理）并将每个主题的 `send(windowId, …)` 定向到附加的窗口 - 避免广播热门事件的 O(windows × frequency) 扇出。请参阅迁移指南（B 类）。

两个方向在负载下发散：

- **M→R高频**停留在IpcApi中——它的传输已经是单向`webContents.send`，因此频率不需要额外的往返费用；只需使用定向 `send` + 批处理（上面）。
- **R→M 高频**（每帧，e.g。选项卡拖动窗口移动）没有这样的运气 - R→M 是 __PH1__/__PH2__，因此罕见的每帧通道可能会通过逃生舱口离开 IpcApi。请参阅[迁移指南](./ipc-migration-guide.md#escape-hatch--when-a-channel-may-stay-out)。
