# 命令系统——使用

渲染器和主代码如何使用命令系统。对于模型和
架构，请参阅 [README.md](./README.md)。

## 公共条目（渲染器）

仅从桶中进口：

```ts
import { CommandContextMenu, CommandShortcut, CommandTooltip, useCommandHandler } from '@renderer/features/command'
```

不要从business导入`@渲染进程/features/command/presentation`等子路径
代码。保持狭窄的公共 API 可以让运行时更改而无需重写调用
网站。

渲染器域 (`src/渲染进程/features/command/`) 故意不在下面
`components/` — 大多数文件是运行时管道而不是通用 UI。它拥有无
业务状态：业务表面仅提供最少的上下文键，并且
他们负责的处理程序。

## 边界

- 共享命令元数据、键绑定、菜单贡献和上下文表达式
实时解析 `src/shared/command`。
- 主进程命令执行、本机菜单创建和全局快捷方式
属于主要服务。
- 渲染器业务组件必须**不**解析快捷方式首选项、格式
快捷标签，或直接解析菜单贡献 - 使用原语
以下。

## 注册处理程序

`CommandProvider` 将按键解析为 `CommandId`；组件供应
行为：

```ts
useCommandHandler('topic.create', handleCreateTopic, { enabled: canCreateTopic })
```

对于相同的命令，最近安装的 **enabled** 处理程序获胜；当它
卸载后，先前启用的处理程序将再次变为活动状态。没有的命令
注册的处理程序永远不会解析（因此按键未受影响）。

> 当可编辑目标（`<input>`、`<textarea>` 或 `contenteditable`
> 元素）被聚焦，调度程序在设计上跳过**无修饰符**快捷方式 -
> 当用户使用普通键（Escape、单个字母）时，不会触发命令
> 打字。修改器快捷键 (Ctrl/Meta/Alt) 仍然随处触发。达不到
> 每个组件的 keydown 监听器可以解决这个问题；如果没有修饰符
> 命令确实必须在编辑器内触发，这是一个上下文key/enablement
> 决定讨论。

## 上下文键

`ContextKeyProvider` 是窗口本地的。上下文键不会被持久化并且不会
跨窗口同步。自动提供基本密钥：`platform`，
`feature.quick_assistant.enabled`，`feature.selection.enabled`。

业务表面贡献范围键：

```ts
useCommandContextKey('chat.active', true)
```

允许的渲染器键由 `RendererCommandContextKey` 定义；只添加一个
当现有命令、快捷方式或菜单贡献需要时。作用域键的使用
堆栈语义——最新安装的值获胜，卸载恢复之前的值。
`undefined` 取消设置一个键； `false` 和 `null` 是有效值。

## 菜单

使用 `CommandContextMenu` 作为参与渲染器上下文菜单
命令系统：

- 命令支持的项目来自 `src/shared/command` 中的 `MenuRegistry`。
- 仅渲染器的额外项目使用 `extraItems` / `getExtraItems` （`type: 'item'` 用于
动作，`type: 'submenu'` 用于嵌套组）。
- 在额外的项目上使用 `shortcutCommand` ，以便菜单解析平台标签
和用户偏好； `shortcutLabel` 是非命令快捷方式的逃生口。

相同的解析菜单模型通过本机适配器或基于 Magic Box UI 呈现
在 `menu.presentation_mode` 上。 `app.menu` 和 `tray.menu` 始终保持原生（主要
流程服务）。

## 推介会

使用这些而不是在功能组件中组装 labels/shortcuts ：

- `CommandShortcut` — 独立快捷方式徽章
- `CommandTooltip` — 工具提示内容，包括命令快捷方式
- `CommandButton` — 命令支持的按钮
- `useResolvedCommand` — 需要命令标签、启用状态的自定义 UI，
快捷标签，并执行回调

## 添加命令

1. **在 `src/shared/command/definitions.ts` 中声明** — 添加一个条目
`COMMAND_DEFINITIONS`（`id`、`titleKey`、`categoryKey`、`scope`，可选
`keybinding` 与 `defaultBinding`，可选 `enablement`)。
2. **添加其快捷键首选项** `shortcut.<commandId>` 通过
数据分类管道 — 添加一个条目
`v2-refactor-temp/tools/data-classify/data/target-key-definitions.json`
（`type: "PreferenceTypes.PreferenceShortcutType"`，`默认值：
{绑定，已启用}`)，然后重新生成：
   ```bash
   cd v2-refactor-temp/tools/data-classify && npm run generate:preferences
   npx biome format --write src/shared/data/preference/preferenceSchemas.ts
   ```
（切勿手动编辑 `preferenceSchemas.ts`。）
3. **提供一个处理程序。** 渲染器范围：`useCommandHandler(id, fn)` 在
拥有表面。主范围：添加一个内置处理程序
`CommandService.registerBuiltInHandlers`。
4. **可选 - 通过添加 `MENU_CONTRIBUTIONS` 条目将其贡献到菜单**
在相关 `MenuLocation` 的 `src/shared/command/menus.ts` 中。

## 测试

渲染器命令测试位于 `src/渲染进程/features/command/__tests__/` 中；共享
`src/shared/command/__tests__/` 中的声明；主要服务于
`src/main/services/__tests__/`。

首先首选有针对性的检查：

```bash
pnpm vitest run src/shared/command src/renderer/features/command
pnpm typecheck
```

当更改涉及共享命令行为、主菜单时运行更广泛的套件
服务或跨窗口合同。
