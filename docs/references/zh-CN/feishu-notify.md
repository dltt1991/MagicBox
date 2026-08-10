# 飞书通知脚本

`scripts/feishu-notify.ts` 是一个向飞书（Lark）Webhook 发送通知的 CLI 工具。该脚本主要在 GitHub Actions 工作流中使用，以实现自动通知。

## 特性

- 基于子命令的 CLI 结构，支持不同通知类型
- HMAC-SHA256 签名校验
- 发送飞书交互式卡片消息
- 完整的 TypeScript 类型支持
- 凭据通过环境变量传入，保障安全

## 用法

### 前置条件

```bash
pnpm install
```

### CLI 结构

```bash
pnpm tsx scripts/feishu-notify.ts [command] [options]
```

### 环境变量（必填）

| 变量 | 说明 |
|----------|-------------|
| `FEISHU_WEBHOOK_URL` | 飞书 Webhook URL |
| `FEISHU_WEBHOOK_SECRET` | 飞书 Webhook 签名密钥 |

## 命令

### `send` —— 发送简单通知

发送不含业务逻辑的通用通知。

```bash
pnpm tsx scripts/feishu-notify.ts send [options]
```

| 选项 | 简写 | 说明 | 是否必填 |
|--------|-------|-------------|----------|
| `--title` | `-t` | 卡片标题 | 是 |
| `--description` | `-d` | 卡片描述（支持 markdown） | 是 |
| `--color` | `-c` | 标题栏配色模板 | 否（默认：turquoise） |

**可选颜色：** `blue`、`wathet`、`turquoise`、`green`、`yellow`、`orange`、`red`、`carmine`、`violet`、`purple`、`indigo`、`grey`、`default`

#### 示例

```bash
# Use $'...' syntax for proper newlines
pnpm tsx scripts/feishu-notify.ts send \
  -t "Deployment Completed" \
  -d $'**Status:** Success\n\n**Environment:** Production\n\n**Version:** v1.2.3' \
  -c green
```

```bash
# Send an error alert (red color)
pnpm tsx scripts/feishu-notify.ts send \
  -t "Error Alert" \
  -d $'**Error Type:** Connection failed\n\n**Severity:** High\n\nPlease check the system status' \
  -c red
```

**注意：** 若要在描述中正确换行，请使用 bash 的 `$'...'` 语法。不要在双引号中使用字面量 `\n`，否则会在飞书卡片中原样显示。

### `issue` —— 发送 GitHub Issue 通知

```bash
pnpm tsx scripts/feishu-notify.ts issue [options]
```

| 选项 | 简写 | 说明 | 是否必填 |
|--------|-------|-------------|----------|
| `--url` | `-u` | GitHub issue URL | 是 |
| `--number` | `-n` | Issue 编号 | 是 |
| `--title` | `-t` | Issue 标题 | 是 |
| `--summary` | `-m` | Issue 摘要 | 是 |
| `--author` | `-a` | Issue 作者 | 否（默认："Unknown"） |
| `--labels` | `-l` | Issue 标签（逗号分隔） | 否 |

#### 示例

```bash
pnpm tsx scripts/feishu-notify.ts issue \
  -u "https://github.com/owner/repo/issues/123" \
  -n "123" \
  -t "Bug: Something is broken" \
  -m "This is a bug report about a feature" \
  -a "username" \
  -l "bug,high-priority"
```

## 在 GitHub Actions 中使用

该脚本主要用于 `.github/workflows/github-issue-tracker.yml`：

```yaml
- name: Install dependencies
  run: pnpm install

- name: Send notification
  run: |
    pnpm tsx scripts/feishu-notify.ts issue \
      -u "${{ github.event.issue.html_url }}" \
      -n "${{ github.event.issue.number }}" \
      -t "${{ github.event.issue.title }}" \
      -a "${{ github.event.issue.user.login }}" \
      -l "${{ join(github.event.issue.labels.*.name, ',') }}" \
      -m "Issue summary content"
  env:
    FEISHU_WEBHOOK_URL: ${{ secrets.FEISHU_WEBHOOK_URL }}
    FEISHU_WEBHOOK_SECRET: ${{ secrets.FEISHU_WEBHOOK_SECRET }}
```

## 飞书卡片消息格式

`issue` 命令发送的交互式卡片包含：

- **标题栏**：`#<issue_number> - <issue_title>`
- **作者**：Issue 创建者
- **标签**：Issue 标签（若有）
- **摘要**：Issue 内容摘要
- **操作按钮**："View Issue" 按钮，链接到 GitHub Issue 页面

## 配置飞书 Webhook

1. 在飞书群中添加自定义机器人
2. 获取 Webhook URL 与签名密钥
3. 在 GitHub Secrets 中配置：
   - `FEISHU_WEBHOOK_URL`：Webhook 地址
   - `FEISHU_WEBHOOK_SECRET`：签名密钥

## 错误处理

以下情况脚本会以非零状态码退出：

- 缺少必需的环境变量（`FEISHU_WEBHOOK_URL`、`FEISHU_WEBHOOK_SECRET`）
- 缺少必需的命令选项
- 飞书 API 返回非 2xx 状态码
- 网络请求失败

## 扩展新命令

该 CLI 的设计支持多种通知类型。新增命令的步骤：

1. 定义命令选项接口
2. 创建卡片构建函数
3. 添加新的命令处理器
4. 用 `program.command()` 注册命令
