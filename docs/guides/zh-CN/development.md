# 🖥️ 开发

## IDE 设置

### VSCode 类

- 编辑器：[Cursor](https://www.cursor.com/) 等。任何兼容 VS Code 的编辑器。
- 推荐的扩展列在 [`.vscode/extensions.json`](../../../.vscode/extensions.json) 中。

### Zed

1. 安装扩展：[Biome](https://github.com/biomejs/biome-zed)、[oxc](https://github.com/oxc-project/zed-oxc)
2. 将示例设置文件复制到本地 Zed 配置：
   ```bash
   cp .zed/settings.json.example .zed/settings.json
   ```
3. 根据需要自定义 `.zed/settings.json`（已 git-ignore）。

## Windows：启用符号链接

本项目使用符号链接同步 AGENTS.md 和 skills 等文件。Windows 开发者必须在克隆前启用符号链接支持：

1. **启用开发者模式**（设置 → 更新和安全 → 开发者选项），或通过 `secpol.msc` 授予 `SeCreateSymbolicLinkPrivilege`。
2. **配置 Git**：
   ```bash
   git config --global core.symlinks true
   ```
3. 启用符号链接支持后克隆（或重新克隆）仓库。

## 项目设置

### 安装

```bash
pnpm install
```

### 开发

### 设置 Node.js

所需的 Node.js 版本在 `.node-version` 中定义。使用版本管理器如 [nvm](https://github.com/nvm-sh/nvm) 或 [fnm](https://github.com/Schniz/fnm) 自动安装：

```bash
nvm install
```

### 设置 pnpm

pnpm 版本锁定在 `package.json` 的 `packageManager` 字段中。只需启用 corepack，它会自动使用正确的版本：

```bash
corepack enable
```

### 安装依赖

```bash
pnpm install
```

### ENV

```bash
cp .env.example .env
```

### 启动

```bash
pnpm dev
```

默认情况下，开发运行会在 Electron 的默认 `userData` 目录后追加 `Dev`，使本地开发数据与打包应用数据分离。要同时运行多个开发实例，为每个实例提供唯一的后缀。你可以在 `.env` 中设置：

```bash
CS_DEV_USER_DATA_SUFFIX=DevQuito
```

或在启动开发实例时内联传递：

```bash
CS_DEV_USER_DATA_SUFFIX=DevQuito pnpm dev
CS_DEV_USER_DATA_SUFFIX=DevParis pnpm dev
```

空白值将被忽略并回退到 `Dev`。

### 调试

```bash
pnpm debug
```

然后在浏览器中输入 chrome://inspect

### 测试

```bash
pnpm test
```

### 构建

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

有关特定架构的命令和固定的 `better-sqlite3` 预编译工作流，请参阅 [Linux 打包](./linux-packaging.md)。
