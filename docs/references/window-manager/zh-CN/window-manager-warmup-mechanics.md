# 热身机制

用于单例和池化生命周期的共享预热状态机：空闲队列、GC 周期、预热策略和 `WindowManager_Reused` IPC 合约。

有关 `pooled` 生命周期模式的概念介绍，请参阅[概述 → 生命周期模式](./window-manager-overview.md#pooled--two-axis-pool-with-active-standby--passive-recycle)。

## 生命周期适用性

|概念/领域|汇集起来|单例|
|---|---|---|
|`热身：'渴望'\|‘懒’`| ✓ | ✓ |
|`standbySize` / `initialSize` / `recycleMinSize` / `recycleMaxSize` / `decayInterval`| ✓ | — |
|`inactivityTimeout`| ✓ | — |
|`retentionTime`| — | ✓ |
|空闲队列+`lastActivityAt`+GCtick|✓（多槽）|✓（0 或 1 个插槽）|
|`close()` 拦截|总是（当池配置存在时）|仅当 `retentionTime !== undefined` 时|
|重用重置状态|是（几何/行为覆盖/initData）|否（隐藏→显示保留）|

## 两轴模型：备用（生产者）与回收（消费者）

仅适用于池化生命周期。对于单例，请参阅[单例变体](#singleton-variant)。

每个池窗口类型都有一个 `WarmupState` 跟踪：

- **`managed: Set<string>`** — 属于该池的所有窗口 ID（使用中 + 空闲）。
- **`idle: string[]`** — 可供重用的窗口 FIFO 队列。
- **`inflightCreates: number`** — 通过 `setImmediate` 安排的备用补货，但尚未执行。

不变的 `idle ⊆ managed` 始终成立。窗口在创建时进入 `managed`，在 `close()`（如果回收）上进入 `idle`，在 `open()` 回收时留下 `idle`，并在销毁时留下 `idle`（通过集中式 `closed` 事件侦听器）。

**四种配置场景：**

|设想|`standbySize`|`recycleMinSize`|`recycleMaxSize`|语义学|
|---|---|---|---|---|
| ① | 0 | 0 | 0 |每次打开同步创建，关闭销毁（≈ `default` 生命周期）|
| ② | `K` | 0 | 0 |**纯粹的预热队列** - 总是 K 个备用，关闭销毁（一次性）|
| ③ | 0 | `N` | `M` |纯回收池——关闭时重用|
| ④ | `K` | `N` | `M` |混合 — 预热 + 一起回收|

## 池配置（仅限池）

|场地|轴|方面|描述|
|-------|------|-----------|-------------|
|`standbySize`|制片人|空闲计数|预热备件，通过 `setImmediate` 主动维护并在 `open()` 上补充。不受 `recycleMaxSize` 约束。|
|`initialSize`|制片人|管理计数|热身目标。默认为 `max(standbySize, recycleMinSize)`。|
|`recycleMinSize`|消费者|空闲计数|腐烂楼层——闲置在此之上的将被驱逐。没有 `recycleMaxSize` 就没有意义。|
|`recycleMaxSize`|消费者|管理计数|对可回收物进行软上限管理。 `close()` 超出时会被破坏。 __PH1__/__PH2__ 完全禁用回收。|
|`warmup`|生命周期| — |`'eager'` = 在 `onAllReady()` 处预创建，`'lazy'` = 在第一个 `close()` 处回填。如果 `standbySize > 0` 或 `initialSize > 0`，则默认为 `'eager'`。|
|`decayInterval`|定时|秒|驱逐 `max(standbySize, recycleMinSize)` 以上的一个闲置之间的时间间隔。 `0` = 无衰减。|
|`inactivityTimeout`|定时|秒|在将空闲状态调整至 `standbySize`（保留待机状态）之前，没有 `open()` / `close()` 活动的秒数。 `0` = 从不。|

## `recycleMaxSize` 策略（软上限）

`recycleMaxSize` 是 **可回收管理计数的软上限**。当 `open()` 发现空闲队列为空时，即使 `managed` 达到上限，它仍然会创建一个新窗口，记录警告而不是阻塞。 `create()` 始终创建一个新窗口（永远不会从空闲状态弹出），并且在 `managed.size + inflightCreates > recycleMaxSize` 时还会记录警告。当通过 `close()` 返回一个窗口并且相同的检查失败时，它会被销毁而不是合并，无需等待衰减即可恢复容量。

**重要提示：** `standbySize` 维护的窗口**不**计入 `recycleMaxSize`。在突发期间，`managed` 可能暂时等于 `in-use + standbySize`，超过 `recycleMaxSize`。随后的千钧一发将其收敛回来。

## GC定时器

单个共享 `setInterval` (60s) 对每个跟踪类型运行两次检查，按优先级顺序：

1. **不活动超时**（首先检查）：如果 `now - lastActivityAt > inactivityTimeout`，则将空闲队列修剪到 `standbyFloor` （销毁最旧的多余部分）。 `recycleMinSize` 未保留 — 长时间不活动意味着回收缓冲区已过时。
2. **衰减**（仅当不活动时未触发）：如果 `idle.length > max(standbySize, recycleMinSize)` 并且自上次活动和上次衰减以来已经过去了足够的时间，则从前面销毁一个空闲窗口。

`lastActivityAt` 在每个 `open()` 和每个 `close()` 上更新 - 计时器在使用周期的两端重置，因此长时间打开然后关闭的窗口不会立即满足不活动阈值。

衰变层使用 `max(standbySize, recycleMinSize)`，因此衰变永远不会将 `idle` 降至 `standbySize` 以下。不活动修剪仅使用 `standbySize` — 这是一种有意的不对称，表示 `standbySize` 是永久可用性承诺，而 `recycleMinSize` 是短期保留缓冲区。

定时器是需求驱动的：在第一个 `releaseToPool()` / `releaseSingletonToHidden()` 或备用补充时启动，在没有跟踪类型具有空闲窗口时停止。

|环境|影响|
|---------|--------|
|`decayInterval: 0`|不会逐渐腐烂|
|`inactivityTimeout: 0`|不活动时不会进行全面修剪|
|均为 0|超过 `standbySize` 的空闲窗口永远不会自动回收|

## 热身策略

**Eager**（`warmup: 'eager'`，`standbySize > 0` 时默认）：在所有域服务订阅 `onWindowCreated` 后，在 `onAllReady()` 期间预先创建 `initialSize` 隐藏窗口。首先 `open()` 是零等待的。

**Lazy**（`warmup: 'lazy'`，`standbySize` 和 `initialSize` 均未设置时的默认值）：不预先创建。首先 `open()` 同步创建。对于 `standbySize > 0`，第一次打开还会安排备用补充，因此后续打开是零等待。对于 `standbySize = 0`，第一个 `close()` 回填到 `initialSize`。

当 `standbySize > 0` 和 `warmup: 'lazy'` 都设置时，会跳过 `releaseToPool` 中的延迟回填分支 - 备用补充处理池维护，并且运行两者将进行双重创建。

对于单例， `eager` 预先创建了一个隐藏实例； `lazy` 推迟到第一个 `open()`。

## 单例变体

`singletonConfig` 在单例窗口上启用预热和延迟销毁。

|配置|`standbyFloor`|`inactivityTimeoutMs`|亲密行为|清理|
|---|---|---|---|---|
| `{}` | 0 | 0 |摧毁（未被拦截）|n/a|
|`{ warmup: 'eager' }`| 1 | 0 |摧毁（未被拦截）|无（gc禁用）|
|`{ retentionTime: N }` (N > 0)| 0 | N · 1000 |隐藏（拦截）|不活动 N 秒后修剪为 0|
|`{ retentionTime: -1 }`| 1 | 0 |隐藏（拦截）|从不（永久隐藏实例）|
|`{ warmup: 'eager', retentionTime: N }` (N > 0)| 1 | N · 1000 |隐藏|修剪为 1 — 保留待机状态|
|`{ warmup: 'eager', retentionTime: -1 }`| 1 | 0 |隐藏|绝不|

**关闭拦截触发器**：`retentionTime !== undefined`。如果没有它，关闭将自然进行并且窗口将被销毁。

**隐藏→显示之间的状态保存**：

- 保留几何形状（无 `resetPooledWindowGeometry`）
- 保留行为覆盖（无 `clearForWindow`）
- 保留 `initDataStore` 条目（隐藏不会删除；当提供新的 `initData` 时，下一个 `open()` 会覆盖，否则保持不变 - 单例是单消费者）
- 渲染器进程完好无损 - `BrowserWindow.hide()` 不会破坏它，DOM / React 状态保存在内存中

**保留时钟**：`retentionTime` 从最后一个 `open()` 或 `close()`（以较晚者为准）开始测量。重新打开窗口会重置时钟。 GC 刻度精度为 ±60 秒 (`WARMUP_GC_INTERVAL`)。

## 暂停/恢复

`suspendPool(type)` 销毁空闲窗口并设置 `suspended` 标志。正在使用的窗户保持原样。暂停期间：

- `open()` 创建具有默认生命周期的窗口（未池化）
- `close()` 立即销毁窗口（没有池返回）
- 本机关闭（用户单击 X）正常进行
- 跳过预热和惰性回填

`resumePool(type)` 清除标志，重置 `lastActivityAt` （以防止立即 GC），并触发急切预热（如果已配置）。

坚持是调用者的责任。重新启动时，如果池应保持挂起状态，则所属服务应在其 `onInit()` 中调用 `suspendPool()` — 这保证在 `onAllReady()` （此时会触发热切预热）之前运行。

## `WindowManager_Reused` IPC

当**重用**窗口（池回收或单例重新打开）返回给调用者并且调用者提供 `initData` 时，渲染器接收 `IpcChannel.WindowManager_Reused` 并将该初始化数据作为事件负载：

```typescript
window.electron?.ipcRenderer.on(IpcChannel.WindowManager_Reused, (_event, payload) => {
  // payload is exactly the object passed as `open({ initData })`
})
```

规则：

- 仅当窗口被**重新使用**并且调用者提供 `initData` 时才触发。新窗口永远不会收到此事件（渲染器尚未准备好侦听 - 使用冷启动 `getInitData` 代替）。
- 没有“空”重用事件。无 `initData` → 无事件。
- 相同的有效负载同时写入初始化数据存储中，因此一旦 `open()` 返回，`getInitData(windowId)` 就会同步反映新值。
- 对于**池**在没有 `initData` 的情况下重用 `open()`，之前存储的该窗口的初始化数据将从存储中**清除** — 池窗口是多消费者的，因此过时的有效负载泄漏将是一脚枪。
- 对于**单例**隐藏→显示重用而无需新的 `initData`，存储条目被**保留** - 单例是单消费者，因此“仍然相同的会话”意味着渲染器可能合法地希望返回最后一个有效负载（在隐藏期间开发工具重新加载后通过 `WindowManager_GetInitData` e.g ）。除非调用者传递新的 `initData` ，否则重用的 IPC 仍然不会触发。

渲染器中的**推荐用法**：不要手动处理这两个路径 - 使用 [`useWindowInitData` 钩子](./window-manager-usage.md#渲染进程-usewindowinitdata-hook)，它将冷启动调用和重用有效负载传递封装到单个 React 钩子中。

## 避免第一次油漆在重复使用时出现闪光

对显示陈旧内容或空镶边**视觉敏感**的池化窗口（e.g。macOS 上的透明 hideInset 框架，其中空内容显示本机交通灯按钮）可以将自己的 `.show()` 调用包装在一个简短的“显示”序列中，短暂地 `setOpacity(0) + showInactive()` 让 Chromium 恢复合成器绘制，然后在稳定窗口后 `setOpacity(1)` 。请参阅 `SelectionService.processAction` 以获取参考实现。此问题是特定于领域的，而不是通用 `WindowManager` 合同的一部分。
