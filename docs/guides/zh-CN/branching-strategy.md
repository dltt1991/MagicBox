# 🌿 分支策略

Magic Box 实施结构化的分支策略以维护代码质量并简化开发流程。

> **当前模型。**`main` 是活跃开发的默认分支——在此提交针对当前代码库的功能、重构、优化和修复。`v1` 分支是已发布 v1 版本的维护线：其热修复和后续 v1 版本通过 `hotfix/*` 提交到这里，目标分支为 `v1`（不是 `main`）。v1 修复不会自动迁移到 `main`；如果 `main` 上也存在相同 bug，请提交单独的前向移植 PR 并指向 `main`。（v1 和 v2 代码当前在 `main` 上共存——预期会有大型破坏性变更。）下面的通用流程早于此阶段；两者冲突时，以本说明为准。

## 主要分支

- `main`：主开发分支

  - 包含最新的开发代码
  - 不允许直接提交——变更必须通过 pull request 进行
  - 代码可能包含开发中的功能，可能尚未完全稳定

- `release/*`：发布分支
  - 从 `main` 分支创建
  - 包含准备发布的稳定代码
  - 仅接受文档更新和 bug 修复
  - 在生产部署前经过充分测试

有关测试计划中使用的 `testplan` 分支的详细信息，请参阅[测试计划](./test-plan.md)。

## 贡献分支

为 Magic Box 贡献时，请遵循以下指南：

1. **功能分支：**

   - 从 `main` 分支创建
   - 命名格式：`feature/issue-number-brief-description`
   - 向 `main` 提交 PR

2. **Bug 修复分支：**

   - 从 `main` 分支创建
   - 命名格式：`fix/issue-number-brief-description`
   - 向 `main` 提交 PR

3. **文档分支：**

   - 从 `main` 分支创建
   - 命名格式：`docs/brief-description`
   - 向 `main` 提交 PR

4. **热修复分支：**

   - 从 `v1` 分支创建
   - 命名格式：`hotfix/issue-number-brief-description`
   - 向 `v1` 提交 PR，不是 `main`。v1 修复不会自动迁移到 `main`——如果 `main` 上也存在相同 bug，请提交单独的前向移植 PR 并指向 `main`

5. **发布分支：**
   - 从 `main` 分支创建
   - 命名格式：`release/version-number`
   - 用于版本发布前的最后准备工作
   - 仅接受 bug 修复和文档更新
   - 测试和准备完成后，合并回 `main` 并打上版本标签

## 工作流程图

![](https://github.com/user-attachments/assets/61db64a2-fab1-4a16-8253-0c64c9df1a63)

## Pull Request 规范

- 活跃开发（功能、重构、优化、当前代码库的修复）提交到 `main`；v1 热修复和后续 v1 版本提交到 `v1` 分支（见顶部说明）。v1 修复不会自动迁移到 `main`——如果 `main` 上也存在该 bug，请用单独的 PR 前向移植
- 提交前确保你的分支与最新的 `main` 变更保持同步
- 在 PR 描述中包含相关的 issue 编号
- 确保所有测试通过且代码符合我们的质量标准
- 如果添加新功能或修改 UI 组件，请添加前后对比截图

## 版本标签管理

- 主要版本：v1.0.0、v2.0.0 等
- 功能版本：v1.1.0、v1.2.0 等
- 补丁版本：v1.0.1、v1.0.2 等
- 热修复版本：v1.0.1-hotfix 等
