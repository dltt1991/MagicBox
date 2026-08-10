# 生命周期和应用程序参考

这是 Magic Box 服务生命周期和应用程序编排文档的主要入口点。生命周期系统提供IoC容器管理、分阶段引导和服务生命周期控制。

## 快速导航

### 系统概述（架构）
- [生命周期概述](./lifecycle-overview.md) - 阶段、挂钩、状态、事件、并行初始化
- [应用概述](./application-overview.md) - Bootstrap/shutdown 编排、服务注册、运行时控制

### 使用指南（代码示例）
- [生命周期用法](./lifecycle-usage.md) - 装饰器、错误处理、条件激活、pause/resume

### 参考指南（标准）
- [生命周期决策指南](./lifecycle-decision-guide.md) - “我应该使用生命周期吗？”决策框架
- [生命周期迁移指南](./lifecycle-migration-guide.md) - 将旧服务模式转换为生命周期

### 测试
- [测试模拟 - 范围](../../../../tests/__mocks__/README.md#scope) - 哪些服务获得全局模拟，哪些服务没有
- [测试其他生命周期服务](../../../../tests/__mocks__/README.md#testing-other-生命周期-services) — 用于特定功能的生命周期服务的本地存根模式

---

## 选择正确的模式

### 快速决策表

|                         |生命周期|直接导入单例|
| ----------------------- | -------------------------------------------- | ---------------------------------------------- |
|示例|`DbService`、`CacheService`、`MainWindowService`|`ExportService`、`BackupManager`、`OcrService`|
|长期资源|是的|否（或请求范围内）|
|持续的副作用|是的|不|
|`onInit` / `onStop`|有意义的|会是空的|
|图案|`@Injectable` + `application.get()`|`export const x = new X()`|

### 决策流程图

```
    ┌───────────────────────────────────┐
    │ Owns long-lived resources?        │
    │ (connections, timers, native      │
    │  modules, servers, processes)     │
    └─────┬────────────────┬────────────┘
      yes │                │ no
          ▼                ▼
   ┌───────────┐  ┌──────────────────────────┐
   │ Lifecycle │  │ Registers persistent     │
   └───────────┘  │ side effects?            │
                  │ (listeners, shortcuts,   │
                  │  subscriptions, etc.)    │
                  └─────┬───────────┬────────┘
                    yes │           │ no
                        ▼           ▼
                 ┌───────────┐ ┌────────────────┐
                 │ Lifecycle │ │ Direct-import  │
                 └───────────┘ │ singleton      │
                               └────────────────┘
```

有关包含示例、条件表和常见错误的完整决策框架，请参阅[生命周期决策指南](./lifecycle-decision-guide.md)。

---

## 跨阶段依赖是自动的

WhenReady 服务**不需要**需要 `@DependsOn` BeforeReady 服务（`PreferenceService`、`DbService`、`CacheService`、`DataApiService`）。生命周期容器保证 BeforeReady 在任何 WhenReady 服务启动之前完成。声明这些依赖关系是多余的，会在依赖图中产生误导性的噪音，并且可能会使未来的读者对同相耦合感到困惑。 **仅将 `@DependsOn` 用于同一阶段内的服务，或用于 WhenReady → WhenReady 依赖项。**

有关完整矩阵，请参阅[依赖关系规则](./lifecycle-overview.md#dependency-rules)；有关代码级示例，请参阅[常见错误](./lifecycle-decision-guide.md#common-mistakes)。

---

## 常见的反模式

|错误的选择|为什么这是错误的|正确的选择|
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
|使用 `ExportService` 的生命​​周期|不需要 __PH0__/__PH1__ — 所有工作都是方法范围内的|**直接导入单例**|
|使用 `MessageRepository` 的生命​​周期|只是包装数据库查询；数据库连接属于 `DbService`|**直接导入单例**|
|对 `CacheService` 使用直接导入|拥有一个 GC 计时器，需要在关闭时进行清理|**生命周期**|
|手动 `getInstance()` 单例|生命周期容器自动管理单例|**`@Injectable` + `application.get()`**|
|在模块范围内调用 `application.get()`|在引导程序之前运行——服务尚未注册|**在 `onInit()` 或方法内部调用**|
|跨阶段依赖上的冗余 `@DependsOn` (e.g.WhenReady → `PreferenceService`)|BeforeReady 阶段保证在 WhenReady 开始之前完成 - 声明是噪声和误信号耦合|**对于跨阶段依赖，省略 `@DependsOn` ；只声明同相依赖**|

---

## 相关源代码

### 核心基础设施
- `src/main/core/lifecycle/` — IoC 容器，服务生命周期管理
- `src/main/core/application/` — 应用程序单例、服务注册表、引导编排

### 服务实施
- `src/main/services/` — 生命周期系统中注册的业务服务
- `src/main/data/` — 数据层服务（缓存、首选项、DataApi）
