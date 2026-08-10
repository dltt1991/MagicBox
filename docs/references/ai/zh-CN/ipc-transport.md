# IPC 传输

## 作用

渲染端通过 `useChat` 和自定义 `IpcChatTransport` 与主进程 AI 流通信。它把 AI SDK UI 层的发送、重连、中止接口映射到 Electron IPC。

## 基本流程

1. UI 调用 `sendMessages`。
2. transport 组装 `Ai_Stream_Open` 请求。
3. 主进程 `AiStreamManager` 创建或复用 topic stream。
4. 主进程把 `UIMessageChunk` 广播回渲染端。
5. 渲染端把实时 overlay 和数据库消息合并显示。

## 重连

窗口刷新、tab 切换或组件重新挂载时，渲染端可以对同一 topic 重新 attach。主进程的流不依赖某个窗口生存；只要流还在，新的 listener 可以继续接收后续 chunk。

## 中止

用户 Stop 会通过 IPC 请求主进程中止 topic。普通聊天会中止当前 execution；agent session 会关闭 runtime session，使底层 driver 和子进程释放资源。

## 状态镜像

topic stream status 会写到共享 cache。渲染端不用猜测当前是否 pending、streaming、awaiting approval，而是读取主进程镜像出的权威状态。
