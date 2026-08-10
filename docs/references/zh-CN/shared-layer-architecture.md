# 共享层架构 (`src/shared` / `@shared`)

这是关于什么属于 `@shared`、如何组织以及保持顶层不扩散的规则的权威参考。它拥有 `@shared` 内部规则;[架构概述](./architecture-overview.md)、[渲染器架构](./renderer-architecture.md) 和 [命名约定](./naming-conventions.md) 引用它。

`@shared` 是**跨进程原语层**——[渲染器架构 §2](./renderer-architecture.md) 中的第 4 层。它不依赖于任何应用代码,可由 `main`、`renderer` 和 `preload` 导入。

## 1. 两个不变量

`@shared` 中的所有内容都必须满足**两者**,否则它不属于这里。

### 1.1 跨进程

一个模块属于 `@shared` 仅当 `main` 和 `renderer` **都**实际使用它时——包括类型,有一个刻意的例外:缓存模式注册表 (§1.1.1)。

- **为什么**:`@shared` 是跨进程边界共享的单一事实来源;单进程代码已经有一个进程可以存在。
- 仅从一个进程可达 → 它存在于该进程自己的层 (`src/main/*` 或 `src/renderer/{utils,hooks,services}`)。
- **不要投机性放置。** 如果某些东西只*可能*变成跨进程,首先在 `main`/`renderer` 中编写它,一旦它实际跨越就移到这里。不要为了可能性而将其停放在 `@shared` 中——常见的失败是添加类型或工具"以防万一",然后从未跨进程使用并留作垃圾。

#### 1.1.1 例外:缓存模式注册表

缓存子系统是 §1.1 的一个例外。每个缓存**键模式及其值类型**都存在于 `@shared/data/cache/`(`cacheSchemas.ts` + `cacheValueTypes.ts`)**无论哪个进程消费它**——包括仅渲染器类型 (`Tab`、`ChatScrollAnchor`、`AgentOpenExternalAppTarget`、…)。这里的仅渲染器缓存值类型是**符合的,不是 §1.1 违规**——不要标记或重定位它。仅限缓存子系统;§1.1 在其他地方适用。

### 1.2 无可变运行时状态

`@shared` 仅导出**类型、纯函数和不可变数据**。它**不导出类实例单例**(服务/管理器/注册表)以及持有运行时可变状态的任何内容。

- **为什么**:`main` 和 `renderer` 是独立的 V8 领域;一个 `@shared` 模块**每个进程加载一次**。"共享单例"是一个虚构——它悄悄地变成每个进程 N 个实例,这些实例会发散。可变状态没有连贯的共享所有者;它属于反映其生命周期和上下文的进程。
- **`new` 不是测试——运行时可变性 + 身份是。** `new` 仅允许构建不可变数据,然后冻结并导出(从静态数据构建一次且从不变异的 `Map` / `Set` / `RegExp` 查找,例如 `command/definitions.ts` 中的私有 `commandMap`)。
- 有状态类仅从 `@shared` 发送其**定义(蓝图)**;其**实例**是每个进程创建的。示例:`ContextKeyService` 是跨进程定义的,但 `new ContextKeyService()` 存在于渲染器的 `CommandContextKeyProvider` 中。

| 允许 | 禁止 |
|---|---|
| `type` / `interface` / `enum`,模式派生类型 | `export const x = new XService()`(任何导出的实例单例) |
| 纯函数、谓词、转换器 | 注册表/管理器/服务实例 |
| 不可变数据——常量、定义、通过 `new Map`/`Set` 构建的冻结查找 | 任何持有运行时可变状态的模块级值 |
| 有状态类**定义**(蓝图) | 这样一个类的活动**实例** |

## 2. 封闭的顶层集合

顶层是一个**封闭集合**——这是 [命名约定 §4.8](./naming-conventions.md)(顶层默认封闭)应用于 `@shared`。恰好这五个,按三个原则类别:

| 目录 | 类别 | 为什么它获得顶层家园 |
|---|---|---|
| `ai` | **核心领域** | Magic Box *是*一个 AI 产品;AI 的跨进程合约和纯逻辑是第一类(镜像 `src/main/ai/`)。仅保存 AI 的跨进程切片——而不是 AI UI 或每个进程的服务。 |
| `data` | **跨进程基础设施** | 数据层的跨进程合约:API 实体/请求类型、缓存/偏好/bootConfig 模式、迁移映射、预设。类似框架、领域不可知。 |
| `ipc` | **跨进程基础设施** | IpcApi 框架:路由 `define` 辅助程序、请求 + 事件模式、错误模型和共享类型 (`IpcContext`、`WindowId`)。领域不可知。 |
| `types` | **形状桶** | 没有单一所有者的跨进程类型声明。 |
| `utils` | **形状桶** | 跨进程纯逻辑及其支持常量和类蓝图。 |

