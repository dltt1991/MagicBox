# 性能诊断

主进程的可选性能插桩，由 `CS_DIAGNOSTICS` 环境变量控制。默认关闭 → 正常运行时零开销。

该功能位于 [`src/main/core/diagnostics.ts`](../../../src/main/core/diagnostics.ts)；各个探针位于它们测量的代码旁边，检查相同的 `DIAGNOSTICS_ENABLED` 标志。

## 启用

诊断完全由到达**主进程**的 `CS_DIAGNOSTICS` 环境变量控制；所有信号一起开启。打包构建没有特殊之处——同一个生产二进制文件在标志存在时运行时带有额外的插桩。

### 开发环境

```bash
CS_DIAGNOSTICS=1 pnpm dev
```

### 打包构建（非开发）

从 Finder / Dock / 开始菜单双击**不会**传递 shell 环境变量，因此诊断保持关闭。从**终端**启动应用二进制文件，以便变量到达主进程：

```bash
# macOS
CS_DIAGNOSTICS=1 "/Applications/Magic Box.app/Contents/MacOS/Magic Box"

# Windows (PowerShell) — 根据安装位置调整路径
$env:CS_DIAGNOSTICS=1; & "$env:LOCALAPPDATA\Programs\Magic Box\Magic Box.exe"

# Linux (AppImage；或已安装的二进制文件，其路径因发行版而异)
CS_DIAGNOSTICS=1 "./Magic Box-<version>-<arch>.AppImage"
```

### 输出

开发和打包运行都写入**应用日志目录**（macOS 上为 `~/Library/Logs/CherryStudio/`；`application.getPath('app.logs')`）：信号流入 `app.<date>.log`，CPU profile 作为 `boot-whenReady.cpuprofile` 位于其旁边。

## 信号

| 信号 | 日志标签 | 位置 | 告诉你什么 |
|--------|---------|-------|-------------------|
| 单服务初始化计时 | `[Diagnostics/_doInit]` | `BaseService._doInit` | 每个服务的 `onInit` 与 `onReady` 持续时间。墙上时钟——在并行层中会吸收兄弟同步工作（见注意事项）。 |
| 阶段服务跨度 | `[Diagnostics]` | `LifecycleManager.startPhase` | 每个服务从阶段起点的开始/结束偏移。整个层在同一时刻结束 ⇒ 一个服务占据线程。 |
| 事件循环延迟 | `[Diagnostics]` | `LifecycleManager.startPhase` | `totalLag` 高 ⇒ 循环被同步工作阻塞；在长时间跨度上接近零 ⇒ IO/宏任务绑定。`fires=0` ⇒ 纯微任务级联（定时器从未运行）。 |
| whenReady CPU profile | `[Diagnostics] CPU profile written to …` | `LifecycleManager.startPhase` | whenReady 阶段的 V8 采样 profile。按函数的自耗时——当启动是一个微任务链时，这是唯一可靠的归因。 |
| 慢数据库查询 | `[Diagnostics/slow-query]` | `DbService.installSlowQueryProbe` | 任何 >15ms 的查询：持续时间、行数、SQL、调用者堆栈。涵盖单个语句、多语句 `exec` 块和事务内部。 |
| 慢 IPC 处理器 | `[Diagnostics/ipc]` | `BaseService.ipcHandle` | 任何 >50ms 的服务 IPC 处理器：持续时间 + channel。涵盖通过 `this.ipcHandle()` 注册的处理器（大多数）；`ipc.ts` 中的直接 `ipcMain.handle` 未覆盖。 |
| 窗口创建 | `[Diagnostics/window]` | `WindowManager.createWindow` | 每个窗口：同步构造成本，然后从同一起点开始的 `ready-to-show` 绘制延迟。 |
| 慢 DataApi 请求 | `[Diagnostics/dataapi]` | `ApiServer.handleRequest` | 任何 >50ms 的 DataApi 请求：持续时间 + `method path`。持续时间单调测量（`performance.now()`）且仅在启用时计算。 |
| 详细日志 | — | `LoggerService`（主进程 + 渲染进程） | 该标志使 logger 的行为与开发环境完全相同：文件级别降至 `silly`，控制台输出开启，`CSLOGGER_*` 过滤器在打包构建中变为活动。参见[日志](./logging.md#filtering-logs-with-environment-variables)。 |

`slow-*` 阈值在一处定义——`src/main/core/diagnostics.ts` 中的 `SLOW_THRESHOLD_MS`。

## 读取 CPU profile

写入应用日志目录中的 `boot-whenReady.cpuprofile`（`app.<date>.log` 旁边；`application.getPath('app.logs')`）。在 Chrome DevTools（Performance → Load profile）或 VS Code 的内置 `.cpuprofile` 查看器中打开。按**自耗时**排序以获得真正的 CPU 归因。

采样间隔为 1000µs（V8 默认）。不要降低它——100µs 会过度采样约 10 倍并增加约 135ms 的检查器开销，仅对被分析的 whenReady 阶段施加压力，淹没 <100ms 的差异。

## 注意事项

- **并行层中的单服务 `_doInit` 计时受到污染。**一个层中的服务通过 `Promise.allSettled` 运行；`await this.onReady()` 产生一个微任务，在此期间兄弟的同步主体运行至完成并计入正在测量的任何服务。相信 CPU profile 的自耗时以获得真正的归因，而不是单服务数字。
- **慢查询探针包装 better-sqlite3，而非 drizzle。**drizzle 自己的 `logger` 选项记录每个语句（包括事务内部）但不携带计时，因此无法标记*慢*查询。探针改为包装 better-sqlite3 连接的 `prepare` 和 `exec`——drizzle 发出查询的每个路径。

## 添加新诊断

1. 在代码所在位置导入标志：`import { DIAGNOSTICS_ENABLED } from '@main/core/diagnostics'`。
2. 守卫探针：`if (DIAGNOSTICS_ENABLED) { … }`——禁用路径必须保持零成本。对于慢事件探针，将阈值添加到 `SLOW_THRESHOLD_MS` 而不是硬编码 ms。
3. 标记日志 `[Diagnostics/<name>]` 以便它们一起 grep。
4. 在上面的信号表中添加一行。
