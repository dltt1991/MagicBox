# 图片生成参数

## 目的

不同图片生成 provider 对尺寸、质量、风格、数量、参考图等参数支持不一致。该文档定义 Magic Box 如何归一化用户意图，并在 provider 支持范围内传递参数。

## 核心原则

- 用户表达的是产品层参数，不能直接等同于某个 provider 的裸字段。
- 不支持的参数要降级或忽略，并保持行为可解释。
- 默认值应稳定，避免同一 UI 操作在不同 provider 下产生过大差异。

## 常见参数

- prompt / negative prompt
- aspect ratio
- size
- quality
- style
- seed
- batch count
- reference images

## Provider 映射

参数映射应在 provider adapter 或工具层集中处理。UI 不应该知道某个 provider 的全部专有字段，也不应该在渲染端拼装 provider-specific payload。

## 验证

参数进入 provider 前应经过 schema 或显式校验。对用户可见的错误应说明哪个参数不被支持，或者为什么被降级。
