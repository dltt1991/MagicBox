# 渲染进程架构

本文是 `src/renderer/` 组织方式的权威参考：目录职责、依赖方向以及使规则可执行的保障措施。

渲染进程代码沿**两个正交轴**组织 — **类型**（产物是什么）和**领域**（哪个业务领域拥有它）— 依赖只能**严格向下**流动，且顶层是**封闭**的：没有任何能力会获得独立的顶层目录。

## 1. 两个轴

| 轴 | 回答的问题 | 取值 |
|---|---|---|
| **类型** | 这是什么类型的产物？ | page / component / hook / service / util / … |
| **领域** | 哪个领域拥有它？ | 特定业务领域（chat、knowledge、agent……）**\|** `shared`（无单一归属方） |

- `features/<domain>/` 是领域轴上的完整**行**：它跨越一个领域的所有类型列（其自身的 pages、components、hooks、services、utils）。这就是为什么 feature 是"跨切面的" — 它穿越所有类型桶。
- 顶层类型桶（`components/`、`pages/`、`hooks/`、`utils/`……）是**`shared` 行**的单元格：它们只承载跨领域/独立的剩余部分。
- 有意义的比较是**同列内的单元格对单元格**（`features/chat/components/` ↔ 顶层 `components/`），而不是 `features/` ↔ `components/`（这是分类错误：一行不是一个单元格）。

## 2. 层级与依赖方向

四个层级。依赖只能**向下**流动（1 → 2 → 3 → 4）。

| # | 层级 | 目录 | 角色 |
|---|---|---|---|
| 1 | **应用/组合** | `windows/`、`routes/`、顶层 `pages/`（仅跨领域外壳） | 入口点、provider 挂载、路由、应用外壳；组合 features |
| 2 | **领域** | `features/<domain>/` | 一个业务领域的垂直切片；与兄弟 feature 相互隔离（由上层的应用层消费） |
| 3 | **共享**（无单一归属方） | `components/` → `hooks/` / `services/` → `utils/` / `data/` / `ipc/` / `workers/`；以及 `i18n/` / `assets/` / `types/` | 跨领域可复用产物 |
| 4 | **原语** | `packages/ui`（`@cherrystudio/ui`）、`@shared`、`@logger` | 与应用无关的基础 |

规则：

- **沿类型轴**：`window → page → component → primitive`（UI 组合；详见 §2.1）。
- **沿领域轴**：领域行只能**向下**依赖 — 依赖共享层、原语和自身内部；它**绝不**导入兄弟领域行，共享层也**绝不**导入它（向上边缘）。其唯一合法的*消费者*因此是应用层（`windows/` / `routes/` / 顶层 `pages/`）：`window → feature` 和 `page → feature` 是合法的入站边缘 — feature 是为从上层导入而构建的。跨领域需求要么**向下**路由（将共享部分提取到共享层），要么**向上**路由（应用层组合两个 feature），绝不横向路由。
- **共享层内部**：`components`（UI）→ `hooks` / `services`（行为/运行时）→ `utils` / `data` / `ipc` / `workers`（无状态辅助函数 + 基础设施基础）→ 原语。基础成员（`utils` / `data` / `ipc` / `workers`）同级且可相互导入 — `utils` 模块调用 `data` / `ipc` 是**向下的基础设施调用，不是向上边缘**。没有任何共享模块渲染到、或从更高层（`components` / `hooks` / `services` / `features` / `pages`）导入。

**两个禁止边缘的重要性** — 两者都使依赖图保持严格向下的 DAG。`shared → feature`（向上边缘）会使*共享*模块被秘密地与领域耦合，开放 `feature → shared → feature` 循环，并将 feature 固定在预加载的共享块中（阻碍按 feature 代码分割）。`feature → feature`（横向边缘）会将一个领域的影响范围泄漏到另一个领域，将调用方绑定到 barrel（§5）声明为不稳定的内部，并阻止干净删除（v2 中 feature 会被重塑/移除）。两者都作为**类别**而非逐案禁止，因此一条 `import/no-restricted-paths` 规则可以强制执行（§5；来源在 §9）。

