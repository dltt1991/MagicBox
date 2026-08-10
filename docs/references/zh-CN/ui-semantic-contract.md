# UI 语义契约

Magic Box 通过唯一的机器可读属性 `data-ui` 暴露应用自有的、有意义的 DOM 边界。它是面向用户主题、端到端测试、检查工具以及受控 AI 自动化的受维护选择器接口。内部 class、偶然形成的 DOM 祖先层级以及未标记的实现包装层都不属于该契约。

主要消费方是高级自定义 CSS。对于常见的主题定制，结构化主题变量仍是首选面；请通过
[`@cherrystudio/ui` 变量目录](../../../packages/ui/docs/variable-catalog.md) 选用公开变量。`data-ui` 是变量无法表达的结构化规则的语义逃生通道。测试与自动化可以复用同一套坐标，而无需引入另一种选择器协议。

## Token 协议

`data-ui` 是一组以空白分隔、无序的静态语义 token：

| Token | 用途 | 稳定性 |
| --- | --- | --- |
| `chat.message` | 业务或组件角色 | 显式角色稳定；推断角色为尽力而为 |
| `part:message-content` | 可复用组件结构 | 受维护的公开 API |

Token 描述的是角色，而非唯一节点标识。多条消息、可复用部件或不同渲染分支可以有意共用同一个 token。

```html
<article data-ui="chat.message">
  <div data-ui="part:message-content"></div>
</article>
```

请使用 token 匹配（`~=`），绝不要使用子串匹配：

```css
/* Every chat message */
[data-ui~='chat.message'] {
  display: grid;
}

/* One reusable component part */
[data-ui~='part:dialog-content'] {
  border-radius: 8px;
}
```

普通实现层子节点不需要各自的 token。自定义 CSS 可以从最近的语义边界向下遍历；这类后代选择器有意依赖内部 DOM，重构后可能需要更新：

```css
[data-ui~='chat.message'] > div:nth-child(2) {
  max-width: none;
}
```

如果某个子节点成为常用或兼容性敏感的目标，请通过显式语义角色或 `data-slot` 把它提升进受维护契约。

## 构建期生成

该 Vite 前置转换插件在 React 编译前使用 SWC 解析 TSX/JSX。它会标注：

- 由某个组件或 fragment 分支渲染的原生元素根节点；
- 带有显式 `data-ui`、`data-slot`、`data-testid`、稳定的 `id`/`name`/`role`，或直接命名的业务处理函数（如 `handleCopy`）的嵌套节点；
- 每个窗口的 body 以及公开的 `svg` 根节点。

一旦存在父级组件边界，普通的嵌套 HTML 就保持不标记，包括相邻的布局包装层，以及段落、标题、section、列表项等本身具有语义的标签。消费方可以从最近的组件坐标向下遍历，而不必把每个 DOM 节点都变成独立的选择器。若某个内部区域需要独立的长期样式，优先抽取一个拥有该区域的组件，或显式提升为 `part:*`。

直接命名的业务处理函数可以提升一个嵌套操作节点。通用事件处理与管道逻辑（如 `handleClick`、`handleKeyDown`、`stopPropagation`、`preventDefault`）不会创建边界。

可复用组件结构由同一属性中的 `part:*` token 表示。项目中已有的静态 `data-slot` 标记保持不变。生成器将其值视为作者声明的结构语义：

```html
<div data-slot="dialog-content" data-ui="part:dialog-content"></div>
```

显式 `data-ui` part 与 `data-slot` 值遵循同一套归一化规则。原有的 `data-slot` 属性保持完整，因此现有组件样式、测试与自定义 CSS 均可继续工作。

语义推断依次使用：

1. 以静态 `data-ui` 值书写的显式语义角色；
2. 精简后的源码域与所属组件名；
3. 当内部节点被提升时，作者声明的 `part:*`、稳定语义属性与可信业务处理函数名。

例如，chat 源码域下一个假设的 `MessageTimeline` 组件可以产生 `chat.message-timeline`；绑定到 `handleCopy` 的嵌套复制操作可以产生 `chat.message-timeline.action.copy`。（真实的消息分组带有显式锚点 `chat.message.group`，它会覆盖推断结果。）技术性路径片段如 `components`、`runtime`、`renderer`，以及原始兜底角色如 `element.div` 均被排除。可见文本永远不作为输入，因此本地化与文案变更不会重命名选择器。行号、时间戳、随机值与 class 名同样被排除。

文件名与组件名让推断出的语义更可读，但它们不是永久的身份系统。移动或重命名组件可能改变其推断角色。长期维护的主题应对那些必须在重构后依然有效的选择器使用显式语义角色或受维护的 `part:*` token。

SVG 绘制内部结构（如 `path`、`g`、`defs`、渐变、蒙版、滤镜与图形）默认属于实现细节。只有当它们带有 `data-ui`、`data-slot`、`data-testid`、`role` 或可信业务处理函数时，才会进入公开契约。`foreignObject` 的 HTML 后代会作为新的语义边界处理。

