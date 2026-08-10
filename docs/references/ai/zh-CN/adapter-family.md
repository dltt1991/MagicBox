# Adapter Family

## 是什么

Adapter family 是一次请求选择具体 AI SDK provider adapter 的依据。它由 endpoint 配置声明，而不是由 provider id 或 API host 推断。

## 为什么按 endpoint

同一个 provider 可能有多个 endpoint，甚至不同 endpoint 背后是不同协议或中转服务。如果按 provider 名称选择 adapter，会导致多 endpoint 场景无法准确路由。

## 解析流程

1. 根据用户选择的模型找到 provider。
2. 解析当前有效 endpoint。
3. 读取 endpoint 上的 `adapterFamily`。
4. 使用对应 adapter 构造模型。
5. 再进入参数管线和 Agent/stream 执行。

## 不变量

- adapter family 是显式配置。
- 请求时不根据 URL 做猜测。
- 自定义 provider 扩展也必须服从这个解析边界。
