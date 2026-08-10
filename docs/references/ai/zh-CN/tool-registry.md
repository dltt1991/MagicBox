# 工具注册表

## 模型

AI SDK 工具注册表使用 `ToolEntry` 描述工具：

```ts
interface ToolEntry {
  name: string
  namespace: string
  namespaceLabel?: string
  description: string
  defer: 'never' | 'always' | 'auto'
  tool: Tool
  applies?(scope): boolean
}
```

`registry` 是主进程内的单例。工具文件在模块导入时注册；请求时由 `buildAgentParams` 读取并筛选。Claude Code runtime 使用另一套工具系统，由 `tools/adapters/claudeCode/agentTools.ts` 直接从 MCP server 和内置描述符构建，不消费 AI SDK 的 `ToolRegistry`。

## wire name 约定

双下划线 `__` 用作段分隔符：

| 来源 | 命名模式 | 示例 |
|---|---|---|
| 内置工具 | 固定名称 | `web_search`、`kb_search` |
| MCP 工具 | `mcp__<server-slug>__<tool-slug>_<digest>` | `mcp__gmail__sendMessage_a1b2...` |
| Meta 工具 | `tool_<verb>` | `tool_search`、`tool_invoke` |

MCP 名称中的 digest 基于稳定 server id 和原始 protocol tool name。CJK 名称会尽量罗马化，保证 slug 可读。

## 内置工具

AI SDK adapter 注册的内置工具包括：

- `web_search`：调用配置好的网络搜索 provider。
- `web_fetch`：抓取 URL 内容。
- `kb_search`：在当前知识库范围内做语义搜索。
- `kb_list`：枚举可用知识库和文档。

每个工具都有 `applies` 条件，例如只有 assistant 设置启用 web search 时，`web_search` 才会进入工具集。

## MCP 工具

MCP 工具通过两个阶段进入 registry：

1. `resolveAssistantMcpToolIds` 根据 assistant 启用的 MCP server 和禁用列表得到工具 id 集合。
2. `syncMcpToolsToRegistry` 从 `McpCatalogService.listTools` 读取缓存目录，注册匹配的工具。

热路径只读缓存，不直接连接上游 MCP server。这样坏掉或很慢的 MCP server 不会阻塞 chat / agent 启动。代价是工具可用性是最终一致的：冷缓存 server 可能要到下一次会话才出现。

## Meta 工具

Meta 工具把 registry 暴露为“搜索、查看、调用”的接口：

| 工具 | 是否注入 | 用途 |
|---|---|---|
| `tool_search` | 是 | 按 namespace 和 query 浏览延迟暴露的工具池 |
| `tool_inspect` | 是 | 输出某个工具的 JSDoc stub，帮助模型构造参数 |
| `tool_invoke` | 是 | 通过 JSON 参数调用任意 registry 工具 |
| `tool_exec` | 否 | 沙箱 JS 执行工具，已定义但默认不注入 |

`tool_exec` 没有注入，因为它会运行模型生成的 JS，权限面过大，需要明确偏好项才能重新启用。

## 延迟暴露

当工具很多时，`applyDeferExposition` 会把部分工具从模型直接可见的工具集中移除，只注入 `tool_search` / `tool_inspect` / `tool_invoke`。系统 prompt 中会列出延迟工具的 namespace，让模型先搜索再调用。

需要审批的工具永远不会被延迟暴露。否则它们会绕开 SDK 原生审批 gate，只能通过 `tool_invoke` 访问，审批卡就不会出现。作为兜底，meta 工具执行时也会拒绝调用需要审批的工具。

## applies 与工具调用修复

`applies(scope)` 用于按请求上下文判断工具是否可用。异常会被记录并视为 inactive。

`createAiRepair(...)` 会作为 AI SDK 的 `experimental_repairToolCall`。当模型输出 malformed args 时，它有一次机会用 LLM 修复参数。未知工具名等错误不会修复。
