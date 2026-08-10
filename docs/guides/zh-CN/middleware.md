# 如何为 AI Provider 编写中间件

本文档指导开发者如何为我们的 AI Provider 框架创建和集成自定义中间件。中间件提供了一种强大而灵活的方式来增强、修改或观察 Provider 方法调用——例如，日志记录、缓存、请求/响应转换和错误处理。

## 架构概览

我们的中间件架构借鉴了 Redux 的三层设计，结合 JavaScript Proxy 动态地将中间件应用于 Provider 方法。

- **Proxy**：拦截对 Provider 方法的调用并通过中间件链路由它们。
- **中间件链**：按顺序执行的一系列中间件函数。每个中间件可以处理请求/响应，然后将控制权传递给链中的下一个中间件，或在某些情况下提前终止链。
- **Context**：在中间件之间传递的对象，携带有关当前调用的信息（方法名、原始参数、Provider 实例和中间件自定义数据）。

## 中间件类型

当前支持两种主要类型的中间件，共享相似的结构但针对不同场景：

1. **`CompletionsMiddleware`**：专门为 `completions` 方法设计。这是最常用的中间件类型，因为它允许对 AI 模型的核心聊天/文本生成功能进行细粒度控制。
2. **`ProviderMethodMiddleware`**：可应用于 Provider 上任何其他方法的通用中间件（例如，`translate`、`summarize`，如果这些方法也通过中间件系统包装）。

## 编写 `CompletionsMiddleware`

`CompletionsMiddleware` 的基本签名（TypeScript 类型）是：

```typescript
import { AiProviderMiddlewareCompletionsContext, CompletionsParams, MiddlewareAPI } from './AiProviderMiddlewareTypes'

export type CompletionsMiddleware = (
  api: MiddlewareAPI<AiProviderMiddlewareCompletionsContext, [CompletionsParams]>
) => (
  next: (context: AiProviderMiddlewareCompletionsContext, params: CompletionsParams) => Promise<any>
) => (context: AiProviderMiddlewareCompletionsContext, params: CompletionsParams) => Promise<void>
```

让我们分解这个三层结构：

1. **第一层 `(api) => { ... }`**：

   - 接收一个 `api` 对象。
   - `api` 提供以下方法：
     - `api.getContext()`：获取当前调用上下文（`AiProviderMiddlewareCompletionsContext`）。
     - `api.getOriginalArgs()`：获取传递给 `completions` 方法的原始参数数组（即 `[CompletionsParams]`）。
     - `api.getProviderId()`：获取当前 Provider 的 ID。
     - `api.getProviderInstance()`：获取原始 Provider 实例。
   - 此函数通常用于一次性设置或获取所需的服务/配置。它返回第二层函数。

2. **第二层 `(next) => { ... }`**：

   - 接收一个 `next` 函数。
   - `next` 代表中间件链中的下一个环节。调用 `next(context, params)` 将控制权传递给下一个中间件，或者如果当前中间件是链中的最后一个，它会调用核心 Provider 方法逻辑（例如，实际的 SDK 调用）。
   - `next` 接收当前的 `context` 和 `params`（可能已被上游中间件修改）。
   - **重要**：`next` 的返回类型通常是 `Promise<any>`。对于 `completions` 方法，如果 `next` 调用实际的 SDK，它会返回原始 SDK 响应（例如，OpenAI 流对象或 JSON 对象）。你需要处理此响应。
   - 此函数返回第三个（也是最核心的）函数。

3. **第三层 `(context, params) => { ... }`**：
   - 这是主要中间件逻辑执行的地方。
   - 它接收当前的 `context`（`AiProviderMiddlewareCompletionsContext`）和 `params`（`CompletionsParams`）。
   - 在这里你可以：
     - **在调用 `next` 之前**：
       - 读取或修改 `params`。例如，添加默认参数、转换消息格式。
       - 读取或修改 `context`。例如，设置时间戳以便稍后计算延迟。
       - 执行检查；如果条件不满足，跳过调用 `next` 并返回或抛出错误（例如，参数验证失败）。
     - **调用 `await next(context, params)`**：
       - 这是将控制权传递到下游的关键步骤。
       - `next` 的返回值是原始 SDK 响应或下游中间件结果；相应地处理它（例如，如果它是流，开始消费它）。
     - **在调用 `next` 之后**：
       - 处理来自 `next` 的结果。例如，如果 `next` 返回了流，迭代它并通过 `context.onChunk` 发送数据块。
       - 根据 `context` 变化或 `next` 结果执行进一步操作。例如，计算总耗时、记录日志。

### 示例：简单的日志中间件

```typescript
import {
  AiProviderMiddlewareCompletionsContext,
  CompletionsParams,
  MiddlewareAPI,
} from './AiProviderMiddlewareTypes'
import { ChunkType } from '@renderer/types'

export const createSimpleLoggingMiddleware = (): CompletionsMiddleware => {
  return (api: MiddlewareAPI<AiProviderMiddlewareCompletionsContext, [CompletionsParams]>) => {
    return (next: (context: AiProviderMiddlewareCompletionsContext, params: CompletionsParams) => Promise<any>) => {
      return async (context: AiProviderMiddlewareCompletionsContext, params: CompletionsParams): Promise<void> => {
        const startTime = Date.now()
        const onChunk = context.onChunk

        logger.debug(
          `[LoggingMiddleware] Request for ${context.methodName} with params:`,
          params.messages?.[params.messages.length - 1]?.content
        )

        try {
          const rawSdkResponse = await next(context, params)

          const duration = Date.now() - startTime
          logger.debug(`[LoggingMiddleware] Request for ${context.methodName} completed in ${duration}ms.`)
        } catch (error) {
          const duration = Date.now() - startTime
          logger.error(`[LoggingMiddleware] Request for ${context.methodName} failed after ${duration}ms:`, error)

          if (onChunk) {
            onChunk({
              type: ChunkType.ERROR,
              error: { message: (error as Error).message, name: (error as Error).name, stack: (error as Error).stack }
            })
            onChunk({ type: ChunkType.BLOCK_COMPLETE, response: {} })
          }
          throw error
        }
      }
    }
  }
}
```

