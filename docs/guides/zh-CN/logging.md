# 如何使用 LoggerService

这是关于如何使用 logger 的开发者文档。

CherryStudio 使用统一的日志服务来打印和记录日志。**除非有特殊原因，否则不要使用 `console.xxx` 打印日志**。

以下是详细说明。

## 在 `main` 进程中使用

### 导入

```typescript
import { loggerService } from '@logger'
```

### 设置模块信息（按约定必需）

在导入语句后，按如下方式设置：

```typescript
const logger = loggerService.withContext('moduleName')
```

- `moduleName` 是当前文件模块的名称。可以根据文件名、主类名、主函数名等命名。原则是清晰易懂。
- `moduleName` 将在终端中打印，也会出现在文件日志中，便于过滤。

### 设置 `CONTEXT` 信息（可选）

在 `withContext` 中，你还可以设置其他 `CONTEXT` 信息：

```typescript
const logger = loggerService.withContext('moduleName', CONTEXT)
```

- `CONTEXT` 是形式为 `{ key: value, ... }` 的对象。
- `CONTEXT` 信息不会在终端中打印，但会记录在文件日志中，便于过滤。

### 记录日志

在你的代码中，你可以随时调用 `logger` 来记录日志。支持的级别有：`error`、`warn`、`info`、`verbose`、`debug` 和 `silly`。
每个级别的含义请参阅后续章节。

以下是日志记录支持的参数（以 `logger.LEVEL` 为例，其中 `LEVEL` 表示上述级别之一）：

```typescript
logger.LEVEL(message)
logger.LEVEL(message, CONTEXT)
logger.LEVEL(message, error)
logger.LEVEL(message, error, CONTEXT)
```

**仅支持上述四种调用方法**。

| 参数 | 类型     | 描述                                                                                                                                                                                                                                                                                                                   |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message` | `string` | 必需。这是日志的核心字段，包含要记录的主要内容。                                                                                                                                                                                                                                      |
| `CONTEXT` | `object` | 可选。要记录在日志文件中的附加信息。建议使用 `{ key: value, ...}` 格式。                                                                                                                    |
| `error`   | `Error`  | 可选。错误堆栈跟踪也将被打印。<br />请注意，`catch(error)` 捕获的 `error` 是 `unknown` 类型。根据 TypeScript 最佳实践，你应该首先使用 `instanceof` 进行类型检查。如果你确定它是 `Error` 类型，你也可以使用类型断言如 `as Error`。 |

#### 记录非 `object` 类型的上下文信息

```typescript
const foo = getFoo()
logger.debug(`foo ${foo}`)
```

### 日志级别

- 在开发环境中，所有日志级别都打印到终端并记录在文件日志中。
- 在生产环境中，默认日志级别为 `info`。日志仅记录到文件，不打印到终端。

更改日志级别：

- 你可以使用 `logger.setLevel('newLevel')` 更改日志级别。
- `logger.resetLevel()` 将其重置为默认级别。
- `logger.getLevel()` 获取当前日志级别。

**注意：**更改日志级别具有全局效果。除非你非常清楚自己在做什么，否则请不要在代码中随意更改它。

## 在 `renderer` 进程中使用

`renderer` 进程中的*导入*、*设置模块信息*和*设置上下文信息*的用法与 `main` 进程**完全相同**。
以下部分重点介绍差异。

### Window source

在 `renderer` 进程中有不同的 `window`，因此每个日志记录它来自哪个窗口。每个窗口在其 `index.html` 中声明式地声明其来源：

```html
<meta name="logger-window-source" content="mainWindow" />
```

`LoggerService` 在构造时读取此 meta 标签。因为 `<meta>` 在任何模块脚本运行之前被解析，所以来源在任何导入时日志之前可用——在 `entryPoint.tsx` 中不需要遵循排序规则。

- `content` 值记录在 `main` 进程终端和文件日志中；它不在 `devTool` 的 `console` 中打印。
- 如果窗口没有 meta 标签（也没有显式覆盖），早期日志回退到 `UNKNOWN` 并打印 `console.error`。

#### `initWindowSource`（显式覆盖）

像 worker 这样的无文档上下文——以及任何特殊情况——显式设置来源。显式来源覆盖 meta 派生的来源：

```typescript
loggerService.initWindowSource('Worker')
```

- 它只能设置一次；后续尝试无效。
- 它返回 LoggerService 实例，允许方法链。

### 日志级别

- 在开发环境中，默认情况下所有日志级别都打印到 `devTool` 的 `console`。
- 在生产环境中，默认日志级别为 `info`，日志打印到 `devTool` 的 `console`。
- 在开发和生产环境中，默认情况下 `warn` 和 `error` 级别的日志会传输到 `main` 进程并记录在文件日志中。
  - 在开发环境中，`main` 进程终端也会打印从渲染器传输的日志。

#### 更改日志级别

与 `main` 进程相同，你可以使用 `setLevel('level')`、`resetLevel()` 和 `getLevel()` 管理日志级别。
同样，更改日志级别是全局调整。

#### 更改传输到 `main` 的级别

来自 `renderer` 的日志被发送到 `main` 进行集中管理和记录到文件（根据 `main` 的文件日志级别）。默认情况下，只有 `warn` 和 `error` 级别的日志传输到 `main`。

有两种方法可以更改传输到 `main` 的日志级别：

##### 全局更改

以下方法可用于分别设置、重置和获取传输到 `main` 的日志级别。

```typescript
logger.setLogToMainLevel('newLevel')
logger.resetLogToMainLevel()
logger.getLogToMainLevel()
```

**注意：**此方法具有全局效果。除非你非常清楚自己在做什么，否则请不要在代码中随意更改它。

##### 单次日志更改

通过在日志调用末尾添加 `{ logToMain: true }`，你可以强制单个日志条目传输到 `main`（绕过全局日志级别限制），例如：

```typescript
logger.info('message', { logToMain: true })
```

## 关于 `worker` 线程

- 目前，`main` 进程中的 worker 不支持日志记录。
- 在 `renderer` 进程中启动的 worker 支持日志记录，但目前这些日志不会发送到 `main` 进行记录。

### 如何在 `renderer` Worker 中使用日志记录

由于 worker 线程是独立的，在其中使用 LoggerService 相当于在新的 `renderer` 窗口中使用它。因此，你必须首先调用 `initWindowSource`。

如果 worker 相对简单（只有一个文件），你也可以直接使用方法链：

```typescript
const logger = loggerService.initWindowSource('Worker').withContext('LetsWork')
```

## 使用环境变量过滤日志

在开发环境中，你可以定义环境变量来按级别和模块过滤显示的日志。这有助于开发者专注于他们的特定日志并提高开发效率。

环境变量可以在终端中设置或在项目根目录的 `.env` 文件中定义。可用变量如下：

| 变量名称                    | 描述                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CSLOGGER_MAIN_LEVEL`            | `main` 进程的日志级别。低于此级别的日志将不会显示。                                                                                              |
| `CSLOGGER_MAIN_SHOW_MODULES`     | 过滤 `main` 进程的日志模块。使用逗号（`,`）分隔模块。过滤区分大小写。只有此列表中模块的日志会显示。     |
| `CSLOGGER_RENDERER_LEVEL`        | `renderer` 进程的日志级别。低于此级别的日志将不会显示。                                                                                          |
| `CSLOGGER_RENDERER_SHOW_MODULES` | 过滤 `renderer` 进程的日志模块。使用逗号（`,`）分隔模块。过滤区分大小写。只有此列表中模块的日志会显示。 |

