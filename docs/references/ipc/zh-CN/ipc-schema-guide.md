# IpcApi 架构指南

## 文件组织

`src/shared/ipc/schemas/` 下每个域一个文件，每个文件分为两个块：

|堵塞|形式|方向|相信|
|---|---|---|---|
|请求 (`*RequestSchemas`)|zod **值** (`defineRoute`)|渲染器→主|不可信 → 已解析|
|事件 (`*EventSchemas`)|纯**类型**|主→渲染器|可信 → 未解析|

没有事件的域只是省略事件块。 `schemas/ipcSchemas.ts` 组成每个域的部分：

```ts
export const ipcRequestSchemas = { ...windowRequestSchemas, ...appRequestSchemas } satisfies Record<string, RouteDef>
export type IpcRequestSchemas = typeof ipcRequestSchemas
export type IpcRoute = keyof IpcRequestSchemas

export type IpcEventSchemas = WindowEventSchemas & AppEventSchemas
export type IpcEventName = keyof IpcEventSchemas
```

## 命名

|元素|规则|例子|
|---|---|---|
|路线名称|点 **snake_case** `namespace[.subdomain…].action`|`file.read_doc`、`window.main.set_minimum_size`、`ai.agent.task.create`|
|活动名称|点 **snake_case** `namespace[.subdomain…].event`|`window.maximized_changed`，`ai.stream.chunk`|
|有效负载字段|JS **camelCase** （蛇形仅约束 route/event 字符串）|`{ minWidth: number }`|
|请求 value/type|`*RequestSchemas` / `IpcRequestSchemas` / `IpcRoute`|`windowRequestSchemas`|
|事件contract/type|`*EventSchemas` / `IpcEventSchemas` / `IpcEventName`|`WindowEventSchemas`|

任何深度 ≥ 2 段都是允许的。一旦命名空间的路由属于不同的组，请添加子域 - 将**资源路径放在前面，将动词放在最后**（`ai.agent.task.create`，而不是`ai.create_agent_task`），并且永远不要使用下划线伪造级别（`ai.stream.open`，而不是`ai.stream_open`）。按**域分组，而不是按拥有服务**：`ai.tool.get_result` 和 `ai.tool.respond_approval` 共享子树，同时委托给不同的服务。现有子域树：`ai.*`、`mcp.{server,tool,package}`、`window.{main,sub}`、`system.{mac,shell}`、`app.{cache_cleanup,updater,data_reset,user_data_relocation}`、`channel.{feishu,wechat}`、`export.{obsidian,word}`。

点结构是一种命名约定，而不是类型语法 — `IpcRoute` 是强类型联合 `keyof IpcRequestSchemas`；未声明的路由是一个编译错误。对蛇形键重用首选项的 __PH2__/__PH3__ ESLint 规则。

> **ESLint 强制执行：** __PH0__/__PH1__ 规则的 `files` glob 包含 `src/shared/ipc/schemas/**/*.ts`，因此此目录中的每个 route/event 密钥都强制执行 lint，并且会自动覆盖任何新域文件。 zod *数据字段* 名称是豁免的 — `z.*(...)` 对象文字 (e.g.`z.object({ 'content-type': ... })`) 内的键被跳过，因此只有 route/event 字符串受到约束。这依赖于将 zod 导入为 `z` （回购协议）。

## 从模式派生的类型

|类型|意义|
|---|---|
|`defineRoute({ input, output })`|声明一条路线；运行时的身份，捕获 zod 模式|
|`InputFor<R>` / `OutputFor<R>`|全局路由 `R` 的解析输入/输出类型|
|`EventPayload<E>`|全局事件 `E` 的负载类型|
|`IpcHandlersFor<S>`|模式集 `S` 的详尽、封闭的处理程序映射|
|`IpcContext`|`{ 发送者 ID: 窗口 ID \|null }` — 处理程序的受控第二个参数|

__PH0__/__PH1__/__PH2__/__PH3__/__PH4__ 绑定到*全局*注册表，因此它们会解析为 `never`，直到至少迁移一个域。可重用推理 (`IpcHandlersFor<S>`) 是通用的，并且可以针对当今的任何模式集进行验证。

## zod 跨进程（关键）

Zod 模式是运行时值。

- **Main** (`IpcRouter`) 将 `ipcRequestSchemas` 作为 **值** 导入到 `parse`。
- **渲染器**必须仅从 `@shared/ipc/schemas/*` 模块和 `@shared/ipc/types` 中获取 `import type`。值导入会将整个 zod 模式集拉入渲染器包中。这是由 ESLint 规则（`@typescript-eslint/no-restricted-imports` 和 `allowTypeImports`，范围为 `eslint.config.mjs` 中的 `src/渲染进程/**`）强制执行的，该规则标记 `@shared/ipc/schemas` 下导入的任何值。 `IpcError` 是一个例外 - 它是一个值导入，但是没有 zod 依赖性的普通 TS，因此它是捆绑安全的。

验证始终开启：路由器 `parse`s 每个请求路由。没有跳过验证旋钮（仅当分析证明热路由需要时才添加字段）。

## 未经过单元测试

模式是薄结构契约，而不是行为——不要**添加每个域的 `schemas/__tests__`。断言 zod 原语（e.g.`z.boolean()` 拒绝字符串，或 `z.infer` 产生 `boolean`）仅测试 zod。正确性已由编译时 `IpcHandlersFor` 详尽性、`z.infer` 驱动 handler/渲染进程 类型以及单一框架类型测试 (`src/shared/ipc/__tests__/schema.types.test.ts`) 锁定。改为测试 **处理程序** — 请参阅 [ipc-usage.md](./ipc-usage.md#testing)。