**治理规则**:新功能**永远**不会获得新的顶层目录。它要么是 (a) 核心领域[仅 `ai`],(b) 真正的跨进程基础设施,要么 (c) **按形状**分解到 `types` / `utils`。其他任何东西 → `types` / `utils`。

命名尊重 [§4.9](./naming-conventions.md):`ai` / `data` / `ipc` 是单数命名空间,`types` / `utils` 是复数桶。

## 3. 形状:`types` vs `utils`

`@shared` 只有**两个**形状桶。没有 UI、没有 React 和没有每个进程的运行时,渲染器的丰富形状 (`components` / `hooks` / `services` / `pages`) 折叠为**声明 vs 纯逻辑**。

| `types/` | `utils/` |
|---|---|
| 类型别名、接口、枚举、模式派生类型 | 纯函数、谓词、转换器 |
| (加上类型需要的小常量) | 加上这些函数需要的常量/静态数据,以及有状态类蓝图 |

在两者之间路由遵循 [命名约定 §5.2](./naming-conventions.md) 按形状路由表。

### 3.1 文件 vs 子目录,以及桶

桶遵守 [命名 §6.4](./naming-conventions.md)(跨进程权威);本节仅涵盖 `@shared` 具体内容。

- **单个 `.ts` 文件是默认值。** 大多数主题是一个文件——`types/<topic>.ts`、`utils/<topic>.ts`,直接导入。仅当主题实际拥有多个文件时才提升为子目录 ([命名约定 §4.4](./naming-conventions.md));永远不要预先创建一个。
- **主题子目录恰好有一个 `index.ts`** 作为其公共 API——`types/<topic>/index.ts`、`utils/<topic>/index.ts`,显式命名导出,没有 `export *`。然后导入表面是相同的,无论主题是文件还是子目录 (`@shared/utils/<topic>` 无论哪种方式),子目录的其他文件在它后面保持私有。
- **桶根 `types/` 和 `utils/` 没有 `index.ts`。** 桶是一个类别,而不是一个模块——根桶重新导出每个文件不会购买聚合 API,只会在每次添加时添加混乱和导入循环风险。导入特定文件或主题,永远不要导入桶。
- **`types/` 没有运行时测试。** 声明桶没有要测试的运行时行为,因此 `types/` 下的*行为*测试 (`expect(fn(...))…`) 表明文件持有逻辑——谓词、类型守卫、转换器、工厂或函数——属于 `utils/`(按形状路由,§3)。将逻辑移至 `utils/<topic>.ts`(从 `types/` 导入它需要的类型,受祝福的 `utils → types` 方向),测试跟随它。类型守卫 (`x is T`) 也是运行时谓词——将它们与 `utils/` 中的逻辑共同定位,而不是与 `types/` 中的接口。从验证器函数 (`z.custom(isFoo)`) 构建的模式跟随函数到 `utils/`;纯声明性模式 (`z.object({…})`) 可以留在 `types/`。**唯一**属于 `types/` 的测试是**类型级测试** (`expectTypeOf` / `assertType`):它断言类型契约本身并且没有运行时要重定位。这样的测试是**过渡性守卫**——它仅在手写类型是真理来源时获得其位置;一旦运行时模式 (Zod / IpcApi) 拥有契约并且类型是 `z.infer` 派生的,模式自己的验证就包含它,类型级测试随该迁移退役。

### 3.2 常量和静态数据

- **默认:常量存在于其领域/主题单文件中**,在它所服务的逻辑旁边(AI 模型默认值 → `ai/`;文件类型列表 → `utils/file/`)。
- **`utils/constants.ts` 不是桶。** 它仅携带真正**全局、跨进程**的残余 (`KB`/`MB`/`GB`、`APP_NAME`)。仅当您 100% 确定常量是应用程序全局和跨领域时才添加到它;如果它属于任何领域,它就进入该领域的文件。——**为什么**:这正是旧的 `config/constant.ts` 缺少的防护栏,这就是它如何成长为 82 个导入器垃圾抽屉(现已解散——§6)。
- **单进程常量 → 离开 `@shared`**(不变量 1.1)。
- **没有 `config/` 桶。** 常量是数据;其领域文件(或 `utils/`)中的冻结值表达了 `config/` 目录所能表达的一切,而不会邀请无关的全局变量。

### 3.3 有状态类蓝图

有状态类的**定义**是纯代码,因此它驻留在 `utils/` 下的主题模块中——先例:`utils/blacklistMatchPattern.ts` 中的有状态 `MatchPatternMap` 类。`@shared` **没有 `services/` 桶**,因为服务是每个进程的(不变量 1.2)。

## 4. 放置决策

两个门,按顺序,然后分类:

1. **跨进程?** 由两个进程到达——否 → 它进入进程层 (`src/main/*` 或 `src/renderer/*`)。*(例外:缓存键的模式条目 + 值类型即使是单进程也留在 `@shared/data/cache/` 中——§1.1.1。)*
2. **无状态/不可变?** 没有导出的实例,没有可变状态——否 → 只有蓝图和静态数据留下;**实例**每个进程。
3. **分类**:核心领域 (`ai`) / 基础设施 (`data`、`ipc`) / 形状 (`types`、`utils`)。不是前两个之一 → 按形状分解为 `types` / `utils`;**永远不要**打开新的顶层目录。