在源码开发过程中，无需构建应用即可解析语义前缀：

```bash
pnpm ui:contract:query chat.message
```

该命令扫描当前源码，返回匹配的语义角色、元素/组件名与源码位置。它可能返回多个匹配项，且同时包含显式与推断角色；在把某个结果当作稳定项之前，请检查其所属标记中是否有作者声明的 `data-ui` 或 `data-slot`。系统不存在持久化节点注册表，也不生成精确节点 ID。

## 选择器辅助工具

兼容性敏感的业务语义直接在所属组件的标记中声明：

```tsx
<div data-ui="chat.message" />
```

可复用的 `part:*` token 同样在所属组件的标记中声明，可显式书写，也可通过静态 `data-slot` 声明。`parseUiTokens` 供检查工具使用，而 `uiSelector` 与 `uiLocator` 用于组合语义选择器与结构选择器，无需重复实现 token 语法。

当前受维护的应用外壳包括：

- `app.sidebar`、`app.tab-bar`、`app.content` 与 `app.search`；
- `app.detached-window`，用于分离路由窗口的根节点；
- `quick-assistant.view`、`selection.toolbar` 与 `selection.action`，用于辅助窗口与相关界面；
- `file-preview.view`，用于共享的文件预览边界。

当前受维护的功能界面包括：

- `agent.view`；
- `files.view`、`files.navigation` 与 `files.content`；
- `knowledge.view`、`knowledge.navigation` 与 `knowledge.content`；
- `notes.view`、`notes.navigation` 与 `notes.editor`；
- `translate.view`、`translate.input` 与 `translate.output`；
- `paintings.view`；
- `code.view`、`code.navigation` 与 `code.content`；
- `mini-apps.view`。

当前受维护的聊天界面包括：

- `chat.view`、`chat.topic-list`、`chat.topic-list.action.create`、`chat.message-list`、`chat.message` 与
  `chat.message.group`；
- `chat.composer`、`chat.composer.action.send` 与 `chat.composer.action.pause`；
- `part:conversation-navigation`、`part:conversation-main` 与 `part:conversation-inspector`；
- `part:message-content`、`part:message-actions`、`part:message-reasoning` 与 `part:code-block`；
- `part:composer-input` 与 `part:composer-actions`。

当前受维护的设置界面包括：

- `settings.view`、`settings.navigation` 与 `settings.content`。

## 跨窗口的自定义 CSS

每个窗口的 body 都暴露相同的语义根节点：

```html
<body data-ui="app.window">
```

自定义 CSS 按原样插入且不置于层中，而应用样式表与打包的第三方样式表位于级联层内（先是 Tailwind 的各层，然后是 `app`；在 `src/renderer/assets/styles/index.css` 中声明）。由于未分层的普通声明无论加载顺序与选择器优先级如何都会胜过所有分层声明，自定义 CSS 可以使用完整的 CSS 能力——包括 `:root`、`body`、顶层 at-rule 以及语义化的 `data-ui` 选择器——并且无需大面积使用 `!important` 即可生效。每个常规渲染窗口都订阅同一个 `ui.custom_css` 偏好项，并将该样式表注入自身文档。预启动窗口（`migrationV2`、`userDataRelocation`）是例外，因为它们不初始化偏好设置。

两条有意为之的限制：`!important` 会反转层优先级，因此分层的应用 `!important` 规则会胜过未分层的自定义 `!important` 规则——这也是自定义 CSS 不应使用它的另一个原因。另外，在运行时注入未分层样式的第三方组件（目前是 emoji 选择器）位于层体系之外，因此重写其内部样式只能退回到普通的优先级规则。

```css
:root {
  --primary: hotpink;
  --primary-foreground: black;
}
```

请覆盖公开的语义变量对，而不是生成的 `--color-*` 适配输出。组件与页面样式应继续使用语义化工具类或对应的无前缀变量。

Electron 渲染窗口是彼此独立的文档，因此注入某一个窗口的样式表不会泄漏到另一个窗口。CSS 无法跨越 Shadow DOM 或 iframe 边界；应用自有的隔离根节点若要对外公开，必须暴露自己的语义边界。

## 兼容性规则

- 语义角色是小写、点分隔的标识符，而不是对当前文案或外观的描述。
- 语义角色是集合式坐标，而非唯一 ID；选择器与定位器可能匹配多个节点。
- 显式语义角色与 `part:*` token 属于受维护的公开 API。重命名时必须提供兼容别名并附上破坏性变更记录。
- 推断角色是确定性的，但属于尽力而为，当文件、组件或 DOM 职责发生迁移时可能改变。
- 内部后代选择器是受支持的 CSS，但不保证能在结构重构后继续有效。
- 测试与自动化应从语义或 `part:*` token 出发，再使用无障碍角色完成目标交互。
