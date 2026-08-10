# 前端测试

> 中文副本，对应英文原文：[docs/references/testing/frontend-testing.md](../frontend-testing.md)。

说明 React/UI 测试的约定、mock 使用和断言重点。

## 要点

- 测试用户可见行为。
- 使用统一 mock 系统。
- 避免依赖脆弱实现细节。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Frontend Testing Guidelines`
- `## Document Ownership`
- `## 1. The Value Gate`
- `### Changes that normally require tests`
- `### Changes that normally do not require new tests`
- `## 2. Choose the Lowest Sufficient Layer`
- `## 3. Test Behavior, Not Implementation`
- `## 4. Query and Interaction Priority`
- `## 5. Mocking Rules`
- `### `@cherrystudio/ui` transition rule`
- `## 6. Cases to Reject During Review`
- `## 7. Snapshots`
- `## 8. Regression Tests`
- `## 9. E2E Scope`
- `## 10. Existing-Suite Policy`
- `## 11. AI-Agent Workflow`
- `## 12. Examples`
- `### Good: user outcome`
- `### Bad: implementation and passthrough`
- `## Related`
