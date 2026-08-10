# 应用更新架构

## 概述

Magic Box 客户端通过托管发布服务 `https://releases.cherry-ai.com` 检查更新。客户端会选择更新通道，并发送应用、客户端、平台与区域元数据。目标版本选择、区域镜像、灰度策略以及强制升级门禁均由发布服务负责。

## 更新源配置

- 打包构建使用 `electron-builder.yml` 中的 `publish.url`。electron-builder 会将该值写入打包后的 `app-update.yml`。
- 开发构建设置 `forceDevUpdateConfig = true`，因此 electron-updater 会读取仓库根目录的 `dev-app-update.yml`。默认开发更新源为 `http://127.0.0.1:3378`。
- 生产环境基础 URL 的变更通过构建配置在新产出的应用构建中生效。客户端不会在运行时覆盖打包时写入的更新源 URL。

## 通道

客户端会请求以下 electron-updater 通道之一：

- `latest`：稳定发布通道。
- `rc`：候选发布通道。
- `beta`：Beta 发布通道。

测试计划关闭时，客户端选择 `latest`。开启时，客户端使用设置中选择的 RC 或 Beta 通道。electron-updater 会从托管更新源请求对应通道的清单。

## 请求约定

每次检查更新前，客户端会保留已有的 updater 请求头，并设置以下值：

| 请求头 | 值 |
| --- | --- |
| `Client-Id` | 持久化的客户端标识 |
| `App-Name` | 应用名称 |
| `App-Version` | 已安装版本，带 `v` 前缀 |
| `OS` | `process.platform` 的值 |
| `X-Region` | 中国大陆为 `cn`，其他为 `global` |
| `User-Agent` | 生成的 Magic Box user agent |
| `Cache-Control` | `no-cache` |

客户端请求 `latest`、`rc` 还是 `beta` 清单，由所选的 electron-updater 通道决定；不会额外发送发布通道请求头。

## 检查生命周期

手动检查在开发构建以及打包的非便携版构建中可用。便携版构建不执行更新检查。打包的非便携版构建还会在主进程中调度自动检查。检查成功后恢复正常节奏，而调度检查失败时会采用指数退避后重试。更新事件与下载进度仍通过 IpcApi 送达主窗口。