### `AiProviderMiddlewareCompletionsContext` 的重要性

`AiProviderMiddlewareCompletionsContext` 是在中间件之间传递状态和数据的核心对象。它通常包含：

- `methodName`：当前方法名（始终为 `'completions'`）。
- `originalArgs`：传递给 `completions` 的原始参数数组。
- `providerId`：Provider 的 ID。
- `_providerInstance`：Provider 实例。
- `onChunk`：来自原始 `CompletionsParams` 的用于流式传输数据块的回调。**所有中间件都应通过 `context.onChunk` 发送数据。**
- `messages`、`model`、`assistant`、`mcpTools`：从 `CompletionsParams` 提取的常用字段，便于访问。
- **自定义字段**：中间件可以向上下文添加自定义字段供下游中间件使用。例如，缓存中间件可能设置 `context.cacheHit = true`。

**关键**：当你在中间件中修改 `params` 或 `context` 时，这些修改会传播到下游中间件（如果在 `next` 调用之前进行）。

### 中间件顺序

中间件的执行顺序至关重要。它们按 `AiProviderMiddlewareConfig` 数组中定义的顺序执行。

- 请求流经第一个中间件，然后是第二个，依此类推。
- 响应（或 `next` 调用结果）以相反的顺序"冒泡"回来。

例如，如果链是 `[AuthMiddleware, CacheMiddleware, LoggingMiddleware]`：

1. `AuthMiddleware` 执行其"在 `next` 之前"的逻辑。
2. 然后 `CacheMiddleware` 执行其"在 `next` 之前"的逻辑。
3. 然后 `LoggingMiddleware` 执行其"在 `next` 之前"的逻辑。
4. 核心 SDK 调用（或链的末端）。
5. `LoggingMiddleware` 首先接收结果，执行其"在 `next` 之后"的逻辑。
6. 然后 `CacheMiddleware` 接收结果，执行其"在 `next` 之后"的逻辑（例如，存储结果）。
7. 最后 `AuthMiddleware` 接收结果，执行其"在 `next` 之后"的逻辑。

### 注册中间件

中间件在 `src/renderer/providers/middleware/register.ts`（或类似的配置文件）中注册。

```typescript
// register.ts
import { AiProviderMiddlewareConfig } from './AiProviderMiddlewareTypes'
import { createSimpleLoggingMiddleware } from './common/SimpleLoggingMiddleware'
import { createCompletionsLoggingMiddleware } from './common/CompletionsLoggingMiddleware'

const middlewareConfig: AiProviderMiddlewareConfig = {
  completions: [
    createSimpleLoggingMiddleware(),
    createCompletionsLoggingMiddleware()
    // ... other completions middleware
  ],
  methods: {
    // translate: [createGenericLoggingMiddleware()],
    // ... middleware for other methods
  }
}

export default middlewareConfig
```

### 最佳实践

1. **单一职责**：每个中间件应专注于特定功能（例如，日志记录、缓存、转换特定数据）。
2. **最小化副作用**：除了通过 `context` 或 `onChunk` 的显式副作用外，避免修改全局状态或产生隐藏的副作用。
3. **错误处理**：
   - 在中间件内使用 `try...catch` 来处理潜在错误。
   - 决定是否在内部处理错误（例如，通过 `onChunk` 发送错误块）或将其重新抛出到上游。
   - 如果重新抛出，确保错误对象包含足够的信息。
4. **性能**：中间件会增加请求处理的开销。避免非常耗时的同步操作。确保 IO 密集型操作是异步的。
5. **可配置性**：通过参数或配置使中间件行为可调整。例如，日志中间件可以接受日志级别参数。
6. **上下文管理**：
   - 谨慎地向 `context` 添加数据。避免污染上下文或添加过大的对象。
   - 清楚定义添加到 `context` 的字段的目的和生命周期。
7. **调用 `next`**：
   - 除非你有充分的理由提前终止请求（例如，缓存命中、授权失败），**始终确保调用 `await next(context, params)`**。否则，下游中间件和核心逻辑将不会执行。
   - 理解 `next` 的返回值并正确处理它，特别是当它是流时。你负责消费流或将其传递给另一个可以消费它的组件/中间件。
8. **清晰命名**：为你的中间件及其工厂函数提供描述性名称。
9. **文档和注释**：为复杂的中间件逻辑添加注释，解释其工作原理和目的。

### 调试技巧

- 在中间件的关键点使用 `logger.debug` 或调试器来检查 `params`、`context` 状态和 `next` 返回值。
- 暂时简化中间件链，只保留你正在调试的中间件和最简单的核心逻辑，以隔离问题。
- 编写单元测试以独立验证每个中间件的行为。
