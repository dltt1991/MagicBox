# 指挥系统

命令系统是**应用程序可以做什么**的唯一事实来源
允许键盘快捷键、application/context 菜单项或
按钮都触发相同的行为。

它取代了以前的三个独立系统（键盘快捷键、本机
应用程序菜单和临时上下文菜单），每个菜单都用于维护其
自己的定义、密钥格式和调度接线。

- [command-usage.md](./command-usage.md) — 如何注册处理程序，贡献
菜单、渲染命令支持的 UI 以及添加新命令。

## 命令、快捷方式和菜单 — 关系

**命令是应用程序执行的操作；快捷方式是寻求它的一种“方式”。** 他们
是故意分开的概念：

- **命令**是行为单元，由 `CommandId` (e.g.
`topic.create`、`app.zoom.in`、`chat.message.search`)。它拥有行为和
对它是如何触发的一无所知。
- **快捷方式**是*用于*命令的键绑定。 **菜单项**是一个菜单项
*用于*命令。 **按钮**调用命令。所有这些都只是触发器
解析为 `CommandId` 并运行其处理程序。

```
 keyboard shortcut ─┐
 menu item ─────────┼──▶  CommandId  ──▶  handler (renderer or main)
 button / palette ──┘
```

这种分裂会产生两个后果：

- **没有自由浮动的快捷方式。** 每个快捷方式、菜单项和按钮
解析为命令。你永远不会将键绑定到内联回调 - 你将它绑定
到 `CommandId`，表面单独注册处理程序。添加新的
触发某些事情的方式永远不会触及行为，并且会改变行为
永远不会触动它的触发器。
- **一条命令可以有零个、一个或多个触发器。**一条命令可以是
仅菜单（无默认键）、仅键盘或两者；键绑定甚至允许
`additionalBindings`（e.g。数字键盘缩放）。无论哪种方式，命令都是相同的。

### 命令与其快捷方式的关系如何

|概念|它住在哪里|`topic.create` 的示例|
| --- | --- | --- |
|命令定义|`COMMAND_DEFINITIONS` (`src/shared/command/definitions.ts`)|`{ id: 'topic.create', scope: '渲染进程', keybinding: { defaultBinding: ['CommandOrControl','N'] } }`|
|默认键绑定|命令的 `keybinding.defaultBinding`|`Cmd/Ctrl + N`|
|**用户覆盖**|偏好 `shortcut.<commandId>`|`shortcut.topic.create` → `{ binding, enabled }`|
|处理程序|通过 `useCommandHandler` （渲染器）或内置（主）的表面|`useCommandHandler('topic.create', addNewTopic)`|
|菜单项（可选）|`MENU_CONTRIBUTIONS` 条目|`{ location: 'chat.input.tools.context', command: 'topic.create' }`|

因此，**每个命令只有一个快捷首选项键** (`shortcut.<id>`)：
命令的*默认*绑定来自其定义，用户的编辑
**设置→快捷方式**通过该首选项键覆盖它。在运行时
有效绑定是“用户首选项（如果设置），否则定义默认值”。

命令的 `scope: 'main' | '渲染进程' | 'both'` 决定其处理程序运行的位置
以及谁监听其密钥：主进程全局快捷方式注册器
(`ShortcutService`) 代表 main/global，或每个窗口的 keydown 调度程序
(`CommandProvider`) 用于渲染器。

`COMMAND_DEFINITIONS` 是唯一的事实来源 — `CommandId` 联盟、
键绑定规则、每个命令的 `shortcut.<id>` 键和 __PH1__/__PH2__
上下文表达式都是从它派生出来的。菜单贡献是并行的
由相同 `CommandId` 键入的声明 (`MENU_CONTRIBUTIONS`)。

## 架构——三层

### 1. 共享声明 — `src/shared/command/`

纯数据和纯函数，没有 Electron 或 React。

