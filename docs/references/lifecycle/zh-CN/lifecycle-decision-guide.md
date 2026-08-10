# 生命周期决策指南

**生命周期管理的是资源，而不是逻辑。** 被命名为“服务”并不意味着它属于这里。问题是：它是否**拥有比单个方法调用寿命更长的资源或副作用，并且需要在关闭时进行清理**？

## 如果（任一条件）使用生命周期

**1.拥有长期存在的资源**——在 init 中创建，在调用中存活，需要显式清理：

|类别|示例|
| --------------------- | -------------------------------------------------------- |
|数据库连接|SQLite / better-sqlite3、Drizzle ORM|
|网络服务|HTTP 服务器、mDNS 浏览器、WebSocket 服务器|
|本机/操作系统资源|`SelectionHook`（系统线程）、`Tray`、`BrowserWindow`|
|文件系统|`chokidar` 观察者，Winston DailyRotate 文件传输|
|定时器|`setInterval`（GC，轮询）|
|子进程|长时间运行的网关/工作人员（不是一次性脚本）|
|有状态的商店|内存中的缓存需要在关闭时刷新|

**2.注册持久副作用** - 在初始化时修改全局状态，在生命周期内持续存在，需要撤消：

|类别|示例|
| -------------------- | ------------------------------------------------------------------ |
|事件监听器|`nativeTheme.on()`、`powerMonitor.on()`、`autoUpdater.on()`|
|全局快捷键|`globalShortcut.register()`|
|订阅|`preferenceService.subscribeChange()`，`configManager.subscribe()`|
|会话拦截器|`session.webRequest.onHeadersReceived()`|
|IPC 处理程序|`ipcMain.handle()` 注册（见下文）|
|全局 API 突变|猴子修补全局 API|

#### IPC 处理程序何时应驻留在服务中？

**放置，而不是提升。** 该表假设服务“已经”具有生命周期（它拥有资源或有状态处理程序），并且仅决定处理程序是否存在于其“内部”。这些行中没有任何一行会单独将类提升到生命周期中 — 最重要的是第 3 行：“属于域”意味着 *共定位到现有域服务中*，绝不会 *创建生命周期服务只是为了托管 IPC 注册*。

当满足以下任何条件时，生命周期服务应自包含其 IPC 处理程序：

|健康）状况|为什么|
|-----------|-----|
|处理程序访问服务实例状态 (`this.xxx`)|处理程序与服务的生命周期耦合 - 如果服务停止，处理程序也必须停止|
|服务需要 `stop()` / `start()` / `restart()` 支持|孤立的处理程序将在重新启动后引用过时的状态|
|处理程序在语义上属于服务的域|共置提高了可维护性和可发现性|

如果处理程序是纯粹无状态的（e.g.，返回 `app.getVersion()`），则它不需要生命周期管理 - 唯一工作是注册无状态 IPC 的类**不是**生命周期服务。将处理程序折叠到其域服务中，或从直接导入单例中注册它。

