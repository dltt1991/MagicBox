# 作业和调度程序

Magic Box统一后台作业+时间调度系统。

|医生|它涵盖什么|观众|
|---|---|---|
|[overview.md](./overview.md)|架构、两业务分离、DB驱动调度|新贡献者|
|[scheduler-usage.md](./scheduler-usage.md)|决策树：SchedulerService vs `registerInterval` vs raw `setInterval`|所有消费者|
|[concurrency-and-locks.md](./concurrency-and-locks.md)|四层锁模型+业务级资源锁|处理程序作者|
|[handler-authoring.md](./handler-authoring.md)|如何编写JobHandler（恢复/重试/catchUp/进度）|处理程序作者|
|[migration-checklist.md](./migration-checklist.md)|迁移现有服务的分步清单|服务迁移者|

## 快速导航

- 需要排队后台工作吗？ → 请参阅 [overview.md /“何时使用 JobManager”](./overview.md)
- 需要安排回调（cron / 间隔 / 一次性）？ → 参见 [scheduler-usage.md](./scheduler-usage.md)
- 从自定义队列迁移？ → 参见 [migration-checklist.md](./migration-checklist.md)
- 处理程序因并发基本写入而绊倒？ → 参见 [concurrency-and-locks.md](./concurrency-and-locks.md)
- 启动恢复如何工作（60 秒安静窗口、飞行中关闭）？ → 请参阅 [overview.md / 启动恢复](./overview.md#startup-recovery)
- 处理程序在哪里注册，为什么 `onAllReady` 注册会默默失败？ → 参见 [handler-authoring.md / 注册时间](./handler-authoring.md#registration-timing)