## 5. 反模式

- **导出的实例单例**——`export const x = new XService()`,或任何注册表/管理器/服务实例。违反不变量 1.2。
- **`@shared` 中的单进程代码**——为方便而放置在这里的仅主进程或仅渲染器逻辑。违反不变量 1.1。*(前震中:现已解散的 `config/constant.ts`——§6。缓存模式注册表是唯一批准的例外——§1.1.1。)*
- **垃圾抽屉文件或目录**——一个 `config/` 桶或一个 `constant.ts` 在领域和进程中积累无关的全局变量。按领域 + 进程分解;不要作为 blob 重新定位。
- **每个功能的新顶层目录**——每个功能按形状分解;顶层是封闭的 (§2)。
- **`@shared` 中的有状态"服务"**——状态没有连贯的共享所有者;它属于 `main` 或 `renderer`。

## 6. 迁移(目标 vs 当前——推迟、跟踪)

结构分解**已完成**:`command`、`file`、`shortcuts`、`externalApp` 和 `config` 已从顶层解散——跨进程切片按形状进入 `types/` + `utils/`,单进程代码回到 `main`/`renderer`(不变量 1.1)——并且 `menuRegistry` 的导出实例被纯 `resolveMenu` 替换(不变量 1.2)。`config` 的约 82 个导入器 `constant.ts` 按领域 + 进程分解(文件扩展列表 → `utils/file/`,`KB`/`MB`/`GB`/`APP_NAME` → `utils/constants.ts`,终端/更新/OAuth/超时/窗口大小块回到其拥有的 `main`/`renderer` 模块);实际消费者进程按项目确认,而不是从方向计划信任(例如 `API_SERVER_DEFAULTS` 被证明仅渲染器,`MIN_WINDOW_*` 跨进程,`providers.ts` 仅渲染器)。`utils/index.ts` 桶根桶后来被拆分为主题文件 (§3.1)。随后的 `types`/`utils` 审计确认了下表中的单进程残余并删除了死代码 (`types/codeTools.ts` 的未使用 `LoaderReturn`,它也将 `@types` 渲染器导入拖入 `@shared`——现在消失的分层违规);`keywordSearch` 和 `SerializableSchema` 在 `main` 上看起来仅主进程/死代码,但针对 `feat/chat-page` 真理分支(渲染器 `GlobalSearch`、`renderer/types/serialize.ts`)证明是跨进程的并正确留下。稍后的传递清除了下面的三行——`searchSnippet.ts` 和 `pdf.ts` 移至 `src/main/utils/`(searchSnippet 是一个通用的、无 DB 的文本帮助器,因此它降落在 `main/utils/` 而不是最初铅笔写的 `data/services/utils/`),并且 `externalApp.ts` 的 `EXTERNAL_APPS` const 被内联到 `ExternalAppsService` 中——并将 `types/file`、`utils/file`、`utils/command` 和 `utils/api` 主题桶从 `export *` 切换到显式命名导出 (§3.1)。然后通过将每个部分路由到其真实家园来解决错误/可序列化集群:真正跨进程的 `SerializedError` 形状留在 `@shared/types/error.ts`,写入端 `serializeError` 移至 `src/main/ai/utils/`,AI-SDK 子类型/守卫家族——在 `@shared` 端死了并且被渲染器自己的副本约 98% 复制——与未使用的 `ProviderSpecificError` 一起删除(渲染器保留其活动并行副本)。剩余偏差:

| 区域 | 当前 | 目标 |
|---|---|---|
| `data/types/` 转换器/守卫——`coerceSearchRole`、`deriveRootSpanId`、`readCherryMeta`/`withCherryMeta`、`knowledge.ts` 字符串帮助器 | 存在于 `data` 类型桶中的逻辑;`data/types/__tests__/` 下的行为测试标记它 (§3.1,最后一段) | 未决问题:按形状路由将它们移至 `utils` 位置,但模式派生的守卫通常是共同定位的——决策推迟 |
| `IpcChannel.ts` | 根目录的 18 KB v1 通道枚举 | v1 遗留;随着 IpcApi 迁移退役通道折叠到 `ipc/` 中——不是此治理的一部分 |

## 7. 相关

- [架构概述](./architecture-overview.md)——进程模型和 `@shared` 一行摘要。
- [渲染器架构 §2–§3](./renderer-architecture.md)——层模型以及渲染器如何依赖 `@shared`;§6 拥有命令的**渲染器端**单元格(本文档拥有其 `@shared` 单元格)。
- [命名约定 §4.8](./naming-conventions.md)——顶层默认封闭(本文档是其 `@shared` 应用);§4.9 单数 vs 复数;§5.2 按形状路由。
