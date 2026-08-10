# 代码执行组件

> 中文副本，对应英文原文：[docs/references/components/code-execution.md](../code-execution.md)。

说明代码执行 UI 与执行状态、输出展示、安全边界之间的关系。

## 要点

- 执行请求必须走受控通道。
- 输出、错误和终止状态要清楚呈现。
- 渲染端不直接绕过主进程执行系统命令。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# Code Execution`
- `## Execution Flow`
- `## 1. UI Layer`
- `### Key Mechanisms:`
- `## 2. Service Layer`
- `### Main Responsibilities:`
- `## 3. Worker Layer`
- `### Worker Logic:`
- `### Data Flow`
