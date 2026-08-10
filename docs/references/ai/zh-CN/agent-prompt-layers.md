# Agent Prompt 分层

## 目的

智能体 prompt 不是单个字符串，而是多层来源合成的结果。这样既能保留产品级默认行为，也能允许 workspace 和 agent 自己定义长期上下文。

## 层级

常见层级包括：

- Agent system prompt：来自 agent 配置，描述角色、目标和约束。
- Workspace `system.md`：工作区级上下文。
- `SOUL.md`：更稳定的人格/长期行为设定。
- 运行时变量：本次 turn 的模型、workspace、工具、模式等。

## 优先级

越靠近具体 session/turn 的信息越具体，但不能随意覆盖系统级安全和产品约束。workspace 文件用于补充上下文，不应变成绕开 host 策略的后门。

## 更新边界

agent 配置修改后，host 会尝试对 live connection 做 reconcile。部分策略可以热更新，例如工具策略和 permission mode；模型、workspace、skills 等可能需要 rebuild，并在 turn 边界生效。
