# Magic Box

[English](README.md) | [简体中文](README.zh-CN.md)

Magic Box 是一款跨平台 Electron 桌面应用，面向 AI 辅助工作流。它把多模型供应商对话、Agent 会话、终端与文件工作流、知识库、翻译、绘画、MCP 工具和桌面集成放在同一个本地工作空间中。

当前仓库处于 v2 活跃开发阶段。部分包名、供应商路由、网址和兼容路径可能仍保留上游名称；如果重命名会影响运行行为或迁移兼容性，会暂时保持原状。

## 功能

- 支持多模型供应商的 AI 对话和助手工作流。
- 支持 Agent 会话、工具执行、终端集成和本地上下文。
- 支持文件管理、文件预览、知识库检索、翻译和绘画。
- 集成 MCP、API Gateway、二进制/工具管理和供应商注册表。
- 基于 Electron main/renderer/shared 的架构，并使用生命周期服务管理长期资源。
- 基于 Shadcn UI 和 Tailwind CSS 的共享 UI 包。

## 环境要求

- Node.js `>=24.11.1 <24.16.0`
- 通过 Corepack 使用 pnpm `11.8.0`
- Windows 环境需要启用 Git 符号链接支持

## 快速开始

```bash
corepack enable
nvm install
pnpm install
cp .env.example .env
pnpm dev
```

更完整的环境说明见 [开发环境配置](docs/guides/development.md)。

## 常用命令

```bash
pnpm dev              # 启动 Electron 开发应用
pnpm debug            # 使用 inspector/debug 参数启动
pnpm lint             # 运行 lint、类型检查、i18n 检查和格式化
pnpm test             # 运行 Vitest 测试
pnpm format           # 运行 Biome 格式化和 lint 写入模式
pnpm build:check      # 提交前完整验证
pnpm build:mac        # 构建 macOS 安装包
pnpm build:win        # 构建 Windows 安装包
pnpm build:linux      # 构建 Linux 安装包
```

使用较少见的脚本前请先阅读 `package.json`；部分构建和测试命令专门用于 CI 或包发布。

## 项目结构

| 路径 | 说明 |
| ---- | ---- |
| `src/main/` | Electron 主进程、生命周期服务、IPC、数据、AI 和系统集成 |
| `src/renderer/` | React 渲染进程应用、页面、组件、hooks、服务和状态 |
| `src/shared/` | 跨进程 schema、类型、常量和工具函数 |
| `packages/` | UI、AI Core、Provider Registry 和扩展等工作区包 |
| `docs/` | 开发指南和架构参考 |
| `resources/` | 打包资源和内置 skills |
| `scripts/` | 构建、验证、迁移和维护脚本 |
| `v2-refactor-temp/` | v2 重构临时工作区和生成数据工具 |

## 文档入口

- [文档索引](docs/README.md)
- [贡献指南](docs/guides/contributing.md)
- [分支策略](docs/guides/branching-strategy.md)
- [架构总览](docs/references/architecture-overview.md)
- [渲染进程架构](docs/references/renderer-architecture.md)
- [主进程架构](docs/references/main-process-architecture.md)
- [共享层架构](docs/references/shared-layer-architecture.md)
- [数据系统](docs/references/data/README.md)
- [IPC 指南](docs/references/ipc/README.md)
- [生命周期系统](docs/references/lifecycle/README.md)
- [窗口管理](docs/references/window-manager/README.md)

## 开发注意事项

- 新增模块前先遵守现有架构边界。
- 所有用户可见文本都应走 i18n。
- 使用 `loggerService`，不要直接写 `console.log`。
- 主进程文件路径统一使用 `application.getPath()`。
- 变更保持克制，提交前完成验证。
- 提交需要使用 Conventional Commit，并同时 GPG 签名和 DCO sign-off。

## 许可证

Magic Box Community Edition 使用
[GNU Affero General Public License v3.0](LICENSE) 授权。
