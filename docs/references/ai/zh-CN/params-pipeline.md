# 参数管线

## 目的

`buildAgentParams` 把一次业务请求转换成底层模型/Agent 可执行的参数。它负责把模型能力、provider 差异、工具、附件、插件和特殊功能组合到一起。

## RequestFeature

参数构建采用 `RequestFeature` 模型。每个 feature 可以贡献：

- 参数修改。
- system prompt 片段。
- 工具。
- hook。
- provider options。
- 媒体能力处理。

这样不同能力可以独立组合，避免在一个巨大函数里硬编码所有分支。

## 工具注入

管线会读取工具注册表，根据 assistant/agent 设置、MCP 选择、知识库 scope、web search 开关等筛选可用工具。

当工具数量太多时，管线可以应用延迟暴露：只把 meta-tools 注入模型，让模型先搜索再调用真实工具。

## Provider 特性

不同 provider 支持的参数和能力不完全一致。参数管线通过 adapter family、model capabilities 和 feature hooks 做兼容处理，例如 reasoning、cache、工具 schema 修正、附件能力等。

## 输出

最终结果会被传给 `Agent` 或其他 runtime：

- provider id / settings
- model id
- system instructions
- messages
- tools
- options
- hookParts
- media capabilities
