# 模型重试与回退

## 目的

模型调用可能因为网络、限流、临时 provider 错误而失败。Magic Box 使用 `ai-retry` 风格的包装，在模型层处理 transient retry 和用户配置的 fallback models。

## 同模型重试

对可重试错误，系统可以在同一个模型上重试。重试发生在 provider 调用层，而不是 Agent loop 自己重新构造业务 turn。

## Fallback models

用户可以配置 fallback models。当主模型失败且错误符合策略时，请求会尝试后续模型。

## wrapModel

`wrapModel` 是把 retry/fallback 包到已解析模型外层的关键点。它发生在模型 middleware 和 settings transform 之后，确保最终模型已经完成 provider 解析和参数变换。

## 适用边界

- 聊天、Agent loop、生成等 provider 调用可以使用模型层 retry/fallback。
- Embedding/rerank 等能力有各自策略。
- 业务层 terminal failure 不应被误判成 provider transient error。
