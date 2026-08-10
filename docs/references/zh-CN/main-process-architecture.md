# 主进程架构（`src/main`）

本文是 `src/main/` 组织方式的权威参考：每个顶层目录的用途、防止目录膨胀的规则，以及各目录之间的依赖关系。本文是 [渲染进程架构](./renderer-architecture.md) 和 [共享层架构](./shared-layer-architecture.md) 的主进程对等文档；跨进程全貌（进程模型、monorepo 树）见 [架构概览](./architecture-overview.md)。

顶层是一套**封闭、锁定的原则性分类**，而不是一个开放的模块列表。每个顶层目录只承载**一类内容**，且有其独特的存在理由。**该集合已锁定** — 新能力始终根据其性质归入现有分类，而不会新增顶层目录（§4）。

## 1. 封闭的顶层目录集合

恰好包含以下各项，每项有单一职责：

| 目录 | 分类 | 存在于顶层的理由 |
|---|---|---|
| `core` | **应用运行时** | 与业务无关的基础设施，只关注应用运行本身。判断标准：将 `core/` 迁移到另一个 Electron 应用中并加入其他业务代码，就能得到不同的应用。与业务无关是**必要条件，但不充分**：`core` 只包含应用无法运行的**不可移除**的底层 — 可移除的能力即便需要在启动早期执行，也应归入 `services/`（§4）。一类内容 — 应用底层：生命周期 / DI 容器、路径注册表、日志、窗口管理器、scheduler & jobs、preboot、诊断、安全原语（IPC 来源信任）。 |
| `ipc` | **跨进程边界** | Electron 定义性的进程间通信机制 — 特殊且重要，值得单独立项。统一为 **IpcApi**（schema + router + handler）：main 与 renderer 之间唯一类型化的边界。 |
| `data` | **数据层** | 通用业务数据存储 — 作为一等公民的数据层，因此独立存在。包含 DbService / CacheService / PreferenceService / DataApiService / BootConfig、DB schema 以及 v1→v2 迁移器（按设计会读取领域数据 — 临时的迁移代码）。详见 [数据系统参考](../data/README.md)。 |
| `ai` | **核心领域** | Magic Box *就是* 一个 AI 客户端，因此 AI 拥有独立的顶层目录：与 AI 本质相关的一切都在此（providers、中间件、MCP、agents、stream manager）。与 `@shared/ai` 镜像对应。 |
| `features` | **领域模块** | 业务领域，每个领域一个目录。复杂领域在 `features/<domain>/` 下聚合其自身的 services / utils 等。 |
| `services` | **业务服务** | 业务功能服务。简单服务是单个文件；较大的服务组织在自己的子目录中。 |
| `utils` | **无状态辅助函数** | 跨领域的无状态、与领域无关的函数，没有单一归属方。"无状态"是标准，而不是"纯函数"：辅助函数可以通过环境 `@application` / `@logger` 访问基础设施（§3）；它只是不拥有状态，不产生对外副作用（§2）。 |
| `i18n` | **主进程本地化** | Main 自己的 locale 目录（`locales/` 人工翻译 + `translate/` 机器翻译）及其 `t()` / `getI18n()` 解析器。这是对封闭集合经过深思熟虑的扩展（§4），与 `src/renderer/i18n/` 镜像对称，使每个进程拥有独立的 locale 目录；`utils/i18n/` 方案因破坏此跨进程对称性而被拒绝。 |

入口文件：`main.ts`（进程入口 — 执行 preboot，然后 `application.bootstrap()`；使用命名文件，因为按 [命名规范 §6.4](./naming-conventions.md) `index` 保留给 barrel）和 `ipc.ts`（旧版 IPC 注册，正逐步迁移到 `ipc/`）。

命名遵循 [命名规范 §4.9](./naming-conventions.md)：`core` / `data` / `ai` / `ipc` / `i18n` 是单数命名空间；`features` / `services` / `utils` 是复数桶。

```text
src/main/
├── main.ts      # 进程入口：preboot → application.bootstrap()
├── ipc.ts       # 旧版 IPC 注册（正逐步迁移到 ipc/）
├── core/        # 与业务无关的应用运行时（生命周期/DI、路径、日志、窗口、scheduler/job、preboot、安全）
├── ipc/         # IpcApi — main↔renderer 类型化边界
├── data/        # 数据层（DB/Cache/Preference/DataApi/BootConfig、schema、迁移）
├── ai/          # AI 子系统 — 产品的核心领域
├── features/    # 业务领域，每个目录一个（各自聚合其 services/utils）
├── services/    # 业务功能服务（单个文件，或一个子目录）
└── utils/       # 跨领域无状态辅助函数
```

## 2. `features` 与 `services`（归置）

`services/` 和 `features/` 是同一类内容 — 业务逻辑 — 只是规模不同。拆分遵循 [命名规范 §4.10](./naming-conventions.md) 中的跨进程规则：

