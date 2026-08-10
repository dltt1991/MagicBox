# 命名规范

> 版本：1.1
> 最后更新：2026-06
> **本文档是权威来源。`CLAUDE.md` 仅链接至此。**

本文档定义了 Magic Box monorepo 中文件、目录和标识符的命名规则。它同时编码了行业共识（React/TypeScript、Node.js、shadcn/Next.js）与项目特有的约定。

---

## 目录

1. [快速参考](#1-快速参考)
2. [核心原则](#2-核心原则)
3. [文件命名](#3-文件命名)
4. [目录命名](#4-目录命名)
5. [标识符命名](#5-标识符命名)
6. [边缘情况](#6-边缘情况)
7. [决策树](#7-决策树)
8. [Lint 强制约束](#8-lint-强制约束)
9. [附录：参考资料](#附录参考资料)

---

## 1. 快速参考

覆盖 90% 的场景。完整规则与边缘情况见后续章节。

| 你要命名的对象 | 约定 | 示例 |
|---|---|---|
| 业务 React 组件文件 | `PascalCase.tsx` | `Sidebar.tsx` |
| `packages/ui/` 中的 shadcn 组件文件 | `kebab-case.tsx` | `button.tsx`、`input-group.tsx` |
| Hook 文件 | `useXxx.ts`（camelCase，`use` 前缀） | `useChatContext.ts` |
| 工具 / 函数文件（以函数作为默认导出） | `camelCase.ts` | `markdownConverter.ts` |
| 以类作为默认导出的文件 | `PascalCase.ts`（与类名一致） | `KnowledgeService.ts`、`IpcChannel.ts` |
| 测试文件 | `*.test.ts(x)` | `mcp.test.ts` |
| 配置文件 | `*.config.ts` | `vitest.config.ts` |
| 类型声明 | `*.d.ts`（小写 / kebab） | `env.d.ts` |
| 顶层元文档 | `UPPERCASE.md` | `README.md`、`CLAUDE.md` |
| 普通文档 | `kebab-case.md` | `database-testing.md` |
| npm 包目录（`packages/*`） | `kebab-case` | `ai-sdk-provider/` |
| 业务 React 组件目录 | `PascalCase` | `CodeEditor/` |
| 桶目录（分类容器） | camelCase，**复数**名词 | `services/`、`utils/`、`hooks/` |
| 业务 / 领域模块目录 | `camelCase` | `apiServer/`、`fileProcessing/` |
| 功能模块目录（大型、多文件领域） | `features/<camelCase>/` | `features/apiGateway/` |
| `packages/ui/` 目录 | `kebab-case` | `primitives/`、`button-group/` |
| `src/renderer/routes/` 下的 TanStack 路由文件 | `kebab-case.tsx` | `api-server.tsx`、`quick-assistant.tsx` |

> 有状态的单例能力只使用 `Service`（默认）或 `Manager`（实例池）后缀；多实例辅助类不带后缀 —— 见 §5.2。放在任何 `utils/` 目录内的文件去掉 `Utils` 后缀 —— 目录本身已经声明了这一角色；见 §3.2。

---

## 2. 核心原则

以下三条规则在与下文任何具体表格冲突时优先：

1. **一致性优先于风格选择。** 一个始终如一地使用「次优」约定的目录，比一个混用两种「正确」约定的目录更健康。
2. **跨平台大小写安全。** 绝不依赖大小写来区分两个文件（例如同一目录下的 `Foo.ts` 和 `foo.ts`）。macOS/Windows 默认大小写不敏感，Linux 大小写敏感。混用会破坏 CI。
3. **工具链约束优先。** npm 包名、shadcn CLI 约定和 Next.js 路由规则是硬性要求 —— 它们优先于风格偏好。

---

## 3. 文件命名

### 3.1 React 组件文件（`.tsx`）

| 位置 | 约定 | 理由 |
|---|---|---|
| `src/renderer/components/**` | `PascalCase.tsx` | 文件名映射导出的组件名。 |
| `src/renderer/pages/**` | `PascalCase.tsx` | 文件名映射导出的组件名。 |
| `packages/ui/**`（源自 shadcn） | `kebab-case.tsx` | shadcn CLI 为跨操作系统文件解析所要求。 |

无论文件名风格如何，组件的**导出标识符**始终为 `PascalCase`：

```tsx
// packages/ui/src/components/primitives/button.tsx
export function Button() { /* ... */ }

// src/renderer/components/Sidebar.tsx
export function Sidebar() { /* ... */ }
```

### 3.2 TypeScript 源文件（`.ts`）

根据**文件的默认 / 主要导出是什么**来选择：

| 主要导出 | 约定 | 示例 |
|---|---|---|
| Hook 函数（`useXxx`） | `camelCase.ts`，必须以 `use` 开头 | `useShortcuts.ts` |
| 普通函数或函数组 | `camelCase.ts` | `markdownConverter.ts`、`fileOperations.ts` |
| 类（尤其是服务） | `PascalCase.ts`（与类名一致） | `KnowledgeService.ts`、`IpcChannel.ts`、`WindowManager.ts` |
| 仅常量 / 枚举 | `camelCase.ts` | `errorCodes.ts` |
| 重导出 barrel | `index.ts` | — |

**注意：** 依据 §4.6，`packages/ui/` 下的文件无论导出类型如何都使用 `kebab-case.ts`（例如 `use-dnd-reorder.ts`、`reorder-visible-subset.ts`）—— 该作用域特定规则优先于本节。导出的标识符（例如 `useDndReorder`）仍为 `camelCase`。

**在任何 `utils/` 目录内** —— 目录已声明角色，因此文件名不再重复：

```
utils/assistant.ts   ✅
utils/model.ts       ✅
utils/notesTree.ts   ✅
```

只有当文件位于任何 `utils/` 目录之外时，才使用 `*Utils` 后缀。

**Hooks（`useXxx.ts`）** —— 放在 `src/renderer/hooks/`（默认，可按功能分入子文件夹），或与使用它的功能就近放置。

**围绕 `window.api.*` 的渲染进程包装器** —— 渲染进程不使用 `*Api`、`*Client` 或任何其他 IPC 包装器后缀。按 §5.2 依模块形态对包装器进行归类。

**下划线前缀文件（`_xxx.ts`）** —— 在资源文件目录内（每个资源/领域一个文件，例如 `db/schemas/`、`api/schemas/`），以 `_` 为前缀的文件是**跨资源共享构件，而非私有文件**。它承载被同级资源文件复用的辅助代码，并且被同级文件和外部消费者有意地深层导入。示例：`db/schemas/_columnHelpers.ts`、`api/schemas/_endpointHelpers.ts`。`_` 标记的是「它本身不是一个资源」，而绝不是「内部使用 —— 不要导入」。

### 3.3 测试文件

- **后缀**：`*.test.ts` 或 `*.test.tsx`。**不要**使用 `.spec.*`。
- **位置**：优先就近放在源文件旁的 `__tests__/` 子目录中。同目录内联（`foo.ts` + `foo.test.ts`）也可接受。
- **文件名主干**：与被测文件一致（`mcp.ts` → `mcp.test.ts`）。

### 3.4 配置文件

- 模式：`*.config.ts`（在不支持 TS 时使用 `*.config.js` / `*.config.mjs`）。
- 示例：`vitest.config.ts`、`electron.vite.config.ts`、`drizzle.config.ts`。

### 3.5 类型声明文件

- 模式：`*.d.ts`，全小写或 `kebab-case`。
- 示例：`env.d.ts`、`global-types.d.ts`。

### 3.6 Markdown / 文档

| 类型 | 约定 | 示例 |
|---|---|---|
| 仓库根目录的顶层元文档 | `UPPERCASE.md` | `README.md`、`CLAUDE.md`、`DESIGN.md`、`CONTRIBUTING.md` |
| 每个目录的 README | `README.md`（始终大写） | `src/main/core/paths/README.md` |
| 所有其他文档（位于 `docs/`、`packages/*/docs/` 等） | `kebab-case.md` | `database-testing.md`、`lan-transfer-protocol.md` |

### 3.7 JSON / YAML / TOML

- `package.json`、`tsconfig.json`：工具强制的名称，不要自定义。
- 项目特有的配置 JSON：`kebab-case.json`（`turbo.json` 是例外 —— 由工具强制）。

---

## 4. 目录命名

目录命名分为分类规则（§4.1–§4.3、§4.5–§4.7、§4.10）和横切规则：§4.4（文件 vs 子目录）、§4.8（顶层封闭）、§4.9（单数 vs 复数）。

> **范围之外 —— 资源文件。** `assets/**` 下的目录和文件（字体、图片、CSS、媒体）遵循路径/URL 约定（`kebab-case`），而非本节的代码模块规则。它们的名称绑定到 URL 和文件系统路径，而非代码标识符，因此改由 §2 原则 2（跨平台大小写安全）来约束 —— 第三方提供的字体文件也可保留其原始名称。

### 4.1 npm 包目录 —— `kebab-case`

`packages/*` 的目录名必须是 `kebab-case`。目录名必须与 `package.json` 中的 `name` 字段（去掉 scope 前缀后）相等。

```
packages/ai-sdk-provider/      ✅
packages/mcp-trace/            ✅
packages/extension-table-plus/ ✅
packages/somePkg/              ❌ (camelCase not allowed)
packages/SomePkg/              ❌ (PascalCase not allowed)
```

### 4.2 业务 React 组件目录 —— `PascalCase`

当一个目录**就是**一个组件时（即包含该组件的同名文件如 `Sidebar.tsx`，或将多个文件归入同一个组件名之下），使用 `PascalCase`。

```
src/renderer/components/Sidebar/         ✅
src/renderer/components/CodeEditor/      ✅
src/renderer/components/MarkdownEditor/  ✅
```

### 4.3 桶目录 —— `camelCase，复数名词`

「桶」= 容纳大量同类但彼此无关条目的分类容器。

```
services/   utils/   hooks/   components/   pages/   types/
```

桶名使用**复数**（跨所有目录类型的单数与复数规则见 §4.9）。大小写沿用与领域模块目录（§4.5）相同的 camelCase 体系；`services/`、`utils/` 等呈现为全小写只是巧合 —— 它们恰好是单个单词。多词的桶采用 camelCase 复数形式：`chatModels/`，绝非 `chatmodels/` 或 `chat-models/`。**不要**臆造 `Services/`（PascalCase）或 `helpers-and-utils/`（kebab）这类变体。

### 4.4 桶内的文件级组织 vs 子目录组织

在任何桶目录或领域目录内，**单个文件是默认选择**。只有当主题确实需要多个文件时才提升为子目录。

| 情形 | 布局 | 示例 |
|---|---|---|
| 一个文件即可表达整个能力 / 主题 | 一个 `.ts` 文件 | `services/CacheService.ts`、`utils/assistant.ts`、`hooks/useChatContext.ts` |
| 实现对单个文件而言过大，**或**该主题拥有若干应当放在一起的紧密关联产物（辅助代码、类型、子文件） | 一个归组这些文件的子目录 | `services/messageStreaming/`、`services/ocr/`、`utils/markdown/`、`hooks/translate/` |

不要为预期的增长预先创建子目录 —— 只有当第二个文件真正出现时才提升。

### 4.5 业务 / 领域模块目录 —— `camelCase`

当一个目录代表一个**具名领域**（拥有自身内部结构的内聚业务模块）时，使用 `camelCase`。

```
src/main/ai/streamManager           ✅
src/main/services/fileProcessing/   ✅
```

放置位置 —— 领域模块是作为顶层 `features/<domain>/` 存在，还是作为 `services/` 之类桶目录内的子目录 —— 由 §4.10 约束；本节只约束其名称。

### 4.6 shadcn / `packages/ui` 目录 —— `kebab-case`

`packages/ui/` 内的一切（文件和目录）都遵循 shadcn 约定：

```
packages/ui/src/components/primitives/        ✅
packages/ui/src/components/primitives/button-group/  ✅
```

### 4.7 约定强制的目录

这些目录的名称由工具或社区约定固定：

| 目录 | 用途 |
|---|---|
| `__tests__/` | 测试文件（Jest/Vitest 约定） |
| `__mocks__/` | Mock 文件（Jest/Vitest 约定） |
| `node_modules/` | 依赖（npm） |
| `dist/`、`build/`、`out/` | 构建产物 |

### 4.8 顶层目录 —— 默认封闭

以下各处的顶层目录集合：

- 仓库根目录 `/`
- `/src/`
- `/src/main/`、`/src/renderer/`、`/src/preload/`
- `/src/shared/`

**默认是封闭的**。新增一个目录是一项结构性承诺。

**只有当 PR 描述同时论证了以下两点时，才可以新增顶层目录：**

1. **必要性** —— 没有任何现有顶层桶能在不损失语义的情况下承载这些新文件。
2. **完备性** —— 新目录有清晰的范围，符合 §4.3（复数桶）或 §4.5（单数领域模块）的形式，且与任何现有桶不重叠。

若二者中任一存在疑问，就把文件放进现有的桶。现有桶下的子目录不受限制。

关于该规则在各根目录下的具体应用，见 [主进程架构 §4](./main-process-architecture.md)（`/src/main/`）、[渲染进程架构 §6](./renderer-architecture.md)（`/src/renderer/`）以及 [共享层架构 §2](./shared-layer-architecture.md)（`/src/shared/`）。

### 4.9 单数 vs 复数

依据目录**在概念上容纳什么**来选择单复数，而不是依据哪个听起来更顺口。

| 目录角色 | 单复数 | 示例 |
|---|---|---|
| **集合桶** —— 容纳大量同类条目 | **复数** | `services/`、`utils/`、`hooks/`、`components/`、`pages/`、`types/`、`models/`、`shortcuts/`、`agents/` |
| **命名空间 / 主题** —— 代表一个主题领域，而非一个集合 | **单数** | `config/`、`data/`、`auth/`、`api/`、`ipc/`、`file/` |
| **业务 / 领域模块** —— 具名的动作或概念 | **单数**（默认） | `apiServer/`、`fileProcessing/`、`webSearch/`、`bootConfig/` |
| **组件目录**（目录 = 组件） | 跟随**组件名** | `Avatar/`、`CodeEditor/`（单数组件）；`SearchResults/`（代表一组的组件） |

决策规则：问「这个目录是否容纳**很多个 X**？」—— 是 → 复数；否 → 单数。当两种解读都成立时，选择与该目录的**默认导入名**相符的那个（例如 `import { ... } from './config'` 搭配单数的 `config/` 读起来更自然）。

**同一词干、不同单复数 —— 按角色而非按词本身来决定。** 像 `agent` 这样的名称本身并无单复数属性；其单复数取决于目录所扮演的角色。上表中列出的 `agents/` 是**集合桶**的解读 —— 例如 `src/main/ai/agents/`，其中容纳了许多 agent 实现（`builtin/`、……）。当目录是一个功能**命名空间**、归组某一个功能的代码而非许多 agent 时，同一词干则为**单数** —— `src/renderer/hooks/agent/`（容纳 agent 功能的 hooks，而非多个 agent）和 `src/renderer/components/chat/agent/` 都是单数，与它们的同级命名空间（`hooks/chat/`、`hooks/tab/`、`hooks/translate/`）保持一致。把 `agents/` 这一条读成「*agent* 这个词永远是复数」正是陷阱所在：请对目录的实际内容套用决策规则。

### 4.10 功能模块 —— `features/` vs 类型桶

**功能模块**是位于某个进程根目录的 `features/` 桶下的自包含领域目录 —— `src/main/features/` 和 `src/renderer/features/` —— 它把一个领域拥有的*一切*就近放在同一棵树中：它的服务或组件、领域局部的 utils 和 hooks，以及任何适配器、路由或其他领域特有的辅助代码。
`features/` 本身就是一个桶（camelCase、复数，§4.3）；其中的每个模块都是一个 `camelCase` 领域目录（§4.5）。

**只有当领域大型、复杂且多文件时，才配得上一个 `features/<domain>/` 归宿** —— 仅有内聚性还不够。

| 该领域是…… | 归宿 | 布局 |
|---|---|---|
| 大型 / 复杂 —— 跨越多个关注点（例如一个服务外加它自己的适配器、路由、utils） | `features/<domain>/` | 自包含的目录树；服务类就位于其中（§5.2） |
| 无界面的多文件能力 —— 一个服务加上它的**私有、主题特定**的卫星文件（适配器、无状态辅助代码、按实例的类）；无 UI | `services/<topic>/` | 一个精心策划的 `index.ts` barrel；内部文件为私有，且豁免形态路由（[渲染进程架构 §3.1](./renderer-architecture.md)） |
| 一个内聚的服务，即便是领域特定的 | `services/<Domain>Service.ts` | 单个文件 —— 私有辅助代码保持**内联**；**通用**辅助代码 → `utils/<topic>.ts`；其第一个**主题特定**的卫星文件 → 长成 `services/<topic>/`（上一行） |
| 小型的跨领域 / 独立辅助代码 | `services/` 或 `utils/` | 单个文件 |

这就是 §4.4 的提升规则在顶层的应用：领域是逐级毕业的 —— 单个文件 → 一个 `services/<topic>/` 主题目录 → 它自己的 `features/` 模块 —— 只有当额外的文件真正出现并跨越多个关注点时才前进。
不要为一个预期中的模块预先创建 `features/<domain>/`。
`features/` 容纳高内聚的领域代码；其同级的类型桶（主进程中的 `services/` + `utils/`；渲染进程中的 `components/` + `hooks/` + `services/` + `utils/`）容纳达不到这一门槛的一切 —— 单文件部件和 `services/<topic>/` 能力。
一个大型、多文件的领域若散落在 `services/` 和 `utils/` 各桶之间、而未汇聚成一个 `features/<domain>/`，就是 §6.7 中的散落/不纯反模式。

**典型示例** —— `src/main/features/apiGateway/`：

```
features/apiGateway/
├── ApiGatewayService.ts   # the domain service (§5.2)
├── adapters/              # domain-specific sub-modules
├── middleware/
├── routes/
└── utils/                 # domain-local utils, not the global src/main/utils/ bucket
```

对于主进程，[主进程架构](./main-process-architecture.md) 讲解了 `features/` 与类型桶（`services/` / `utils/`）的取舍以及依赖方向；对于渲染进程，[渲染进程架构](./renderer-architecture.md) 把 `features/` 放在完整的分层中定位（windows → pages → features → components → packages/ui），并给出每个目录的职责与依赖规则。

---

## 5. 标识符命名

源代码内部的名称 —— 与文件名是彼此独立的维度。

| 标识符类型 | 约定 | 示例 |
|---|---|---|
| 组件、类、接口、类型别名、枚举类型 | `PascalCase` | `class KnowledgeService`、`interface UserConfig`、`type Status` |
| 变量、函数、方法、参数 | `camelCase` | `fetchUser`、`isReady` |
| Hook | `camelCase`，必须带 `use` 前缀 | `useChatContext` |
| 常量、枚举成员 | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT`、`IpcChannel.GetConfig` |
| 类的私有成员 | 不加 `_` 前缀；使用 `private` 修饰符 | `private cache` |
| 泛型类型参数 | `PascalCase`，尽量具有描述性 | `<TItem>`、`<TError>`（非平凡场景避免裸 `T`） |

### 5.1 标识符中的单数 vs 复数

| 标识符类型 | 单复数 | 示例 |
|---|---|---|
| 类、接口、类型别名、枚举类型 | **单数** | `User`、`OrderItem`、`LogLevel`（而非 `Users`、`OrderItems`） |
| 持有单个值的变量 / 属性 | **单数** | `const user = ...`、`currentOrder` |
| 持有集合（数组、`Map`、`Set`）的变量 / 属性 | **复数** | `const users = [...]`、`orderItems`、`connectedClients` |
| 布尔值 | 不用复数；使用 `is` / `has` / `can` / `should` 前缀 | `isReady`、`hasPermission`、`canEdit`、`shouldRetry` |
| 返回单个条目的函数 | **单数**动词短语 | `getUser(id)`、`findOrder()` |
| 返回多个条目的函数 | 名称中用**复数**名词 | `getUsers()`、`listOrders()`、`fetchPendingJobs()` |
| 改变集合的函数 | 动词 + 复数宾语 | `addUsers(...)`、`removeTags(...)` |
| 事件 / 处理器名称 | 跟随事件主体 | `onMessageReceived`（单个）、`onItemsLoaded`（多个） |

### 5.2 有状态单例能力的后缀 —— `Service`（默认） / `Manager`（实例池）

一个持有**留存的模块级状态、资源或生命周期**的模块 —— 即**单例能力** —— 必须实现为以单例方式管理的类（两种有效形式 —— 见下文），并且只能带以下两种后缀之一：

| 后缀 | 适用于该类…… | 示例 |
|---|---|---|
| `Service` | 提供一个内聚的**领域能力 / API 表面**。任何单例能力的**默认**选择。 | `CacheService`、`DataApiService`、`FileService`、`ExportService` |
| `Manager` | 拥有并协调一个**由许多同质实例构成的池 / 注册表**，且这种协调就是它的核心职责。 | `WindowManager`（窗口池）、`TabLruManager` |

**决策规则：** 问「这个类的主要职责是否是拥有并协调*一组许多同类实例*？」—— 是 → `Manager`；否则 → `Service`（不确定时的默认）。

`Service` / `Manager` 类应放在其领域归属所在之处（例如 `src/main/data/CacheService.ts`、`src/main/core/window/WindowManager.ts`）；并不要求放在 `services/` 之下。

**判据是有状态性，而非机制。** 模块作用域的可变绑定、闭包持有的注册表以及留存的顶层第三方实例（`const listeners = new Map()`、`export const emitter = new Emittery()`）与类字段完全等价 —— 应把它们规范化为「类 + 单例 + 后缀」的形式，而不是保留一个朴素名称：朴素的 camelCase 名称断言了无状态性（见下方路由表）。

**什么算作状态** —— **跨调用**留存、并会改变可观察行为的值。不算状态的：透明的性能缓存（只改变延迟的记忆化），以及局限于单个异步流程内的瞬时中间值（例如在一次操作内注册并移除的监听器）。

**多实例辅助类不带后缀。** 一个拥有按实例状态、由其消费者实例化的类（分词器、传输层、订阅 —— `ShikiStreamTokenizer`、`IpcChatTransport`、`TopicStreamSubscription`）不是单例能力：请给它一个朴素的 `PascalCase` 描述性名词。后缀标记的是单例能力这一**角色**，而非是否存在字段。

**无状态模块在本规则下不应成为类** —— 纯函数集合、查询、转换以及无留存状态的 SDK 包装器，都保持为朴素模块，不接受 `Service` / `Manager` 后缀。

**如果一个模块看起来想成为 `Service`，但并不是有状态的单例能力，就对它进行路由 —— 先看归属，再看形态。** 恰好只被**一个**所有者消费的模块应与该所有者就近放置（功能模块内部文件，或 `services/<topic>/` barrel 之后的私有卫星文件 —— [渲染进程架构 §3.1](./renderer-architecture.md)、[主进程架构](./main-process-architecture.md)），并跳过此表。该表路由的是**共享**模块；无状态的共享模块默认归入 `utils/`：

| 模块的实际形态 | 正确归宿 | 命名 |
|---|---|---|
| 无状态辅助代码 —— 计算值（查询、转换、谓词、格式化器）；经由向下的基础设施（`data` / `ipc`）进行**读取**是可以的 | `utils/`（或功能局部的 `utils/` 子目录）—— 无状态共享模块的**默认** | `<topic>.ts`（camelCase；无 `Utils` 后缀 —— 见 §3.2） |
| 带**对外副作用**的无状态模块（打开窗口 / 弹窗、写剪贴板、触发应用事件、执行 `data` / `ipc` **写入**、驱动其他子系统；日志记录不算）—— 或因**依赖被迫**移出 `utils/`（必须导入 `services/`，而 `utils/` 不允许） | `services/`（或功能局部的 `services/`）—— 在 PR 中说明理由 | `<topic>.ts`（camelCase；**无** `Service` 后缀 —— 它不是有状态的类） |
| 多实例的有状态辅助类 | 与其消费者就近放置（主题目录 / 功能模块），或 `services/` | `PascalCase` 描述性名词，**无后缀**（`IpcChatTransport`） |
| 依赖 React 生命周期 / 状态 / context | `hooks/`（或与使用它的功能就近放置） | `useXxx.ts`（`use` 前缀即角色标记 —— 见 §3.2） |
| 渲染 JSX / 拥有视图标记 | `components/`（共享）或 `pages/`（绑定路由） | `Xxx.tsx`（PascalCase —— 见 §3.1） |
| 对 `window.api.*` 的单次调用式透传 | 内联在调用处 | （无文件） |

#### `Service` 的两种有效形式

`Service` 后缀命名的是一种**角色**（有状态的领域能力），而非一种**机制**。配得上该后缀的类可以用以下任一方式实现：

| 形式 | 模式 | 使用场景 |
|---|---|---|
| 生命周期服务 | `@Injectable('XxxService')` + `extends BaseService`，通过 `application.get('XxxService')` 访问 | 该服务持有长期存活的资源，或注册了持久的副作用 |
| 直接导入的单例服务 | `export const xxxService = new XxxService()` | 无长期存活资源、无持久副作用，但仍有类级状态（例如缓存的 SDK 实例） |

二者之间的选择标准定义在 [`docs/references/lifecycle/lifecycle-decision-guide.md`](../lifecycle/lifecycle-decision-guide.md)。

### 5.3 Drizzle Schema 推断出的行类型

`src/main/data/db/schemas/` 中的每个 Drizzle 表都使用 **`Row` 后缀**形式导出其推断出的 select/insert 类型：

| 推断来源 | 类型名 | 示例 |
|---|---|---|
| `xxxTable.$inferSelect` | `XxxRow` | `AgentRow`、`McpServerRow` |
| `xxxTable.$inferInsert` | `InsertXxxRow` | `InsertAgentRow`、`InsertMcpServerRow` |

```ts
export const mcpServerTable = sqliteTable('mcp_server', { /* ... */ })

export type McpServerRow = typeof mcpServerTable.$inferSelect
export type InsertMcpServerRow = typeof mcpServerTable.$inferInsert
```

`Row` 命名的是原始数据库行，并有意与该行在共享层中被映射成的 API 实体类型（`XxxEntity`，例如 `WorkspaceEntity`）区分开来。`Xxx` 词干与由表名派生的 `xxxTable` 常量保持一致（见 §3.2），因此 `agent_workspace` → `agentWorkspaceTable` → `AgentWorkspaceRow` / `InsertAgentWorkspaceRow`。

**不要**使用此前曾在此并存的备选方案：`XxxSelect` / `XxxInsert`、`Xxx` / `NewXxx`，或 Drizzle 文档风格的 `SelectXxx` / `InsertXxx`。选择 `Row` 后缀而非 Drizzle 文档形式，正是为了让数据库行类型与 API 的 `XxxEntity` 类型在视觉上保持分离。

---

## 6. 边缘情况

### 6.1 首字母缩略词与缩写

当缩略词（API、URL、ID、HTTP、MCP、AI）出现在 `PascalCase` 或 `camelCase` 内部时：

- **首字母大写，其余小写** —— `HttpClient`、`UserId`、`ApiServer`、`McpService`。
- **绝不全大写** —— 禁止 `HTTPClient`、`UserID`、`APIServer`。
- **位于 `camelCase` 开头时** —— 全部小写：`httpClient`、`userId`、`apiServer`。
- **同样的形式适用于文件名** —— `McpService.ts`，而不是 `MCPService.ts`。

### 6.2 仅大小写不同的重命名

macOS 上的 `git` 默认 `core.ignorecase=true`，会静默吞掉纯大小写变更的重命名。请始终使用两步法：

```bash
git mv Foo.tsx _tmp_foo.tsx
git mv _tmp_foo.tsx foo.tsx
```

### 6.3 仅大小写不同的两个文件

禁止。同一目录下的 `Button.tsx` 和 `button.tsx` 会在大小写不敏感的文件系统上出问题。

### 6.4 Barrel / Index 文件

**barrel** 是一个 `index.ts`（始终小写），其唯一职责是重导出目录的公共界面。它不是一种便利手段：它**声明了一个封装边界** —— 该目录的其他文件是私有的，每个外部导入方都必须经过 barrel。本节是全部四个进程中 barrel 的唯一权威；各进程文档（[共享层 §3.1](./shared-layer-architecture.md)、[主进程 §2.1](./main-process-architecture.md)、[渲染进程 §3.1/§5](./renderer-architecture.md)）*应用*它，而不重述它。

**`index` 这个文件名保留给 barrel，且 barrel 始终是 `index.ts`。** 目录自身的实现 —— 包括其主组件 —— 放在具名文件中（`RichEditor.tsx`，绝不是 `RichEditor/index.tsx`）；纯重导出没有 JSX，因此 barrel 绝不是 `.tsx`。因此 `index.tsx` 永远是一种违规，没有例外：它要么是应为 `.ts` 的 barrel，要么是应放入具名文件的实现，要么是应使用扁平点号形式的 TanStack index 路由（`<segment>.index.tsx`，§6.6）—— 在那里 `index` 这个记号是路径段，而绝不是文件名。

规则 1–3 由 lint 强制；规则 4 是评审判断。

1. **只做重导出** —— 显式的具名重导出，别无其他：没有 `export *`，没有 `export default` 实现，没有本地声明，没有逻辑。（`export *` 会摧毁精心整理的界面和 tree-shaking；承载逻辑的 barrel 是一个披着门牌名字的模块。）
2. **强制的唯一入口，否则不要 barrel** —— 只有当 lint 禁止外部代码深层导入该目录内部时，barrel 才是真实的。**内部无法被封闭的目录不应拥有 barrel**：一扇不被强制的门比没有门更糟 —— 需要维护两个入口界面，而泄漏还会回来。
3. **不得嵌套** —— barrel 不得重导出另一个 barrel。仅仅聚合若干独立子模块的父目录不设 barrel；每个内聚的子单元拥有自己的 barrel。（因此桶根 `types/`、`utils/`、`services/` 没有根 `index.ts` —— §4.8。）
4. **一个内聚单元，而非聚合器** —— barrel 的导出是消费者作为一个整体取用的、彼此关联的 API。承载若干被独立消费的关注点的目录应拆分为多个边界，或降级为无 barrel 的容器。这一点无法由 lint 检查 —— 属于设计判断。

> **与 tree-shaking 正交。** barrel 卫生能限制泄漏，但不能替代根 `sideEffects`：一个符合规则的 barrel 若同时导出一个轻量和一个重量符号，除非打包器能证明无副作用，仍会把重量子图拖进轻量消费者。两者是独立的层；两者都需要。

> **开发构建不做 tree-shaking。** 在开发模式下，导入一个符号会加载 barrel 所能触及的每个模块，无论是否符合规则。规则 4 正是限制这一成本的手段 —— 内聚的 API 本就是整体消费的；当某个重量成员损害了轻量消费者时，请拆分边界或在调用处做代码分割 —— 而绝不要绕过门去深层导入。

> **动态 `import()` 也是导入。** 规则 2 照常适用：跨边界的懒加载要经由 barrel 进入，而绝不经由内部文件；只有边界内部的代码才可以懒加载其自身内部。（渲染进程 §5 给出了 `React.lazy` 形式。）

### 6.5 目录名 vs 包名

在 `packages/*` 中，目录名与 `package.json#name`（去掉 scope 后）必须完全一致。重命名其中之一就要求重命名另一个。

### 6.6 TanStack Router 基于文件的路由

`src/renderer/routes/` 下的文件**和目录段**均为 **kebab-case** —— TanStack Router 将每个路径段直接映射为一个 URL 段。

保留记号（由 TanStack 定义）：

| 记号 | 含义 |
|---|---|
| `__root.tsx` | 根布局 |
| `<segment>.index.tsx` | Index 路由 —— 始终使用扁平点号形式（`settings.index.tsx`）；即使在这里，裸 `index.tsx` 也被禁止（§6.4） |
| `$<param>.tsx` | 动态段（例如 `$appId.tsx`） |
| `$.tsx` | 通配捕获 |

### 6.7 桶反模式

当**任意**以下情况累积时，桶目录就在向不健康漂移：

1. **承载许多同类条目的目录用了单数名** —— 本应是 §4.3 的桶，却被误分类为 §4.9 的命名空间。
2. **内容不纯** —— 桶内的文件与该桶声明的类型不匹配（例如一个以某种 React 模式命名的目录，同时还承载并不使用该模式的包装组件）。
3. **稀薄的桶** —— 一个顶层桶长期只承载 0–2 个文件，通常是过早抽取；请重新考虑它是否应该是现有桶内的一个子目录（见 §4.8）。
4. **范围重叠** —— 两个顶层桶的名称都能合理地容纳同一个文件。其中之一是冗余的，或者边界定义不清。

出现上述任一信号都值得进行一次整合评审。

---

## 7. 决策树

```
命名一个新 FILE
├─ React 组件（.tsx）？
│  ├─ 位于 src/renderer/routes/？  → kebab-case.tsx  (api-server.tsx)
│  ├─ 位于 packages/ui/？              → kebab-case.tsx  (button.tsx)
│  └─ 位于 src/renderer/？         → PascalCase.tsx  (Sidebar.tsx)
├─ React hook？                    → useXxx.ts       (useShortcuts.ts)
├─ 主要导出是类？                  → PascalCase.ts   (KnowledgeService.ts)
├─ 主要导出是函数？                → camelCase.ts    (markdownConverter.ts)
├─ 类型声明？                      → *.d.ts          (env.d.ts)
├─ 测试？                          → *.test.ts(x)
├─ 配置？                          → *.config.ts
└─ 文档？
   ├─ 仓库根元文档？               → UPPERCASE.md    (README.md)
   └─ 其他？                       → kebab-case.md   (database-testing.md)

命名一个新 DIRECTORY
├─ npm 包（packages/*）？          → kebab-case      (ai-sdk-provider)
├─ 位于 packages/ui/？             → kebab-case      (primitives, button-group)
├─ 本身就是 React 组件？           → PascalCase      (CodeEditor)
├─ 桶/分类容器？                   → camelCase，复数名词  (services, utils)
├─ 大型/复杂的多文件领域？         → features/<camelCase>/  (apiGateway, §4.10)
├─ 业务领域模块？                  → camelCase       (apiServer, fileProcessing)
└─ 不确定单数还是复数？            → 见 §4.9
```

---

## 8. Lint 强制约束

`naming/path-case` 规则（`eslint.config.mjs` 中的内联插件，以 §6.4 的 barrel 规则为模型）按区域强制目录段和文件主干的**大小写**，在 `pnpm lint` / `test:lint` / `ci:basic-check` 中以 `error` 级别生效。其作用范围为 `src/**` 和 `packages/ui/**`。

### 8.1 已强制

大小写按区域检查；第一个匹配的区域生效。除 `packages/ui/` 之外的 `packages/*` 不做 lint —— pnpm workspaces 已经将包目录与其 `name` 绑定（§6.5）。

| 区域 | 目录段 | 文件主干 |
|---|---|---|
| `packages/ui/**` | kebab-case | kebab-case |
| `src/renderer/routes/**` | kebab-case（或 `$`/`_` TanStack 记号） | kebab-case（或 `$`/`_` 记号） |
| `src/main/**`、`src/shared/**`、`src/preload/**` | camelCase | camelCase 或 PascalCase |
| `src/renderer/**`（其余） | camelCase 或 PascalCase | camelCase 或 PascalCase |

**豁免**（两个维度都不检查）：点目录（`.storybook`、`.github`）、约定强制的 `__tests__` / `__mocks__` / `__snapshots__`（§4.7）、`*.d.ts` 文件（由 §3.5 管辖）、`index.ts(x)`（归 barrel 规则管辖，§6.4），以及不受管理的 `src/renderer/assets/**`（§4 范围之外说明）。

### 8.2 留给评审

该规则只在「路径 → 角色」为确定性时触发。它有意**不**裁决：

| 未强制 | 原因 | 权威 |
|---|---|---|
| 桶用**复数** vs 命名空间/模块用**单数** | 单复数是语义问题 —— 路径无法揭示「承载许多个 X」 | §4.9 |
| `src/main`/`shared`/`preload` 文件用 **PascalCase**（类/枚举）还是 **camelCase**（函数） | 取决于文件的主要导出，而非其路径 | §3.2 |
| 缩略词内部的大小写（`McpService`，而非 `MCPService`） | 该规则接受任意全字母序列 | §6.1 |
| Hook 的 `use` 前缀、`Service` / `Manager` 后缀 | 属于导出角色语义，而非路径大小写 | §3.2、§5.2 |

一个通过 lint 的名称仍可能违反上述规则 —— 它们仍属评审判断。

---

## 附录：参考资料

本文档提炼了以下来源的共识：

- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript) —— 文件名与默认导出一致
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [shadcn/ui conventions](https://github.com/shadcn-ui/ui) —— kebab-case 文件、PascalCase 导出
- [Next.js file-naming guidance](https://nextjs.org/docs)
- [typescript-eslint `naming-convention` rule](https://typescript-eslint.io/rules/naming-convention/)