### 2.1 类型轴组合链

类型轴是严格的 UI 组合顺序：每种类型组合其下方的类型，绝不导入上方的类型。
它与领域轴（§1）正交 — `page` 可以是领域所有的（`features/<domain>/pages/`）或顶层外壳，但其组合规则相同。feature 内部的片段遵循与顶层对应物**完全相同**的类型轴方向规则；其唯一额外的自由是可以直接导入其**自身** feature 的兄弟（内部内聚性不需要 barrel — §5 的 barrel 只是*外部*的门）。

| 类型 | 组合/可导入 | 不得导入 |
|---|---|---|
| `window` | 路由、应用级 provider、pages、features、shared、原语 | —（没有人导入它） |
| `page` | components、feature 内容、shared、原语 | 另一个 `page`、`window` |
| `component` | 其他 components、原语、共享行为（`hooks` / `services` / `utils`） | `page`、`window`、`features` |
| `primitive` | 仅第三方 | 任何 `@renderer/*` / 应用层 |

**同类对等 vs 同切片隔离 — "同层"的两种含义。** 在同一类型内，对等体可自由组合：`component → component`、`hook → hook`、`util → util` 是正常边缘（component 由其他 component 构建）；类型轴只禁止**向上**导入某种类型（`component → page`/`window`/`feature`）。不要将此与**领域轴**规则混淆，后者禁止兄弟 *feature*（同一切片层，§2）相互导入 — `component → component` 允许，而 `feature → feature` 不允许，因为它们处于不同轴。两点补充：(a) `page` 是同类对等也被**禁止**的唯一类型（`page → page`，§7）；(b) 同类对等仍遵守领域轴 — 共享 component 仍不能向上访问 feature，也不能从 feature-A 的 component 横向访问 feature-B（§2）。`service` / `util` 对等在相同条件下允许，但必须保持**无环**。

**原语要求**（`packages/ui` 和 `@shared`）：

- `packages/ui`（`@cherrystudio/ui`）承载与应用无关的 UI 原语（Shadcn + Tailwind）。它只导入第三方包，**绝不**导入 `@renderer/*`；它不携带任何业务、领域或数据层知识。
- `@shared` 承载**跨进程**类型、契约和纯逻辑，可被 `main` 和 `renderer` 双方导入且不依赖任何应用层。**跨进程是进入的门槛，不是一种描述**：只能从一个进程访问的逻辑留在该进程自己的层。`@shared` 的内部布局、两个不变量（跨进程；无可变运行时状态）以及封闭顶层集合见 [共享层架构](./shared-layer-architecture.md)。
- 原语是叶子节点：所有内容都可以导入它们；它们不导入任何应用代码。

## 3. 目录职责

目标布局（待迁移的过渡目录列在 §8）：

```text
src/renderer/
├── windows/      # 应用      — 每个窗口的入口根（MainApp/SubWindowApp）+ 外壳
├── routes/       # 应用      — 路由定义
├── pages/        # 应用      — 仅跨领域外壳页面（领域页面位于 features 中）
├── features/     # 领域      — 每个目录一个业务领域
│   └── <domain>/ #             index.ts（唯一公共 API）+ pages/ components/ hooks/ services/ utils/
├── components/   # 共享      — 跨领域、感知应用、展示型 UI
├── hooks/        # 共享      — 跨领域 hooks
├── services/     # 共享      — 非组件单例/运行时逻辑
├── utils/        # 共享      — 跨领域无状态函数
├── data/ ipc/ workers/  # 共享基础设施 — 数据访问、IpcApi 桥、web workers
└── i18n/ assets/ types/ # 共享 — locale、静态资源、跨领域类型

packages/ui (@cherrystudio/ui)  # 原语 — 与应用无关的设计系统
src/shared                       # 原语 — 跨进程类型/契约/纯逻辑
```

