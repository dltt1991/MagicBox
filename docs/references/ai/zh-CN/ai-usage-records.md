# AI 用量记录

## 目标

AI 用量记录用于尽力捕获每次 provider 调用的 token、费用、模型、来源和性能指标。它服务于统计、调试和性能视图，不应影响核心对话成功路径。

## 归属

每条 usage record 要能回答：

- 哪个 topic / session 触发。
- 哪条 assistant message 归属。
- 使用了哪个 provider 和模型。
- 是否来自 agent runtime、普通聊天、gateway 或外部调用。
- 当时的 agent/model 快照是什么。

## Agent session

Claude Code runtime 可能在一个 UI turn 中发起多次 provider 请求。driver 会把 SDK assistant message、result usage、tool timing 等转换成主进程可归属的记录。

发生 steer boundary 时，边界前后的 provider 调用要分别绑定到不同 assistant 行，避免 usage 挂错消息。

## 原则

- usage 记录是 best-effort，不阻塞主流程。
- 不把累计 usage 平均摊到多次请求。
- 缺失 TTFT 时不伪造。
- 工具 span 和 provider usage 各自有所有者，展示层再 join。

## 查询

读侧 API 应该是有界的，避免对大历史做无界扫描。记录需要保留不可变快照，这样 agent 或 model 后续改名、删除后，历史用量仍可解释。
