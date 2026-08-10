# Magic Box 文档

## 指南

| 文档 | 说明 |
|----------|-------------|
| [开发环境搭建](../guides/zh-CN/development.md) | 开发环境搭建 |
| [Linux 打包](../guides/zh-CN/linux-packaging.md) | Linux 包构建与原生依赖预编译产物 |
| [贡献指南](../guides/zh-CN/contributing.md) | 如何贡献代码 |
| [分支策略](../guides/zh-CN/branching-strategy.md) | Git 分支工作流 |
| [测试计划](../guides/zh-CN/test-plan.md) | 测试计划与发布通道 |
| [i18n 指南](../guides/zh-CN/i18n.md) | 国际化指南 |
| [日志指南](../guides/zh-CN/logging.md) | 如何使用 logger service |
| [中间件](../guides/zh-CN/middleware.md) | 如何编写 AI Provider 中间件 |
| [性能诊断](../guides/zh-CN/diagnostics.md) | 主进程性能探针与 `CS_DIAGNOSTICS` |

## 参考

### 架构

| 文档 | 说明 |
|----------|-------------|
| [架构总览](../references/architecture-overview.md) | 全局架构、进程模型、数据流 |

### AI 内核

| 文档 | 说明 |
|----------|-------------|
| [AI 参考](../references/ai/zh-CN/README.md) | 主进程 AI 管线：stream manager、agent loop、providers、tools |
| [核心架构](../references/ai/zh-CN/core-architecture.md) | 从用户输入到 LLM 响应的端到端调用链路 |
| [流管理器](../references/ai/zh-CN/stream-manager.md) | 活跃流注册表、broker、重连、持久化 |
| [适配器族](../references/ai/zh-CN/adapter-family.md) | 如何决定 endpoint → `@ai-sdk/*` 包的路由 |

### 数据系统

| 文档 | 说明 |
|----------|-------------|
| [数据系统总览](../references/data/README.md) | 系统选型、架构与模式 |
| [Boot Config 总览](../references/data/boot-config-overview.md) | 早期启动配置系统 |
| [Boot Config Schema 指南](../references/data/boot-config-schema-guide.md) | 新增 boot config key |
| [Cache 总览](../references/data/cache-overview.md) | 三层缓存架构与设计不变式 |
| [Cache 使用](../references/data/cache-usage.md) | useCache hooks、直接调用 API、主进程订阅 |
| [Cache Schema 指南](../references/data/cache-schema-guide.md) | 新增 cache key（固定与模板） |
| [Preference 总览](../references/data/preference-overview.md) | 用户设置管理 |
| [Preference 使用](../references/data/preference-usage.md) | usePreference hook 示例 |
| [Preference Schema 指南](../references/data/preference-schema-guide.md) | 新增 preference key |
| [DataApi 总览](../references/data/data-api-overview.md) | 业务数据 API 架构 |
| [渲染进程中的 DataApi](../references/data/data-api-in-renderer.md) | useQuery/useMutation 模式 |
| [主进程中的 DataApi](../references/data/data-api-in-main.md) | Handlers、Services、Repositories |
| [API 设计规范](../references/data/api-design-guidelines.md) | RESTful 设计规则 |
| [API 类型](../references/data/api-types.md) | API 类型系统、schema、错误处理 |
| [数据库模式](../references/data/database-patterns.md) | 数据库命名与 schema 模式 |
| [分层预设模式](../references/data/best-practice-layered-preset-pattern.md) | 支持用户覆盖的预设 |
| [V2 迁移指南](../references/data/v2-migration-guide.md) | 迁移系统 |

### 生命周期系统

| 文档 | 说明 |
|----------|-------------|
| [生命周期总览](../references/lifecycle/README.md) | 架构、决策指南、用法 |
| [Application 总览](../references/lifecycle/application-overview.md) | 应用启动与关闭 |
| [生命周期内部机制](../references/lifecycle/lifecycle-overview.md) | 阶段、钩子、状态 |
| [生命周期使用](../references/lifecycle/lifecycle-usage.md) | 完整用法指南与示例 |
| [生命周期决策指南](../references/lifecycle/lifecycle-decision-guide.md) | 生命周期服务与单例的取舍 |
| [生命周期迁移指南](../references/lifecycle/lifecycle-migration-guide.md) | 迁移旧服务 |

### 消息

| 文档 | 说明 |
|----------|-------------|
| [消息系统](../references/messaging/message-system.md) | 消息生命周期、状态管理、操作 |
| [Composer 富剪贴板](../references/messaging/composer-rich-clipboard.md) | 私有 composer token 剪贴板格式与复制/粘贴流程 |
| [消息树](../references/chat/message-tree.md) | 聊天消息树模型：邻接表、每个 topic 的虚拟根、兄弟分组、不变式、删除语义、getTree / flow-canvas 契约 |
| [聊天 UI 设计与约定](../references/chat/conventions.md) | 聊天 UI 如何按职责划分（展示 / 视图状态 / 契约 / 编排）以及各模块遵循的约定（context、refs、渲染稳定性） |
| [聊天适配器](../references/chat/adapters.md) | 聊天契约层：将 topics / sessions / messages 投影为稳定的 UI 结构、pane / action 注册表以及渲染稳定性规则 |

### 知识库

| 文档 | 说明 |
|----------|-------------|
| [知识库产品规格](../references/knowledge/experiment/knowledge-product-spec.md) | Agent 托管知识库的精简产品语义（完整版在飞书） |
| [知识库技术设计](../references/knowledge/experiment/knowledge-technical-design.md) | 精简版的单库 index.sqlite schema、index store 契约与检索决策（完整版在飞书） |
| [KnowledgeService](../references/knowledge/knowledge-service.md) | 并发控制与负载管理 |
| [知识库操作守卫](../references/knowledge/operation-guards.md) | add/delete/reindex 的守卫、入队失败与恢复语义 |

### 组件

| 文档 | 说明 |
|----------|-------------|
| [CodeBlockView](../references/components/code-block-view.md) | 代码块视图组件 |
| [图片预览](../references/components/image-preview.md) | 图片预览组件 |
| [代码执行](../references/components/code-execution.md) | 通过 Pyodide 执行 Python 代码 |
| [UI 语义契约](../references/ui-semantic-contract.md) | `data-ui` token 协议、稳定性分级，以及面向主题、测试和 AI 工具维护的选择器 |

### 其他

| 文档 | 说明 |
|----------|-------------|
| [前端测试规范](../references/testing/frontend-testing.md) | 前端测试设计与评审 |
| [应用升级配置](../references/app-upgrade.md) | 应用升级配置 |
| [飞书通知](../references/feishu-notify.md) | 飞书通知集成 |
| [模糊搜索](../references/fuzzy-search.md) | 模糊搜索实现 |
| [局域网传输协议](../references/lan-transfer-protocol.md) | 局域网文件传输协议规范 |
| [远程请求安全](../references/security/remote-fetch.md) | 主进程直连 URL 请求的 SSRF 防护 |
