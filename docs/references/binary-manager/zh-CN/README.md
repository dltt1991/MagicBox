# BinaryManager 参考

`BinaryManager` 是生命周期服务，通过 [mise](https://mise.jdx.dev) 获取和管理第三方 CLI 二进制文件。它拥有自定义工具注册表和围绕 mise 的 filesystem/process 编排；域服务拥有执行、配置和健康逻辑。

> **为什么使用 mise，而不是自定义后端接口？** mise already owns the polyglot tool grammar（`npm:`、`pipx:`、`github:`、`http:` 及其注册表）。 `BinaryBackend` 包装器将是重复这些语义的浅层抽象。

## 范围

BinaryManager 适用于 mise can install（`npm:`、`pipx:`、`github:`、mise registry 等）的单个 CLI 可执行文件。它不适用于多文件服务器包、硬件检测、生成的配置或 data/model 下载。这些仍保留在其域服务中。

范围内的示例：`uv`、`bun`、`ripgrep`、`gh`、`claude-code` 和 npm/pipx CLI 工具。捆绑的 `mise` 可执行文件是内部基础设施，而不是面向用户的托管工具。

## 工具定义和运行时事实

Magic Box 管理两组不相交的工具。 **固定工具** - 每个依赖项预设 (`PRESETS_BINARY_TOOLS`) 和每个代码 CLI 可执行文件 - 都是代码拥有的：它们的规范 mise recipe lives in the in-code __PH1__，并且它们写入 **零** 首选项。 **自定义工具**是用户添加的：每个工具都是保存在 `feature.binary.tools` 自定义注册表中的 `CustomToolDefinition` (`{ name, tool, requestedVersion? }`)。持久定义意味着用户添加了该工具；它**不**证明可执行文件现在存在。

只有主进程写入`feature.binary.tools`，通过`BinaryManager.addCustomTool()`（持久优先自定义添加）和`BinaryManager.removeTool()`。 `installByName()` 从不写入 Preference — 它解析 main 中的 fixed/custom 配方并应用它。渲染器发送命令并渲染快照；它从不直接写定义。没有 `state.json` 或启动协调，因此恢复的自定义注册表不会自动改变文件系统。丢失的可执行文件仍然可以通过正常安装路径恢复，而自定义定义仍然可以删除。在 `onAllReady` 之后，生命周期拥有的一次性 `normalizeCustomDefinitions()` 传递将注册表重写为规范形状（删除固定名称条目、格式错误的条目、固定规格别名和重复项，并将旧字符串 `version` 映射到 `requestedVersion`） — 仅模式卫生：它从不安装、协调或触及文件系统。钩子安排这项工作，服务停止在开始之前取消它，或者在飞行中加入它。如果用户突变已经持有全局互斥锁，卫生将屈服于该操作并在下次启动时重试，而不是在安装后延迟关闭。

mise is an availability backend，不是定义存储。 mise can have no custom definition 可见的可执行文件；相反，定义的自定义工具在外部删除后可能不可用。 Custom Add 首先写入定义：如果写入失败，则不会启动后端工作；如果后端应用程序随后失败，则定义保留，并且快照带有可重试的失败操作。

捆绑副本是单独的可用性来源。该应用程序将其发送的二进制文件提取到 `cherry.bin`。运行时查找顺序是 mise shim，捆绑的二进制文件，然后是用户的登录 shell 路径。

### 可移植定义和机器本地状态

备份和恢复传输 `feature.binary.tools` 仅作为可移植自定义定义。恢复它们可以在另一台计算机上重新创建自定义卡和请求的版本引脚，但它永远不会安装工具、重新创建后端应用程序或复制 operation/latest-version 状态。固定定义来自正在运行的 Magic Box 版本，而不是备份数据。恢复后，每台计算机从其自己的 mise state、捆绑文件和系统 PATH 派生 `application` 和 `availability`。

## 快照

`getToolSnapshots(names)` 是渲染器和主要消费者的唯一可用表面。每个 `BinaryToolSnapshot` 结合了四个独立的维度：

- `definition`：用户添加的 `CustomToolDefinition` 支持该名称；固定工具不存在。
- `application`：精确的后端应用程序事实 (`applied` / `broken` / `absent` / `conflict` / `unknown`) — 精确的托管配方是否通过 mise 应用，独立于 `availability` 计算。只有 `active: true` mise entry whose executable shim and __PH8__ target are both runnable can be __PH9__；已安装但不活动的条目是 `broken`，它们的垫片贡献 mise availability only when the same target check passes.
- `availability`：当前 `mise`、`bundled`、`system` 或 `none` 事实，包括可执行路径（如果可用）。
- `operation`：可选当前 install/remove 状态。

返回的记录有意是所请求名称的超集。它还包括自定义注册表项、活动操作项以及从 mise 发现的 __PH0__/__PH1__ 运行时依赖项。候选配方仅来自固定目录和自定义注册表 - 仅操作名称不携带配方，因此省略其 `application` 事实。这使得新安装的设置窗口呈现完整的管理视图。

快照获取实时 mise data with one __PH0__ query and reports a mise executable only after its shim passes the platform-appropriate access check and __PH1__ resolves an accessible target. System discovery uses the raw login-shell environment so Magic Box 的目录，并且 `MISE_*` 设置无法使 Magic Box 可执行文件看起来像系统可执行文件。

快照在设计上是弱一致性的：它们不等待突变互斥体。组装快照时，自定义注册表、操作缓存、mise output 和文件系统可能会发生变化。消费者必须将快照视为当时的 display/execution 决策，在 `binary.availability_changed` 上刷新，并从 `application` 驱动 update/uninstall/repair，而不是仅从 `availability` 驱动 update/uninstall/repair。

### 应用和行动矩阵

`availability` 授权执行； `application` 授权后端突变。系统和捆绑的可执行文件位于 BinaryManager 外部，并且永远不会更新或删除。

|定义种类|应用/可用性|用户界面操作|
| --- | --- | --- |
|固定的|`applied`|更新、卸载；卸载后固定卡仍然存在|
|固定的|`broken`|重试，卸载|
|固定的|`absent` + `none`|安装|
|固定的|`absent` + bundled/system|只读；代码 CLI 可能会启动|
|固定的|`conflict`|无后端突变；代码 CLI 可以启动经过验证的可执行文件|
|固定的|`unknown`|仅限 Retry/probe；永不卸载|
|风俗|`applied`|更新、删除|
|风俗|`broken`|重试，删除|
|风俗|`absent` + `none`|安装、删除|
|风俗|`absent` + bundled/system|删除定义；切勿安装卷影副本|
|风俗|`conflict`|仅去除流量；清理必须在仅定义回退之前失败关闭|
|风俗|`unknown`|Retry/probe 或移除流量；永远不要假设后端清理是安全的|

删除是一个自定义工具产品流程：它首先尝试验证后端清理，然后删除定义。仅在输入 `cleanup_blocked` 结果后，UI 才会提供第二个仅明确定义的确认警告，表明后端文件可能保留。固定工具没有仅定义的后备。

## 突变行为

安装和删除突变通过自定义注册表和 mise process operations. Per-tool active-operation guards deduplicate an identical install and reject conflicting __PH0__ requests before they overwrite each other 的状态进行序列化。

有两种安装路线。 `installByName({ name, targetVersion? })` 解析代码拥有的固定配方或持久的自定义定义，并将其应用于实时 `application` 事实 - 它从不写入 Preference。已应用的工具是无操作的（或给定目标时的一次性版本更新）；外部满足的 (bundled/system) 工具是记录的无操作，因此竞争会收敛； __PH2__/__PH3__ 状态拒绝而不发生变异；后端故障记录失败的操作。 `addCustomTool(definition)` 是接受任意配方的唯一途径：它验证语法和冲突，然后在任何后端工作之前将定义保存到注册表，因此即使安装失败，该工具也能保持定义并可重试。仅当其活动版本可证明满足 `requestedVersion` （或没有要求）时，已应用的工具才会短路；不匹配或无法验证的版本运行目标安装。这两个路由都不会使用 resolved/installed 版本重写持久定义。

安装一次性版本更新并证明可运行后，BinaryManager 运行工具过滤的 `mise prune <tool>` 来删除 mise configuration. It then reshims and verifies the active executable again. A prune command failure is logged without turning the already-successful update into a failed install 不再引用的旧版本；全新安装和仅名称修复操作不会运行此清理。

两者都在等待全局突变锁之前发布 `installing` 并清除或失败其下的操作。失败的操作带有 `{ status, action, error }` 加上，对于失败的一次性更新，它正在应用 `targetVersion` — 因此重试会重复相同的目标更新，而不是降级为仅名称无操作。它从不携带配方，因为配方始终可以从固定目录或自定义注册表重新解析。

删除会发布 `removing` 并从实时 `application` 事实（而不是持久定义）中选择其清理路径。缺少固定工具就是幂等的成功；缺少的自定义工具仅删除其定义。对于已应用或损坏的精确配方，BinaryManager 会删除 mise tool、重新填充、验证是否存在，然后才删除自定义定义 - 固定工具会保留其目录标识并且不写入首选项。 `definitionOnly` 仅删除自定义定义而不触及后端。阻止的清理会返回类型化的 `cleanup_blocked` 结果并保留定义，因此 UI 不会意外地用安装重试替换删除失败。

运行时依赖项有一项额外的规则。如果现有的 `node` 或 `python` 填充程序满足请求的版本，则安装将采用其观察到的版本，而不是重新安装。版本不匹配运行 mise installation instead. This avoids silently replacing a usable runtime.

删除运行时受到对称保护。在突变锁定下，删除 `node` 运行时会被拒绝，而任何已安装的 `npm:` 工具仍然存在，而 `python` 运行时则被拒绝，而任何已安装的 `pipx:` 工具仍然存在 - 这些包工具依赖于运行时的解释器，因此拉动它会使它们陷入困境。拒绝指出了阻止工具；该检查重用安装端后端→运行时映射（npm→node、pipx→python）而不是依赖关系图。

### 失败结果

|故障点|权威结果|
| --- | --- |
|添加时自定义写入|在后端工作之前添加停止；没有创建任何卡|
|自定义添加后的后端应用|定义仍然存在；失败的操作暴露重试|
|Fixed/custom 安装或更新|配方来源不变；失败的操作暴露在安全的地方重试|
|删除期间后端 query/conflict|`cleanup_blocked`；后端和自定义保持不变|
|后端清理验证失败|`cleanup_blocked`；自定义定义将保留，直到重试或显式仅删除定义|
|验证清理后自定义删除失败|定义仍然存在；现在不存在的后端状态使得删除可以安全地重试|
|突变后最新缓存删除或可用性广播失败|已提交的 backend/Preference 突变仍然成功；派生状态稍后刷新|

### 就地使用没有定义的可用性

就地使用通过 `mise`、系统 PATH 或捆绑的二进制文件可见但不携带自定义定义的工具 — Magic Box 绝不会仅仅因为可用性而创建管理卡，也绝不会主动接管或隐藏现有安装。固定工具始终通过其目录条目进行管理；自定义工具总是带有定义，因此总是公开删除。安装中存在一个采用案例：当请求的版本中已存在 __PH1__/__PH2__ 运行时时，安装将采用该观察到的版本而不是重新安装（上面的运行时规则）。

`feature.binary.install_states` 是一个主要拥有的、仅限会话的内部缓存条目。它不是共享缓存架构或渲染器存储 API 的一部分；操作仅作为快照的一部分到达渲染器窗口。 `feature.binary.latest_versions` 同样是一个会话缓存：非强制读取仅缓存，而强制查找则为应用的 fixed/custom 配方运行 `mise latest` ，并且仅在批处理期间没有发生突变时才写入结果。

## IPC 和事件

请求路由和事件是 `src/shared/ipc/schemas/binary.ts` 中的 IpcApi 模式 — `binaryRequestSchemas` 键（渲染器→主路由）和 `BinaryEventSchemas` 类型（主→渲染器事件）。在那里阅读它们，而不是在这里手写的列表，因为这样会产生偏差。他们的管理员住在 `src/main/ipc/handlers/binary.ts`。

`binary.availability_changed` 告诉消费者刷新他们的快照并使显示的最新版本提示无效。内部 `isBinaryExists()` 帮助程序仍然适用于仅需要 Magic Box 目录存在的主进程调用者；它不是渲染器路线。

## 自定义注册表冲突不变式

`addCustomTool` 在自定义注册表中强制执行双射，在突变锁下进行检查：保留并拒绝内置固定名称；给定的自定义名称恰好映射到一个规范（不同的同名定义被拒绝为“已使用不同的规范定义”）；并且给定的精确工具规范恰好映射到一个提供程序（别名固定目录配方的规范，或声称另一个规范已由另一个提供的规范的第二个自定义名称，将被拒绝为“已由 `<name>` 提供”）。相同的不变量控制 `normalizeCustomDefinitions` 卫生通行证，因此快照的 `definition` 对于哪个名称提供规范永远不会含糊。

## GitHub 速率限制选择加入

mise 的 `github:` 后端访问 GitHub 发布 API 来解析版本。未经身份验证的限制是每个 IP 每小时 60 个请求，这在共享 NAT 后面很容易耗尽。

`BinaryManager.buildIsolatedEnv()` 不会转发环境 `GITHUB_TOKEN` 或 `GH_TOKEN` 值。用户可以通过 `feature.binary.install_settings` 首选项的 `githubToken` 字段或通过设置 `CHERRY_GITHUB_TOKEN` 显式选择加入； BinaryManager 将选定的显式值转发到 mise as __PH6__.

```bash
export CHERRY_GITHUB_TOKEN=ghp_xxx
```

## 中国镜像和高级安装设置

当区域服务识别到中国时，BinaryManager 提供 npm and pip mirror defaults to its isolated mise subprocess. An explicit user value wins over a regional default.

设置 → 依赖项 → 高级安装设置将 GitHub 镜像、GitHub 令牌、npm registry、pip 索引 URL 和签名验证字段一起保留在 `feature.binary.install_settings` 下。这些值仅影响独立的安装子进程，而不会影响已安装的 CLI 的执行环境。空 URL/token 值保留默认行为，并且签名验证默认为启用。

## 添加工具

对于内置依赖项设置预设，请将条目添加到 `src/shared/data/presets/binaryTools.ts` 中的 `PRESETS_BINARY_TOOLS`。使用 `name` 的可执行文件名称和规范的 mise specification for __PH3__；通过正常的 i18n 工作流程添加关联的用户可见描述。

对于代码 CLI，将其 executable/specification 添加到代码 CLI 预设源。 `getToolSnapshots()` 已经包含这些候选者，因此不需要 BinaryManager 适配器。

要发布捆绑的可执行文件，请将其平台 download/checksum 定义添加到 `scripts/download-binaries.js`，并将其可执行文件 names/version 标记添加到 `src/main/services/BinaryManager.ts` 中的 `BUNDLED_TOOLS`。这两个条目都是必需的：一个提供工件，另一个使提取和快照可用性了解它。

## 消耗工具

需要执行 CLI 的服务会询问 `getToolSnapshots([executableName])` 并使用当前的可用路径。它可以执行 `mise`、捆绑的或系统结果；仅可用性就足以做出该决定。如果可用性为 `none` 并且可执行文件是固定目录工具，则它调用 `installByName({ name: executableName })`； main 解决了规范配方。任意用户提供的配方都会经过 `addCustomTool(definition)`。安装后启动前重新读取快照。

不要在使用者中重新创建 mise commands、自定义注册表写入或二进制搜索路径。使用 BinaryManager 作为主进程路径的 install/remove 和 `application.getPath()` 。 `getBinaryPath()` 和 `isBinaryExists()` 是 Magic Box 搜索目录的较窄的仅主要帮助程序，当使用者需要系统路径可用性时，不能替代快照。
