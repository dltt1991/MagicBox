# 迁移清单

将现有服务（KnowledgeRuntime/FileProcessing/代理任务/心跳）迁移到统一的 JobManager 时，请使用此清单。每个迁移都是一个单独的项目 - 该文档是每个迁移中应用的每个处理程序规则。

## 每个处理程序

- [ ] 选择 `recovery` 策略：
  - `abandon` — 即发即忘（心跳、通知）
  - `retry` —“必须完成”（摄取、索引、模型同步）
  - `singleton` —“每种类型最多一个活动”（初始化，定期刷新）
- [ ] 如果需要按资源序列化，则设置 `defaultQueue`（对于按基写入，则设置 e.g. `base.${baseId}`）
- [ ] 根据资源预算（向量存储/GPU/网络）设置 `defaultConcurrency`
- [ ] 如果重试有价值，请配置 `defaultRetryPolicy`
- [ ] 如果处理程序可以长时间运行，则设置 `defaultTimeoutMs`
- [ ] 实施`execute`：
  - 在每个循环体和每个 `await` 中尊重 `ctx.signal.aborted`
  - 使用 `ctx.patchMetadata` 进行交叉重启状态切换（e.g.，远程任务 ID）
  - 使用 `ctx.reportProgress(percent, detail)` 实现渲染器可见的进度
  - 不要使用 `while (true)` — 始终使用 `while (!ctx.signal.aborted)`
- [ ] 如果业务需要追赶可观察性或断路器，则实施 `onMissed`
- [ ] 如果业务需要最终状态反应，则实现 `onSettled` — 事件携带类型化的 `input`、`parentId` 和最终 `metadata`（不需要 `getById` 反向查找）；用于故障率断路器查询
`jobService.listRecentTerminalByScheduleId(scheduleId, N)` 说实话，不要建立一个单独的柜台
- [ ] 通过 TypeScript 声明合并添加 JobRegistry 类型绑定
- [ ] 在所属服务的 `onInit` 中注册处理程序

## 数据迁移（每个企业）

- [ ] 映射现有行 → `jobTable` / `jobScheduleTable` 行
- [ ] 通过 `v2-refactor-temp/tools/data-classify` 流运行迁移
- [ ] 更新 `src/main/data/migration/v2/migrators/` 中的 v2 迁移器以实现干净重启安全
- [ ] 如果用户可见的行为发生变化，则添加 `v2-refactor-temp/docs/breaking-changes/` 条目（e.g.，代理任务：每次尝试日志 → 每个排队单行）
- [ ] 删除或精简遗留服务（保留 IPC 入口点；重定向到 JobManager）

## 每个处理程序的验证

- [ ] 冒烟测试：入队 → 终端快乐路径
- [ ] 重新启动测试：生成作业，`kill -9`，验证每个 `recovery` 策略的恢复行为
- [ ] 并发测试：断言每个队列的并发上限受到尊重（以及针对写入密集型处理程序的每个资源第 3 层锁定）
- [ ] 取消测试：运行期间取消，验证 `cancelled` 终端状态和观察到的处理程序 `ctx.signal.aborted`
- [ ] 赶上测试（如果已安排）：冻结 nextRun 之后的时间，验证 `onMissed` 事件和（对于 `after-startup`）补充作业

## 横切验证（每个阶段）

- [ ] `pnpm lint` + `pnpm test` + `pnpm format` 清洁
- [ ] 在 `paths.ts` / `types.ts` 中注册的 DataApi 路径（如果添加）
- [ ] 注册的cacheSchemas条目（如果有新的缓存键）
- [ ] 不承诺遗留服务，除非它们是 deleted/refactored
- [ ] PR 描述中添加了迁移摘要（迁移了哪些内容，保留了哪些内容）
