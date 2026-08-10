# API Gateway 参考

> 中文副本，对应英文原文：[docs/references/api-gateway/README.md](../README.md)。

说明 Magic Box 内部 API gateway 的职责、请求续接、模型调用适配以及与 AI runtime 的边界。

## 要点

- 统一接收内部请求并转换为目标 provider 可理解的格式。
- 处理 agent continuation 等网关层归一化逻辑。
- 保持调用方参数、数据库历史与运行时请求之间的边界清晰。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# API Gateway Reference`
- `## Where the code lives`
- `## HTTP surface`
- `### Public (no auth)`
- `### Protected (`/v1`, requires API key)`
- `## Request flow (chat / messages / responses)`
- `### Streaming response commitment`
- `## Adapter system`
- `## Lifecycle & configuration`
- `### `ApiGatewayService` (`src/main/features/apiGateway/ApiGatewayService.ts`)`
- `### Running state — Shared Cache, not IPC`
- `### IPC (imperative actions only)`
- `### Preferences (`feature.api_gateway.*`)`
- `### Renderer`
- `## Authentication`
- `## Error handling`
- `## Key invariants`
- `## Related references`