| 目录 | 职责 | 可依赖（向下） | 不得 |
|---|---|---|---|
| `windows/` | 多窗口入口点；挂载 provider、路由、外壳 | 所有更低层级 | 被任何人导入 |
| `routes/` | 指向 pages 的路由定义 | features、shared、原语 | 被更低层级导入 |
| `pages/`（顶层） | **仅**跨领域外壳/组合页面；领域页面迁入 `features/<domain>/pages/` | features、components、shared、原语 | 导入另一个 `pages/<page>`（跨页面耦合） |
| `features/<domain>/` | 一个**业务领域**的垂直切片（其 pages/components/hooks/services/utils）；精心整理的 `index.ts` 是唯一公共入口。其**唯一**合法导入方是应用层（`windows`/`routes`/`pages`），通过 barrel | 共享层、原语、自身内部 | (1) 导入兄弟 feature (2) 被共享层或兄弟 feature 导入 (3) 承载非领域/跨切面/领域无关的基础设施 |
| `components/` | 应用级**共享 UI**：跨页面、无领域知识、感知应用、展示型 | packages/ui、其他 components、hooks、services、utils、@shared | 导入 features；导入 pages；拥有某领域的数据流 |
| `services/` | 应用级**运行时服务**：拥有保留状态/资源/生命周期的模块（单例能力 — 类 + 后缀，[命名规范 §5.2](./naming-conventions.md)），**或**因**对外副作用**或强制依赖从 `utils/` 晋升出来的无状态模块（路由流程见下）。多文件主题构成 barrel 之后的 `services/<topic>/`（§3.1）。普通模块，**无组件或 JSX**。无状态辅助函数**不会**仅因调用 `data` / `ipc` 读取而归属此处 — 应路由到 `utils/` | 其他 services、utils、data、ipc、@shared | 导入 features；导入 pages；导入 components；渲染 UI；调用 React hooks |
| `hooks/` | **跨领域**可复用 hooks | 其他 hooks、services、utils、data、@shared | 导入 features/pages/components；在某领域拥有自己的 feature 后仍保留该领域的 hooks（§4.1） |
| `utils/` | **跨领域**、**无状态**、领域无关的函数（查询、转换、谓词、格式化）— 可调用向下的基础设施 | 其他 utils、@shared、data、ipc、workers、第三方 | 导入 `components` / `hooks` / `services` 或任何更高应用层；拥有保留状态；产生对外副作用（路由流程见下）；渲染 UI |
| `data/`、`ipc/`、`workers/` | 基础子系统（数据层、IPC 桥、web workers） | utils、@shared | 导入 features/pages/components |
| `i18n/`、`assets/`、`types/` | 仅**应用全局**的 locale / 静态资源 / 共享类型；领域专属条目迁入所属 feature | — | 承载领域专属内容 |
| `packages/ui` | 与应用无关的设计系统（Shadcn + Tailwind 原语 + 通用组合件） | 仅第三方 | 导入任何 `@renderer/*` |

**路由 `services/` vs `hooks/` vs `utils/`。** 先归属，再形态 — 按顺序执行判断，命中第一条即停止：

0. **归属。** 恰好由**一个**归属方消费的模块与该归属方共置 — 在其 feature 内部，或作为 `services/<topic>/`（§3.1）中的私有卫星 — 并跳过下面的形态判断。形态路由只约束**共享**模块。
1. **渲染 JSX** → `components/` / `pages/`。
2. **使用 React 生命周期/状态/上下文** → `hooks/`。
3. **拥有保留的模块级状态/资源/生命周期** → `services/`，规范化为类 + 单例导出，带 `Service` / `Manager` 后缀（[命名规范 §5.2](./naming-conventions.md) — 包括什么算作状态）。
4. **无状态** → **默认 `utils/`。** 仅出于以下两个原因之一晋升到 `services/`（普通 camelCase 名称，**无**后缀），并在 PR 中说明：
   - **对外副作用** — 模块*改变*其自身作用域之外的内容（例如打开窗口、写入剪贴板；规范列表见 [命名规范 §5.2](./naming-conventions.md) — 日志不算）；
   - **依赖强制** — 它必须导入 `services/`，而 `utils/` 不允许。（需要导入 `hooks/` 从不是路由理由 — `utils/` 和 `services/` 都不允许；这意味着某个非 hook 导出被困在 `hooks/` 文件中 — 应在上游修复。）

