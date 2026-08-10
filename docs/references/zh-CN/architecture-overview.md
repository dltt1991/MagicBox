# 架构概览

> **注意**：`main` 正在进行大规模的 v2 架构重构（v1 与 v2 并存）。本文档随重构进展持续更新；部分章节描述的是**目标**架构，而非当前状态。

本文是进入 Magic Box 架构的跨进程入口：Electron 进程模型、数据流、数据系统、monorepo 结构，以及各进程和子系统详细参考文档的导航索引。各进程的目录布局与依赖规则在各自文档中定义——本页不重复它们。

## 进程模型

Magic Box 是一个 Electron 应用，包含两个应用进程（以及 preload），各自对应一个 `src/` 根目录及其顶层目录：

```
═══ 主进程 · Node.js · src/main/ ════════════════════════════════════

  core/       应用运行时 — IoC 容器、路径、日志、窗口、scheduler/jobs
  data/       数据层 — Db、Cache、Preference、DataApi、BootConfig
  ai/         AI 子系统 — providers、中间件、MCP、agents、streams
  features/   大型领域模块    ·    services/  小型业务服务
  ipc/        IpcApi — 连接渲染进程的类型化边界
  （还包含：Express API 服务器 · MCP 服务器 · knowledge / RAG）

                   ↕   IPC over contextBridge   ·   src/preload/

═══ 渲染进程 · Chromium · src/renderer/ ══════════════════════════════

  windows/     每个窗口的入口根 — Main、Sub、Selection、…
  pages/       路由视图 — Chat、Agent、Settings、…
  features/    领域 UI 模块
  data hooks   useQuery / useMutation / usePreference / useCache
  ai core      provider 中间件
  UI           React 19 · Shadcn UI · Tailwind · TipTap
```

## 数据流

典型用户交互的路径如下：

```
用户输入（React UI）
  │
  ├── 聊天消息 ──→ AI Core（provider 中间件）──→ LLM API
  │                        │
  │                        ├── 流式数据块 ──→ 渲染进程聊天状态 ──→ UI 更新
  │                        └── 消息块 ──→ DataApi ──→ SQLite（持久化）
  │
  ├── 设置变更 ──→ usePreference ──→ IPC ──→ PreferenceService ──→ SQLite
  │                                                    └── 广播至所有窗口
  │
  └── 业务数据 ──→ useQuery / useMutation ──→ IPC ──→ DataApi handler
       （topic、文件）                                        │
                                                             ├── Service 层
                                                             ├── Repository 层
                                                             └── SQLite（Drizzle ORM）
```

## 四大数据系统

Magic Box 使用四套数据系统，各自针对不同的数据特性进行优化：

| 系统 | 存储 | 时机 | 用途 |
|--------|---------|--------|----------|
| [**BootConfig**](../data/boot-config-overview.md) | JSON 文件 | 生命周期前（同步） | Chromium flags、硬件加速 |
| [**Cache**](../data/cache-overview.md) | 内存（每进程）/ 共享（Main 中继）/ 持久化（渲染进程 localStorage） | 运行时 | 临时数据、UI 状态、跨窗口协调 |
| [**Preference**](../data/preference-overview.md) | SQLite | 生命周期后 | 用户设置（主题、语言） |
| [**DataApi**](../data/data-api-overview.md) | SQLite（Drizzle） | 生命周期后 | 业务数据（topics、messages） |

详细架构、决策流程和使用模式见 [数据系统参考](../data/README.md)。

## 服务生命周期

拥有长期资源或持久副作用的主进程服务运行在一个带有分阶段 bootstrap 的 IoC 容器中（Background → BeforeReady → WhenReady），在 `src/main/core/application/serviceRegistry.ts` 中逐行注册，通过 `application.get('ServiceName')` 解析。阶段、装饰器及迁移指南见 [生命周期参考](../lifecycle/README.md)；服务在目录布局中的位置见 [主进程架构](./main-process-architecture.md)。

## AI 核心架构

AI 管道：选择 provider → 执行中间件链（context、knowledge、tools）→ 通过 Vercel AI SDK 流式输出 → 发出类型化消息块（text、code、image、tool-call）。完整管道和数据流见 [AI 参考](../ai/README.md)。

## Monorepo 结构

```
cherry-studio
├── src/
│   ├── main/                    # 主进程（Node.js）— 目录布局见 ./main-process-architecture.md
│   │
│   ├── renderer/                # 渲染进程（React）— 目录布局见 ./renderer-architecture.md
│   │
│   ├── preload/                 # Preload 脚本（IPC 桥）
│   │
│   └── shared/                  # 跨进程原语：类型、schema/契约、纯逻辑 — 布局见 ./shared-layer-architecture.md
│
├── packages/
│   ├── ui/                      #   @cherrystudio/ui（Shadcn + Tailwind）
│   ├── aiCore/                  #   @cherrystudio/ai-core
│   ├── ai-sdk-provider/         #   自定义 AI SDK providers
│   ├── provider-registry/       #   Provider 注册表
│   ├── mcp-trace/               #   OpenTelemetry tracing
│   └── extension-table-plus/    #   TipTap table 扩展
│
├── docs/                        # 文档（本目录）
│   ├── guides/                  #   操作指南
│   └── references/              #   技术参考
│
└── scripts/                     # 构建、lint、i18n 和 CI 脚本
```

主进程和渲染进程代码按**功能**（`features/` — 高内聚领域模块）和**类型桶**（`services/`、`utils/`、`components/`、`hooks/` — 小型独立片段）组织；放置规则见 [命名规范 §4.10](./naming-conventions.md)。`src/shared/` 是**跨进程原语层** — 可被 `main` 和 `renderer` 双方引入的类型、schema/契约和纯逻辑（跨进程是进入的门槛）。完整分层和依赖规则在各进程文档中定义。

## 参考导航

详细内容的查阅入口。三份进程文档拥有各进程的目录布局和依赖规则；子系统内部细节在各自的参考文档中定义。

| 领域 | 参考文档 |
|---|---|
| 主进程目录职责与依赖规则 | [主进程架构](./main-process-architecture.md) |
| 渲染进程目录分层与依赖规则 | [渲染进程架构](./renderer-architecture.md) |
| 跨进程原语（`@shared`） | [共享层架构](./shared-layer-architecture.md) |
| 命名（文件、目录、标识符） | [命名规范](./naming-conventions.md) |
| 数据系统（BootConfig / Cache / Preference / DataApi） | [数据系统参考](../data/README.md) |
| IPC（IpcApi） | [IPC 参考](../ipc/README.md) |
| 服务生命周期（IoC、分阶段 bootstrap） | [生命周期参考](../lifecycle/README.md) |
| 窗口管理器（多窗口、pooling） | [窗口管理器参考](../window-manager/README.md) |
| Scheduler 与 jobs | [Job & Scheduler 参考](../job-and-scheduler/README.md) |
| AI 子系统 | [AI 参考](../ai/README.md) |
| 路径注册表 | [paths/README](../../../src/main/core/paths/README.md) |

Magic Box 运行多个窗口（主窗口、子窗口、选择工具栏……），均由 `WindowManager` 管理，通过 IPC 和共享状态（Cache、Preference）进行通信；见 [窗口管理器参考](../window-manager/README.md)。