- **晋升，而非默认——分步进行。** 一个小型自包含服务从桶根的单个文件开始 — `services/<Topic>Service.ts`（有状态的 `Service`/`Manager` 类用 `PascalCase` 匹配类名，[命名规范 §5.2](./naming-conventions.md)；**通用**辅助函数用 `utils/<topic>.ts` — **特定主题**的辅助函数在到达下面的子目录阶段之前保持内联）。当一个文件无法容纳时，先**就地**扩展为 `camelCase` 主题子目录 — `services/<topic>/`（包含 `<Topic>Service.ts` 及其辅助函数）——**而不是**直接升级为 feature。注意结构：**目录是主题名且不带 `Service` 后缀**（[命名规范 §4.5](./naming-conventions.md)）；只有类文件保留后缀（例如 `services/webSearch/WebSearchService.ts`）。只有当它成长为**大型多文件领域**（聚合自己的 services、utils 和辅助函数）时，才迁入 `features/<domain>/`（knowledge、apiGateway、fileProcessing）。不要为预期中的模块预先创建子目录或 feature。
- **`ai/` 不是普通 feature。** 它是产品的核心领域，拥有独立的顶层目录（§1）；它是基础性的，而不是众多领域之一。
- **按角色归置**（[命名规范 §5.2](./naming-conventions.md)）：拥有长期资源或持久副作用的有状态类 → 生命周期 `Service`（[生命周期参考](../lifecycle/README.md)）；无状态模块 → 默认 `utils/`，仅因**对外副作用**或被迫上移的依赖关系才晋升到 `services/`（§5.2 路由表）；大型领域 → `features/<domain>/`。**读操作不触发晋升** — 通过基础设施进行查询的辅助函数仍是辅助函数。

### 2.1 子目录与 barrel

单个 `.ts` 文件是默认方式；只有当一个主题确实拥有多个文件时，才将其升级为子目录。barrel 遵循 [命名规范 §6.4](./naming-conventions.md)（跨进程权威），在此应用于 `services/` 和 `utils/`：

- **桶根 `services/` 和 `utils/` 没有 `index.ts`。** 桶是分类，不是模块 — 导入特定文件或主题，而不是整个桶。
- **`services/<topic>/` 子目录恰好有一个 `index.ts`** 作为其公共 API（显式命名导出，不使用 `export *`）；其他文件通过它保持私有。
- **复杂的 `utils/<topic>/` 子目录同样只有一个 `index.ts`。**
- **原因：** 每个主题都通过单一公共入口导入 — 与单文件模块完全一致 — 使其内部文件保持私有，外部消费者无法深度导入。对于 `utils/`，文件和目录共享主题名，当文件扩展为目录时，说明符（`@main/utils/<topic>`）甚至保持不变。

（`features/<domain>/` 是同一单一入口思想在更高层的体现：消费者通过其一个公共入口导入领域，而不是其内部文件。）

## 3. 依赖方向

职责划分隐含了依赖方向；依赖流向与业务无关的基础：