**读操作不触发晋升**：调用 `data` / `ipc` 进行获取或查询的模块仍留在 `utils/`。
权威表格是 [命名规范 §5.2](./naming-conventions.md)。
这些顶层桶承载跨领域片段；小型**领域专属**片段可暂留此处，直到其领域获得 `features/<domain>/`，然后迁入（§4.1 晋升规则）。

**Providers。** React context provider 是**组件**，不是服务 — `services/` 只承载非组件逻辑。
应用级 provider（theme、command、context-key、notification）位于共享层（它们是组件），由 `windows/` 挂载（向下的 `window → component` 边缘）；领域所有的 provider 位于其 feature 中。
provider 的可复用非 React 逻辑属于 `@shared` 或 `services/`，而不是 provider 组件本身。

### 3.1 `services/<topic>/` 主题目录

超出单个文件的**无头**能力（无 UI）**就地**扩展为 `camelCase` 主题子目录 — `services/<topic>/` — 承载其公共门面及其**私有的、主题专属的卫星**（无状态辅助函数、每实例类、适配器、主题类型）。这是成长路径 `services/<topic>.ts` → `services/<topic>/` → `features/<domain>/`（§4.1）的中间步骤，也是永不发展出 UI 的能力的**终态**形式。现有成员：`services/aiTransport/`、`services/import/`、`services/notification/`。主进程适用同样的规则（[主进程架构](./main-process-architecture.md)）。

| 规则 | 含义 |
|---|---|
| 一个 barrel，唯一入口 | 恰好一个精心整理的 `index.ts`（§5 主题 barrel 规则）；其他一切对主题私有 |
| 卫星跳过形态路由 | 主题**专属**的辅助函数即便其形态指向 `utils/` 也留在此处 — §3 形态判断只约束**共享**模块；**通用**辅助函数（无主题上下文也读得通）仍归 `utils/` |
| 单一消费者，否则移出 | 卫星只在本主题是其唯一消费者时才留下；出现第二个消费者就移到 `utils/`（通用）或晋升进 barrel（主题公共 API） |
| 永不含 UI | 内部不含 JSX 和 React hooks；UI 部分按形态路由到共享桶（§3 / §6），领域只在 §4.1 触发条件成立后才晋升为 `features/<domain>/` |
| 普通内部名称 | 文件去掉主题前缀（目录已承载它）— `aiTransport/streamDispatchCoordinator.ts`，而非 `aiTransportStreamDispatchCoordinator.ts`；`Service` / `Manager` 后缀仍只标记有状态单例类（[命名规范 §5.2](./naming-conventions.md)） |

## 4. `features/` 定义

> `features/<domain>/` 是一个**自包含的业务领域模块** — 领域轴上的完整一行，将**一个**业务领域的 pages、components、hooks、services 和 utils 共置于单一树中，通过精心整理的 `index.ts` 暴露其公共 API。
>
> *自包含*描述的是**内部内聚性**（一个领域的所有部分位于一棵树中），**而不是**外部不可达：feature 会被应用层从上层公开导入（§2）。它只在**横向**上隔离 — 与兄弟 feature 隔离。

- **晋升，而非默认。** 领域只有在变得庞大且多文件后才获得 `features/<domain>/`；小型领域保持为共享桶中的单个文件。不要为预期中的模块预先创建 feature。操作性触发条件和实例见 **§4.1**。
- **仅业务领域。** 跨切面能力（例如 command/快捷键系统）、领域无关的基础设施（`data`、`ipc`）和应用外壳**不**位于 `features/` 中。
- **最接近的业界对应**是 bulletproof-react 的 `features/`（自包含领域文件夹）。它**不是** FSD 的细粒度"feature"（单个业务动作），也**不是** Nx 的 `type:feature`（将领域拆分到不同类型库的角色）。

### 4.1 晋升规则 — 领域何时获得 feature

