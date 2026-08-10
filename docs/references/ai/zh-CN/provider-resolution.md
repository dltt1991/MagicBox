# Provider 解析

## 目的

Provider 解析负责把用户配置的模型 id 和 provider 设置转换为一次具体调用所需的 endpoint、adapter family、认证信息和模型名。

## endpointConfigs

一个 provider 可以有多个 endpoint config。每个 endpoint config 可以声明自己的：

- API host
- adapter family
- headers
- 变体 suffix
- 特殊兼容选项

运行时按 endpoint 解析，而不是通过 provider 名称猜测 SDK 包。

## Adapter family

`adapterFamily` 决定使用哪一类 AI SDK provider adapter。这个选择属于 endpoint，而不是 provider。这样同一个 provider 下可以挂不同协议或中转服务。

## 自定义 provider

仓库里支持一些自定义 provider extension，例如 aihubmix、newapi。它们通过扩展注册表参与 provider 配置和模型解析。

## 设计要点

- endpoint 解析要显式，避免根据 URL 或 provider id 做脆弱推断。
- 模型解析和参数转换应在主进程完成。
- provider 扩展只能贡献明确的行为，不应绕开统一管线。