BaseService 为自包含处理程序提供内置 IPC 跟踪 - 请参阅 [IPC 处理程序管理](./lifecycle-usage.md#ipc-handler-management)。

## 如果出现以下情况，请勿使用生命周期

- **无状态编排** — 调用其他服务，组合结果，不拥有任何内容。
- **DataApi 业务逻辑服务** — 查询 `DbService` (e.g. `MessageRepository`, `TopicService`) 的存储库/数据访问包装器。 DB连接由`DbService`管理；这些只是封装查询。使用直接导入单例。
- **请求范围的资源** — 在单个方法调用中创建和释放的资源（e.g. `BackupManager.backup()` 中的 S3 连接）。
- **无初始化，无清理** — 将继承 `BaseService` 但绝不会覆盖 `onInit()` / `onStop()`。
- **纯粹的实用程序** — 没有运行时状态的函数或 SDK 包装器。

## 决策流程图

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

## 快速参考

|                         |生命周期|直接导入单例|
| ----------------------- | -------------------------------------------- | ---------------------------------------------- |
|示例|`DbService`、`CacheService`、`MainWindowService`|`ExportService`，`BackupManager`|
|长期资源|是的|否（或请求范围内）|
|持续的副作用|是的|不|
|`onInit` / `onStop`|有意义的|会是空的|
|图案|`@Injectable` + `application.get()`|`export const x = new X()`|

## 示例

**属于生命周期** - 拥有计时器，需要清理：

```typescript
@Injectable('CacheService')
export class CacheService extends BaseService {
  private gcTimer: NodeJS.Timeout | null = null

  protected onInit() {
    this.gcTimer = setInterval(() => this.gc(), 600_000)
  }

  protected onStop() {
    clearInterval(this.gcTimer!)
    this.cache.clear()
  }
}
```

**不属于** - 所有工作都在方法内进行，无需清理：

```typescript
export class ExportService {
  private md = new MarkdownIt()

  async exportToDocx(messages: Message[]) {
    const doc = new Document({ sections: this.buildSections(messages) })
    const buffer = await Packer.toBuffer(doc)
    await dialog.showSaveDialog(/* ... */)
  }
}
export const exportService = new ExportService()
```

## 在@Conditional、Pausable 和Activatable 之间进行选择

一旦服务进入生命周期，它可能需要可选的行为：

|设想|使用|原因|
|----------|-----|--------|
|服务仅在特定的 platform/arch 上运行|`@Conditional`|启动时排除，零开销|
|服务需要临时 suspend/resume（e.g.，窗口非活动状态）|`Pausable`|保留实例和资源，只是暂停执行|
|服务总是需要IPC，但大量资源按需加载|`Activatable`|IPC始终可用，仅在需要时分配资源|
|服务具有控制 on/off 的运行时切换（首选项、功能标志）|`Activatable`|统一的 activate/deactivate 模式，即使对于轻量级资源也是如此|
|服务使用所有资源无条件运行|没有任何|默认行为|

### 决策流程

```
Does the service need to be entirely excluded on some platforms?
  ├─ Yes, condition is known at boot and immutable
  │     → @Conditional (platform, arch, env var, etc.)
  └─ No
       Does the service have heavy resources OR a runtime toggle controlling on/off?
         ├─ Yes → Activatable
         │     IPC registered in onInit() (always available)
         │     Resources in onActivate()/onDeactivate()
         │     Service decides trigger (preference, event, IPC, etc.)
         └─ No
              Does the service need temporary pause/resume?
                ├─ Yes → Pausable
                └─ No → No extra interface needed
```

### 可激活与可暂停

| |可激活|可暂停|
|---|------------|---------|
|目的|按需资源 loading/release|暂时中止执行|
|状态维度|与 生命周期State 正交|更改生命周期状态|
|IPC 处理程序|始终可用（在onInit中注册）|暂停时保留（停止时删除）|
|资源|不活动时不分配|暂停时保留|
|扳机|服务决定（自行或通过 `application.activate` 外部）|具有级联的 生命周期Manager|
|级联|无级联|级联至家属|
|周期|支持重复activate/deactivate|支持重复pause/resume|

### 当可激活不合适时

- **没有运行时切换的轻量级资源**（映射，始终需要的简单状态）- 不值得拆分，加载到 `onInit()`
- **不活动时不需要 IPC** — 考虑 `@Conditional` 完全排除
- **资源需要跨服务协调释放**——考虑`Pausable`（支持级联）

## 常见错误

1. **空钩子** — `extends BaseService` 但没有 `onInit()` / `onStop()` 覆盖。如果两者都是空的，则不要使用生命周期。
2. **请求范围 ≠ 长期存在** — `BackupManager` 在 `backup()` 内创建 S3 连接并在返回时释放。这是请求范围的。无需生命周期。
3. **“取决于 PreferenceService”** — 不是生命周期问题。任何代码都可以调用 `application.get('PreferenceService')`。仅当服务本身拥有资源时才注册。
4. **将 `@Conditional` 用于运行时条件** — `@Conditional` 在启动时评估一次。对于运行时更改的条件（用户首选项、事件），请使用 `Activatable` 代替。
5. **冗余跨阶段 `@DependsOn`** — WhenReady 服务不需要 `@DependsOn('PreferenceService')` 或 `@DependsOn('DbService')`。阶段顺序由容器强制执行； BeforeReady 始终在 WhenReady 开始之前准备就绪。仅针对同相服务声明 `@DependsOn`。

   ```typescript
   // ❌ Redundant — PreferenceService is BeforeReady, guaranteed ready
   @Injectable('MainWindowService')
   @ServicePhase(Phase.WhenReady)
   @DependsOn('PreferenceService')   // <-- remove this
   export class MainWindowService extends BaseService { ... }

   // ✅ Correct — only declare same-phase deps
   @Injectable('AgentBootstrapService')
   @ServicePhase(Phase.WhenReady)
   @DependsOn('ApiServerService')    // ApiServerService is also WhenReady
   export class AgentBootstrapService extends BaseService { ... }
   ```

6. **等待 `onAllReady`** 内的业务工作 — `onAllReady` 是引导后的补充，而不是初始化的一部分。该框架并行调用每个服务的钩子并且**不等待完成**（即发即弃）。 `onAllReady` 内的 `await someLongRunning()` 成为无声的后台工作；没有它引导程序继续进行。如果服务确实需要延迟业务工作（e.g。一个安静的窗口，然后恢复），请通过 `setTimeout` 进行调度，跟踪实例上的 Promise，并从 `onStop` 加入它。该连接受限于关闭路径 - 请参阅[生命周期用法 - onAllReady 模式](./lifecycle-usage.md#onallready-business-work-pattern) 了解模板和上限。

7. **将 `ALL_SERVICES_READY` 视为“所有副作用已完成”** — 该事件在每个 `onAllReady` 钩子被**调用**后立即触发，而不是在它们完成后触发。需要等待特定服务的延迟工作的侦听器必须直接与该服务协调（e.g。服务完成工作时发出的 `Signal`），而不是订阅 `ALL_SERVICES_READY`。

8. **“作为 IPC 存储桶的生命周期服务”** — 仅用于注册 IPC 处理程序的类默认情况下不是生命周期。注册是一个副作用，但是“无状态”处理程序不需要关闭撤消，并且“属于域”（IPC 表的第 3 行）仅决定在“已经生命周期”服务中的放置 - 它从不提升仅 IPC 的类。将此类处理程序折叠到所属域服务中，或使用直接导入单例。