晋升是**惰性且逐案**的（§4），不是默认行为 — 但它是真实路径，而不是注定空置的目录：上述规则描述的是目标*形态*。在领域符合条件之前，其片段合法地位于共享类型桶中（`pages/<domain>/`、`components/<domain>/`、`hooks/<domain>/`……）。（目前还不存在 `features/` 目录 — 见 §8。）

操作性触发条件（指导，非硬性门槛）— 当**全部**成立时晋升：

- 该领域已拥有**自己的页面**以及跨多个共享桶的**多文件** components/hooks/services 分布；
- 这些片段**主要在领域内部**被导入 — 广泛的跨领域复用反而是将某片段**向下**推入共享层的信号，而不是推入 feature；
- 将它们收拢到一个 barrel 之后会**减少**跨桶耦合，而不仅仅是重新定位它。

实例 — `chat` → `features/chat/`：

```text
# 当前散布（共享类型桶）                        # 晋升后
pages/home/           chat 页面外壳             features/chat/
components/chat/      ~288 个文件         →       ├── index.ts      # 精心整理的公共 API（命名导出，无 export *）
components/composer/  ~119 个文件                 ├── pages/        # ← pages/home
hooks/chat/                                       ├── components/   # ← components/chat + components/composer
services/…            仅 chat 使用的服务          ├── hooks/        # ← hooks/chat
                                                  └── services/     # ← 仅 chat 使用的服务
```

晋升后：应用层（`windows`/`routes`/`pages`）导入 `@renderer/features/chat` 的 barrel；没有人访问其内部（§5）；而*其他*领域也使用的跨界面运行时（例如 AI 流传输，现位于 `services/aiTransport`）留在**共享**层，**不**放入 feature 内部。

## 5. 公共 API 与边界强制

- **单一入口。** 每个 feature 恰好暴露一个精心整理的 `index.ts`（显式命名导出，**不使用 `export *`**）。外部消费者导入 barrel；禁止访问 feature 的内部文件。barrel 规则 — 包括*禁止嵌套*和*强制入口否则不设 barrel* — 是 [命名规范 §6.4](./naming-conventions.md) 中的跨进程规则集；本节是其 feature 层的应用。（VS Code 采用相同规则：一个 contribution 只能导入另一个的单一公共 `common/` API，绝不导入其内部。）
- **懒加载走同一道门。** 动态 `import()` 与任何导入一样遵守 [命名规范 §6.4](./naming-conventions.md) 规则 2：`React.lazy(() => import('@renderer/features/chat').then(m => ({ default: m.ChatPage })))` — 在调用处映射命名导出，而不是为了获取默认导出而深度导入内部文件。只有 feature 自己的代码可以懒加载其内部。
- **组件目录。** 单文件组件保持扁平（`components/Foo.tsx`，无目录）。只有当它拥有私有卫星（子组件、hooks、辅助函数、样式）时才升级为目录；此时主实现是**命名**文件，目录暴露一个 barrel 将卫星封闭。barrel 是 `index.ts` — **绝不是 `index.tsx`**：重新导出没有 JSX，因此组件的 `Foo/index.tsx` 是此处的典型双重错误（实现*且*错误的扩展名）。`index` 名称保留给 barrel（[命名规范 §6.4](./naming-conventions.md)）：

  ```
  components/Foo.tsx          # 单文件 → 扁平，无目录
  components/Bar/             # 多文件 → 命名实现 + barrel 门
    Bar.tsx                   #   主实现（绝不是 index.tsx）
    components/BarRow.tsx     #   私有卫星，由 barrel 封闭
    index.ts                  #   .ts，而非 .tsx（重新导出没有 JSX）：export { Bar } from './Bar'
  ```
