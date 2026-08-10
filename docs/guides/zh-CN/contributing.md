# Magic Box 贡献者指南

[**English**](../../../CONTRIBUTING.md) | [中文](./contributing.md)

欢迎来到 Magic Box 贡献者社区！我们致力于让 Magic Box 成为一个提供长期价值的项目，我们邀请更多开发者加入我们。无论你是经验丰富的开发者还是刚刚入门，你的贡献都将帮助我们更好地服务用户并提高软件质量。

## 如何贡献

以下是你可以参与的几种方式：

1. **贡献代码**：帮助开发新功能或优化现有代码。确保你的代码符合我们的编码标准并通过所有测试。
2. **修复 Bug**：如果你发现 bug，欢迎提交修复。请验证问题已解决并包含相关测试。
3. **维护 Issue**：通过标记、分类和解决问题来帮助管理 GitHub issue。
4. **产品设计**：参与产品设计讨论，帮助改进用户体验和界面设计。
5. **编写文档**：帮助我们改进用户手册、API 文档和开发者指南。
6. **社区维护**：参与社区讨论，帮助回答用户问题，促进社区活跃。
7. **推广使用**：通过博客、社交媒体和其他渠道推广 Magic Box，吸引更多用户和开发者。

## 开始之前

请确保你已阅读[行为准则](../../../CODE_OF_CONDUCT.md)和[许可证](../../../LICENSE)。

## 搭建开发环境

请参阅[开发者指南](./development.md)了解如何搭建本地开发环境，包括前置条件、安装步骤和可用命令。

有关项目架构、技术栈、代码约定和可用命令的全面概述，请参阅 [`CLAUDE.md`](../../../CLAUDE.md)。

## 入门

为了熟悉代码，我们推荐从标记有以下一个或多个标签的 issue 开始：[good-first-issue](https://github.com/CherryHQ/cherry-studio/labels/good%20first%20issue)、[help-wanted](https://github.com/CherryHQ/cherry-studio/labels/help%20wanted) 或 [kind/bug](https://github.com/CherryHQ/cherry-studio/labels/kind%2Fbug)。任何帮助都欢迎。

### 测试

没有测试的功能被视为不存在。为了确保代码真正有效，相关流程应该由单元测试和功能测试覆盖。因此，在考虑贡献时，请也考虑可测试性。所有测试都可以在本地运行，无需依赖 CI。请参阅[开发者指南](./development.md#test)中的"测试"部分。

### Pull Request 自动化测试

自动化测试会在 Magic Box 组织成员打开的 pull request (PR) 上触发，不包括草稿 PR。来自新贡献者的 PR 最初会标记为 `needs-ok-to-test`，不会自动测试。Magic Box 组织成员在 PR 上添加 `/ok-to-test` 后，测试管道将被创建。

### 考虑将 Pull Request 设为草稿

并非所有 pull request 在创建时都准备好接受评审。这可能是因为作者想要发起讨论，不完全确定变更的方向是否正确，或者变更尚未完成。考虑将这些 PR 创建为[草稿 pull request](https://github.blog/2019-02-14-introducing-draft-pull-requests/)。草稿 PR 会被 CI 跳过，节省 CI 资源。这也意味着评审者不会被自动分配，社区将理解该 PR 尚未准备好接受评审。在你将草稿 pull request 标记为准备好接受评审后，评审者将被分配。

### 贡献者遵守项目条款

我们要求每位贡献者证明他们有权合法地为我们的项目做出贡献。贡献者通过有意在其提交上签名来表达这一点，表明遵守[许可证](../../../LICENSE)。
签名的提交在提交消息中包含以下内容：

```
Signed-off-by: Your Name <your.email@example.com>
```

你可以使用 [git commit --signoff](https://git-scm.com/docs/git-commit#Documentation/git-commit.txt---signoff) 命令生成签名的提交：

```
git commit --signoff -m "Your commit message"
```

### 获得代码评审/合并

维护者在这里帮助你在合理的时间内实现你的用例。他们会尽力评审你的代码并提供建设性反馈。但如果你在评审期间被阻塞，或者觉得你的 Pull Request 没有得到应有的关注，请通过 issue 评论或[社区渠道](../../README.md)联系。

### 参与测试计划

测试计划旨在为用户提供更稳定的应用体验和更快的迭代速度。详情请参阅[测试计划](./test-plan.md)。

### 其他建议

- **联系开发者**：在提交 PR 之前，你可以先联系开发者讨论或寻求帮助。

## 重要贡献指南

在提交 Pull Request 之前，请阅读以下关键信息：

### 分支策略

**v2 重构已合并到 `main`。**`main` 现在是活跃开发的默认分支，v1 和 v2 代码在此共存。在此阶段预期会有大型、频繁和破坏性的变更。

- **`main` 分支**：新功能开发、重构、优化和当前代码库的修复在这里进行。在修改正在被替换的子系统之前，请阅读 [docs/references/data](../../references/data/README.md) 了解哪些正在被删除，并注意代码中的 `@deprecated` 注释——它们标记了计划删除的调用点。
- **`v1` 分支**：已发布 v1 版本的维护线——其热修复和后续 v1 版本通过 `hotfix/*` 分支（例如 `hotfix/fix-crash-on-startup`）提交到这里，范围最小。将你的 PR 指向 `v1`，不是 `main`。v1 修复**不会**自动迁移到 `main`；如果 `main` 上也存在相同 bug，请提交单独的前向移植 PR 并指向 `main`。

### 参与 v2 开发

v2 是 Magic Box 的下一个重要里程碑，我们邀请每位开发者积极参与！无论是新功能开发、架构优化还是代码重构，在 `main` 上的贡献都欢迎。让我们一起构建更好的 Magic Box！

感谢你在这个重要开发阶段的理解和持续支持！

## 联系我们

如果你有任何问题或建议，欢迎联系：

- 微信：kangfenmao
- [GitHub Issues](https://github.com/CherryHQ/cherry-studio/issues)

感谢你的支持和贡献！我们期待与你一起构建更好的 Magic Box。