|文件|责任|
| --- | --- |
|`definitions.ts`|`COMMAND_DEFINITIONS` (SoT)，派生 `CommandId`、`KEYBINDING_RULES`、`REGISTERED_KEYBINDINGS`、查找|
|`keybindings.ts`|解析绑定 → 命令、default/effective 快捷方式首选项、冲突检测、标签格式|
|`menus.ts`|`MENU_CONTRIBUTIONS`、`MenuRegistry` 和 `resolveMenuPresentationMode`|
|`contextExpr.ts`|parser/evaluator 代表 __PH0__/__PH1__ 表达式 + `ContextKeyService`|
|`types.ts`|所有 command/keybinding/menu/context 类型|

标记格式（键入的快捷词汇、规范化、display/accelerator
格式化）位于 `src/shared/shortcuts/tokens.ts` 中； `src/shared/shortcuts/types.ts`
仅保留 `ShortcutPreferenceKey` + `ResolvedShortcut`。

### 2. 主运行时 — `src/main/services/`

|服务|责任|
| --- | --- |
|`CommandService`|保存主端处理程序注册表； `execute(command, window?, ctx?)` 进行上下文评估；电线内置处理程序 (window/zoom/settings/quick‑assistant/selection)；注册本机弹出菜单 IPC (`NativeCommandPopupMenu_Show`)|
|`nativePopupMenu.ts`|无状态模块——将渲染器提供的菜单模型具体化为 Electron 原生弹出窗口，并报告所选命令； `CommandService` 注入 execute/gate 回调|
|`ShortcutService`|从 `REGISTERED_KEYBINDINGS`（非渲染器范围）→ `CommandService.execute` 注册 `globalShortcut` 加速器|
|`AppMenuService`|从 `menuRegistry.resolve({ location: 'app.menu' })` 到 `menu/adapters/nativeMenuAdapter` → `CommandService.execute` 构建 macOS 应用程序菜单|

### 3. 渲染器运行时 — `src/渲染进程/features/command/`

|片|责任|
| --- | --- |
|`CommandProvider`|一个窗口级 `keydown` 调度程序 + 处理程序堆栈 (`useCommandHandler`, `useCommandRuntime`)|
|`ContextKeyProvider`|窗口本地上下文键 (`useCommandContextKey`)|
|`presentation.tsx`|`CommandShortcut`、`CommandTooltip`、`CommandButton`、`useResolvedCommand`|
|`menus.tsx`|`CommandContextMenu` — 渲染 Magic Box UI 或基于 `menu.presentation_mode` 的本机弹出窗口|

每个渲染器窗口安装 `<ContextKeyProvider><CommandProvider>` 一次 — 每个
窗口根目录安装它：`windows/main/MainApp.tsx` 和 `windows/subWindow/SubWindowApp.tsx`。

### 偏好设置

- `shortcut.<commandId>` — `PreferenceShortcutType` (`{ binding, enabled }`)，
每个命令的可编辑绑定。通过数据分类管道生成（参见
[command-usage.md](./command-usage.md#adding-a-command))。
- `menu.presentation_mode` — `'cherry' | 'native'`。阅读者：`CommandProvider`
选择菜单渲染器。目前还没有设置 UI（计划中）；它
当前通过首选项模式进行默认设置。

## 调度流量

- **键盘（渲染器）：** `keydown` → `CommandProvider` →
`getShortcutBindingFromKeyboardEvent` →
`resolveCommandByKeybinding({ scope: '渲染进程', canExecuteCommand: hasHandler })`
→ 主动处理程序。当可编辑目标（`<input>`、`<textarea>` 或
`contenteditable` 元素）集中调度程序跳过无修饰符
快捷键，这样打字就不会被劫持；修饰符快捷键 (Ctrl/Meta/Alt) 仍然
火。当命令具有已注册的处理程序时，它仅 `preventDefault`s
解决了。
- **键盘（全局）：** 操作系统 `globalShortcut` → `ShortcutService` →
`CommandService.execute(command, window)`。
- **原生菜单：** 渲染器构建一个 `NativePopupMenuModel` →
`window.api.command.showNativePopupMenu` → `CommandService` 的
`NativeCommandPopupMenu_Show` 处理程序 → `showNativePopupMenu` （在
`nativePopupMenu.ts`)。主要处理的命令在那里运行；渲染器处理的
返回到渲染器运行时执行。
