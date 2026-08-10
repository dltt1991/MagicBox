# Linux 打包

Linux 包使用来自固定的 [`CherryHQ/cherry-studio-better-sqlite3`](https://github.com/CherryHQ/cherry-studio-better-sqlite3) GitHub Release 的 x64 和 ARM64 `better-sqlite3` 预编译产物。

## 构建

```bash
# 构建两种架构
pnpm build:linux

# 构建单一架构
pnpm build:linux:x64
pnpm build:linux:arm64
```

首次构建需要网络访问以填充 Git-ignored 的 `scripts/linux-native/prebuilt/` 缓存。Cherry Studio 打包本身不需要 Docker 或 QEMU；这些工具仅在从单独的仓库发布新预编译产物时需要。

## 打包流程

1. `beforePack` 下载目标产物并验证其固定的 Release 校验和。
2. electron-builder 执行其正常的原生依赖重建。
3. `afterPack` 在替换打包的 `better_sqlite3.node` 之前验证 Electron ABI、模块版本、ELF 架构、校验和以及最大 GLIBC/GLIBCXX/CXXABI 要求。

缺失、过时或不兼容的产物会停止打包。

## 更新预编译产物

当 Electron 或 `better-sqlite3` 变更时：

1. 从预编译仓库发布经过验证的 Release。
2. 使用确切的 tag、文件名、元数据和 SHA-256 值更新 `scripts/linux-native/release.json`。

切勿将应用构建指向浮动的 `latest` Release。