- **基础** — `core/` 和 `utils/` 不携带任何业务知识；没有业务内容位于它们之下。
- **数据层** — `data/` 是位于基础之上的存储层。
- **业务层** — `ai/`、`features/` 和 `services/` 是业务层；它们**向下**依赖 `data/`、`core/` 和 `utils/`。
- **`ai/` 在业务层中是基础性的**：`features/` 和 `services/` 可以依赖它；它不得导入 feature。
- **Feature 领域相互隔离**：`features/<domain>/` 不得导入**同级** feature — 通过 `services/`、`ai/`、`data/` 或 `@shared` 共享。
- **`ipc/` 是边界适配器**：handler 保持精简（边界策略 + `IpcError` 映射 + 委托），通过两种方式调用业务代码 — 生命周期服务（注册在 `serviceRegistry.ts` 中）通过 `application.get('XxxService')` 解析，而非直接导入；非生命周期模块（无状态主题 barrel 或直接导入单例）通过其精心整理的入口导入，而仅为获取 DI 句柄而伪造生命周期服务是一种反模式。见 [Handler：纯函数 vs 服务委托](../ipc/ipc-usage.md#handler-pure-function-vs-service-delegate)。
- **不导入渲染进程代码**：`src/main` 和 `src/preload` 不得导入渲染进程代码。跨进程类型在 `@shared` 中，主进程专属类型在 `src/main` 中 — 归置规则见 [共享层架构](./shared-layer-architecture.md)。通过在 `src/main` + `src/preload` 中禁止 `@renderer` 的 ESLint `no-restricted-imports` 规则强制执行；§7 跟踪唯一的遗留例外。

有两个依赖**穿越所有**目录且**不是**分层边缘 — 它们是环境基础设施访问：`@logger`（日志）和 `@application`（DI 容器/服务定位器）。原始导入扫描显示几乎所有内容都"依赖 `core`"，仅仅是因为这两者；上述规则涉及的是领域间的直接模块导入。

目前还没有对上述**内部**方向边缘的自动化执行（不像渲染进程架构 §5 中为渲染进程提议的 `import/no-restricted-paths` 区域）；方向靠约定和代码评审维持。**外部** main↔renderer 边界（不导入渲染进程代码）*是*被强制执行的 — 见上述规则。

## 4. 顶层目录治理

> **顶层集合已封闭且锁定——将在 `src/main/` 下新增目录视为不可选项。** 这是 [命名规范 §4.8](./naming-conventions.md)（顶层目录默认封闭）的严格执行：§4.8 只在确实存在*必要性*（没有现有分类能容纳这些文件）和*完整性*的情况下才允许新增顶层目录，而 main 的分类已经覆盖了所有情况 — 因此新能力归入现有分类，而不会获得独立目录。唯一经过深思熟虑的扩展是 `i18n/`（§1），添加原因是让主进程拥有与 `src/renderer/i18n/` 对称的 locale 目录；这是有记录理由的受控例外，不是对规则的放宽。[渲染进程（§6）](./renderer-architecture.md) 和 [`@shared`（§2）](./shared-layer-architecture.md) 的顶层目录遵循同样的治理规则。

新能力**绝不**会获得新的顶层目录；按性质归置：

| 能力类型 | 归置 |
|---|---|
| 与 AI 本质相关 | `ai/` |
| 业务数据/存储 | `data/` |
| IPC 路由 | `ipc/`（IpcApi） |
| 与业务无关的**不可移除**应用运行时基础设施 | `core/` |
| 业务服务 | `services/` — 或 `features/<domain>/`（若为大型多文件领域） |
| 纯领域无关逻辑 | `utils/` |

## 5. 反模式

- 将业务代码（与 Magic Box *功能*相关的任何内容）放入 `core/` — `core/` 必须保持仅为应用运行时。
- `features/<domain>/` 导入**同级** feature（跨领域耦合）。
- `ai/` 导入 `features/`（核心领域向上依赖 feature）。
- 为单个能力开辟新的顶层目录（§4）。
- 通过临时存储散布业务数据而不使用 `data/` 子系统，或通过临时通道而不使用 `ipc/`（IpcApi）发出命令式指令。

## 6. 子系统参考

各子系统的深度内容在专用文档中；本页只负责目录布局，不在此重复子系统细节。

| 子系统 | 位置 | 参考文档 |
|---|---|---|
| 服务生命周期（IoC、分阶段 bootstrap） | `core/lifecycle/`、`core/application/` | [生命周期参考](../lifecycle/README.md) |
| 启动阶段（preboot / bootstrap / running） | `core/preboot/`、`core/application/` | [core/README](../../../src/main/core/README.md) |
| 窗口管理器 | `core/window/` | [窗口管理器参考](../window-manager/README.md) |
| Scheduler 与 jobs | `core/scheduler/`、`core/job/` | [Job & Scheduler 参考](../job-and-scheduler/README.md) |
| 路径注册表 | `core/paths/` | [paths/README](../../../src/main/core/paths/README.md) |
| IPC 来源信任门（`validateSender`） | `core/security/` | [IpcApi 概览 §安全](../ipc/ipc-overview.md#security--two-gates) |
| 数据系统（DB/Cache/Preference/DataApi/BootConfig） | `data/` | [数据系统参考](../data/README.md) |
| IPC（IpcApi） | `ipc/` | [IPC 参考](../ipc/README.md) |
| AI 子系统 | `ai/` | [AI 参考](../ai/README.md) |

## 7. 当前偏差（目标 vs 现状）

本页描述的是**目标**。当前代码尚未完全符合目标的地方，差距跟踪如下 — **本次不变更任何代码**。仅列出结构性偏差（封闭顶层集合 §4、桶 barrel §2.1、归置 §2）；逐文件的命名后缀审计（§5.2）不在此范围内。

| 领域 | 现状 | 目标 |
|---|---|---|
| `utils/index.ts` | 桶根的 `index.ts` 存放零散辅助函数（`debounce`、`makeSureDirExists`、`toAsarUnpackedPath`……）— §2.1 禁止的"杂物抽屉"根 barrel | 拆分为命名主题文件（`utils/<topic>.ts`）；`@shared` 已完成此操作 — 见 [共享层架构 §6](./shared-layer-architecture.md) |
| 旧版 `ipc.ts` | 进程根处的 v1 IPC 注册，与 IpcApi 共存 | 各领域逐步迁移到 `ipc/`（IpcApi），直到 `ipc.ts` 退役（§1） |

**按设计**存在的边缘**不是**偏差，特此省略：`data/migration/v2/` 迁移器读取领域数据（§1）以及从任何层级通过 `@logger` / `@application` 进行环境访问（§3）。

## 8. 相关文档

- [架构概览](./architecture-overview.md) — 进程模型、数据流、monorepo 树（本文的跨进程父文档）。
- [渲染进程架构](./renderer-architecture.md) / [共享层架构](./shared-layer-architecture.md) — 各进程的目录参考对等文档。
- [命名规范](./naming-conventions.md) — §4.8 封闭顶层、§4.9 单数/复数、§4.10 feature vs 类型桶、§5.2 按形态路由。