- **共享桶不带根 barrel。** `types/`、`utils/` 和 `services/` 是*分类*，不是模块：各自**没有根 `index.ts`** — 消费者导入特定文件或主题（`@renderer/types/<topic>`、`@renderer/utils/<topic>`、`@renderer/services/<topic>`），绝不导入桶根。多文件主题*子目录*恰好暴露一个精心整理的 `index.ts`（命名导出，**不使用 `export *`**）并保持其他文件私有；单文件主题保持扁平的 `<topic>.ts`，只有当它确实拥有多个文件时才升级为子目录。这与 [共享层架构 §3.1](./shared-layer-architecture.md) 一一对应 — 同一规则，只是桶位于 `@renderer/*` 而不是 `@shared/*` 之下。
- **机械化强制。** 边界由 lint 强制执行，而不仅靠约定。已配置 `import/no-restricted-paths` 区域：`components`/`hooks`/`utils`/`services` 不得导入 `features`/`pages`；`pages` 不得导入另一个 `pages`；`packages/ui` 不得导入 `@renderer/*`。共享层边缘以 `error` 级别强制执行；兄弟页面（`pages → pages`）边缘在 features 化完成前保持 `warn`。

## 6. 顶层目录治理

> 顶层是一套**封闭的分类集合**，不是一个开放的模块列表。新能力通过沿类型轴分解放置在现有分类**内部**；它绝不会获得新的顶层目录。

这是 [命名规范 §4.8](./naming-conventions.md)（顶层目录默认封闭）在渲染进程的具体应用：能力无法通过 §4.8 的*必要性*判断，因为现有桶可以通过分解容纳它。

推论 — **能力会被分解，而不是作为整体迁移**：按形态路由每个部分（§3）— 非组件逻辑 → 按 §3 路由到 `services/` 或 `utils/`（若跨进程则 `@shared/`），React provider 和 UI → `components/`，hooks → `hooks/`，类型 → `@shared/`。顶层不新增任何内容。

这就是为什么 command/快捷键/菜单系统既不是 feature 也不是顶层目录：它**按形态**分解到现有归属，每种类型一个单元格：

| 部分 | 性质 | 归属 |
|---|---|---|
| 快捷键定义 + 解析、context 表达式求值、菜单解析、`ContextKeyService`/`MenuRegistry` 蓝图 | 跨进程纯逻辑 + 类蓝图 | `@shared/utils/command` |
| command / 快捷键 / 菜单类型 | 跨进程类型 | `@shared/types/command` |
| 快捷键标签、`KeyboardEvent` → binding、显示状态辅助函数 | 仅渲染进程纯逻辑 | `utils/command` |
| context 对象及其访问器 hooks、`useResolvedCommand`/`useResolvedCommandMenu`、`useCommandShortcuts` | React contexts + hooks | `hooks/command` |
| `CommandProvider`/`CommandContextKeyProvider`、`CommandMenus`、`CommandControls` | React 组件 | `components/command` |

`Provider` 返回 JSX，因此它是**组件**；它填充的 contexts 和读取它们的 hooks 不含 JSX，下沉一层到 `hooks/command`；纯逻辑下沉到 `utils/command`（仅渲染进程）或 `@shared/utils/command`（跨进程），类型到 `@shared/types/command`。没有内容归入 `services/`，且 `@shared` 只保留**两个**进程都使用的内容 — 只被渲染进程消费的解析器（例如 `getCommandShortcutLabel`）属于 `utils/command`。
分解后每条边缘都是向下的（`component → component`/`hook`、`hook → hook`）；先前的 `component → feature` 和 `hook → feature` 倒置已消失（导入方的 `component`/`hook` 是**共享**桶 — feature 内部的 `component` 导入其自身兄弟不属于此类倒置），且没有任何内容是"feature"。

## 7. 反模式

- 共享桶（`components/`/`hooks/`/`utils/`）导入 `features` 或 `pages`（反向/向上边缘）。
- `pages/X` 导入 `pages/Y`（跨页面耦合）。
- 领域专属产物留在顶层类型桶中（备份 manager、model/provider 部件等）。
- 将跨切面能力当作对等 feature。
- 为单个能力开辟新的顶层目录。
- feature 使用 `export *`，或外部消费者深度导入 feature 的 — 或 `services/<topic>/` 的 — 内部。
- 普通 camelCase 名称背后的模块作用域可变状态 — 保留状态必须采用类 + 单例 + 后缀形式（[命名规范 §5.2](./naming-conventions.md)）；普通名称断言无状态。
- 导入共享桶根（`@renderer/utils`、`@renderer/types`）而不是特定文件/主题，或给 `types/`/`utils/` 添加重新导出的根 `index.ts`（§5）。
- 手工搭建的 `components/layout/` 桶 — "layout" 在此不是一个层：路由布局位于 `routes/`（TanStack layout routes），布局原语（`Box`/`Stack`/`Grid`）位于 `packages/ui`，应用外壳位于 `windows/`。