示例：

```bash
CSLOGGER_MAIN_LEVEL=verbose
CSLOGGER_MAIN_SHOW_MODULES=McpService,SelectionService
```

注意：

- 默认情况下，这些变量仅在开发环境中有效。要在打包构建中启用它们，请在设置 `CS_DIAGNOSTICS` 的情况下启动它——logger 然后的行为与开发环境完全相同（详细文件级别、控制台输出和这些覆盖都会开启）。参见[性能诊断](./diagnostics.md)。
- 这些变量只影响终端或 DevTools 中显示的日志。它们不影响文件日志记录或 `logToMain` 记录逻辑。

## 日志级别使用指南

有许多日志级别。以下是 CherryStudio 中应遵循的关于何时使用每个级别的指南：
（从最高到最低日志级别排列）

| 日志级别     | 核心定义与用例                                                                                                                                                                          | 示例                                                                                                                                                                                            |
| :------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`error`**   | **导致程序崩溃或核心功能无法使用的严重错误。**<br> 这是最高优先级的日志，通常需要立即报告或用户通知。        | - 主进程或渲染进程崩溃。<br> - 无法读取/写入关键用户数据文件（例如，数据库、配置文件），阻止应用运行。<br> - 所有未处理的异常。           |
| **`warn`**    | **潜在问题或不影响程序核心功能的意外情况。**<br> 程序可以恢复或使用回退。                                                  | - 配置文件 `settings.json` 缺失；以默认设置启动。<br> - 自动更新检查失败，但不影响当前版本的使用。<br> - 非必要插件加载失败。 |
| **`info`**    | **记录应用生命周期事件和关键用户操作。**<br> 这是应在生产版本中记录的默认级别，以跟踪用户的主要操作路径。            | - 应用启动、退出。<br> - 用户成功打开/保存文件。<br> - 主窗口创建/关闭。<br> - 启动重要任务（例如，"开始视频导出"）。                                         |
| **`verbose`** | **比 `info` 更详细的流程信息，用于跟踪特定功能。**<br> 在诊断特定功能的问题时启用，以帮助理解内部执行流程。     | - 加载 `Toolbar` 模块。<br> - 从渲染进程发送 IPC 消息 `open-file-dialog`。<br> - 对图像应用过滤器 'Sepia'。                                                                     |
| **`debug`**   | **开发和调试期间使用的详细诊断信息。**<br> **在生产版本中不得默认启用**，因为它可能包含敏感数据并影响性能。 | - 函数 `renderImage` 的参数：`{ width: 800, ... }`。<br> - IPC 消息 `save-file` 接收的特定数据内容。<br> - 渲染进程中 Redux/Vuex 状态变化的详细信息。              |
| **`silly`**   | **最详细的低级信息，仅用于极端调试。**<br> 在常规开发中很少使用；仅用于解决非常困难的问题。                                   | - 实时鼠标坐标 `(x: 150, y: 320)`。<br> - 读取文件时每个数据块的大小。<br> - 每个渲染帧所用的时间。                                                                   |