## 8. 目标 vs 现状

本文档描述的是**目标**架构。渲染进程尚未完全迁移至此；下面列出的剩余差距是已知且持续跟踪的。迁移已推迟，有意不在本文范围内。

此处只跟踪**未解决**的偏差：一旦偏差被解决，它就不再违反目标，因此从此列表中移除而不是记录为已完成。表格列出仍然存在的确定性错误分类和结构性违规。小型领域的片段（components、pages、hooks、services、utils）可以合法地位于共享类型桶中，直到该领域获得 `features/<domain>/`；该晋升是独立的逐案判断（§4.1），此处不做规定。针对 `services/` 逐文件对照 [命名规范 §5.2](./naming-conventions.md) 的命名后缀审计（v1 时期的伪 `Service` 函数集合、有状态的普通命名模块）同样不在此范围内。

| 领域 | 现状 | 目标 |
|---|---|---|
| 应用外壳 | `components/layout/` 中的外壳装饰部分是窗口专属的，部分是跨窗口的 — 包括 `AppShell` 及其渲染的 `Sidebar`（`components/app/Sidebar`，被 `components/layout/AppShell.tsx` 导入 — 窗口外壳 UI，**不是**死代码） | 按归属分解：主外壳（`AppShell`、`AppShellTabBar`、tab 拖拽、`Sidebar`）→ `windows/main/`；子窗口装饰（`SubWindowControls`、`SubWindowTitle`）→ `windows/subWindow/`；跨窗口构建块（`TabRouter`、`TabIcon`、`titleBar`、tab 图标）→ 共享 `components/`（例如 `components/shell/`）。不新增 `windows/shell/` 桶 |
| 跨页面导入 | 约 13 个 `pages/<domain>/` 文件相互导入（`pages → pages` 耦合），由 §5 的门以 `warn` 级别把控 | 页面不得导入另一个页面；共享需求通过共享层路由，然后将门收紧到 `error` |
| `utils/message/` 主题 barrel | `utils/message/` 是一个多文件主题子目录，**没有 `index.ts`**（`@renderer/utils` 根 barrel 已被移除） | 为 `utils/message/` 添加一个精心整理的 `index.ts`（命名导出，**不使用 `export *`**） |
| 领域晋升 | 大型多文件领域（`chat` ≈ `pages/home` + `components/chat` + `components/composer`；`knowledge` ≈ `pages/knowledge` + …）散布在共享类型桶中，且**目前还不存在 `features/` 目录** | 按 §4.1 触发条件将最大的领域晋升为 `features/<domain>/`（先 `chat` 和 `knowledge`） |

## 9. 业界参考

| 论点 | 来源 |
|---|---|
| 单向依赖；无跨 feature 导入 | bulletproof-react — `docs/project-structure.md` |
| 同层切片不能相互导入，因此被广泛依赖的模块必须位于严格更低的层；`shared` 是最低层 | Feature-Sliced Design — `reference/layers`、`reference/public-api` |
| 将跨切面能力标记为更低类型（`type:ui`/`util`）并用 lint 强制方向 | Nx — `enforce-module-boundaries` |
| Command/快捷键服务位于 `platform/` 基础层；feature contributions 相互隔离 | VS Code — Source Code Organization |
| 领域无关、非差异化的能力是通用子域，而不是核心领域的对等体 | DDD 战略设计 |
| 应用级单例位于 Core；feature 之间不相互导入 | Angular — Core / Shared / Feature modules |

## 相关文档

- [命名规范 §4.10](./naming-conventions.md) — feature 模块的归置与命名。
- [架构概览](./architecture-overview.md) — monorepo 结构与跨进程分层。
