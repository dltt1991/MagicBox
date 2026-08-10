# Magic Box 局域网传输协议规范

> 版本：1.0
> 最后更新：2025-12

本文档定义 Magic Box 桌面客户端（Electron）与移动客户端（Expo）之间的局域网文件传输协议。

---

## 目录

1. [协议概览](#1-协议概览)
2. [服务发现（Bonjour/mDNS）](#2-服务发现bonjourmdns)
3. [TCP 连接与握手](#3-tcp-连接与握手)
4. [消息格式规范](#4-消息格式规范混合协议)
5. [文件传输协议](#5-文件传输协议)
6. [心跳与保活](#6-心跳与保活)
7. [错误处理](#7-错误处理)
8. [常量与配置](#8-常量与配置)
9. [完整时序图](#9-完整时序图)
10. [移动端实现指南](#10-移动端实现指南v1)

---

## 1. 协议概览

### 1.1 架构角色

| 角色 | 平台 | 职责 |
|------|----------|---------------|
| **Client** | Electron 桌面端 | 扫描服务、发起连接、发送文件 |
| **Server** | Expo 移动端 | 发布服务、接受连接、接收文件 |

### 1.2 协议栈（v1）

```
┌─────────────────────────────────────┐
│     Application Layer (File Transfer)│
├─────────────────────────────────────┤
│     Message Layer (Control: JSON \n) │
│                   (Data: Binary Frame)│
├─────────────────────────────────────┤
│     Transport Layer (TCP)            │
├─────────────────────────────────────┤
│     Discovery Layer (Bonjour/mDNS)   │
└─────────────────────────────────────┘
```

### 1.3 通信流程概览

```
1. Service Discovery → Mobile publishes mDNS service, Desktop scans and discovers
2. TCP Handshake → Establish connection, exchange device info (version=1)
3. File Transfer → Control messages use JSON, file_chunk uses binary frame chunked transfer
4. Keep-alive → ping/pong heartbeat
```

---

## 2. 服务发现（Bonjour/mDNS）

### 2.1 服务类型

| 属性 | 值 |
|----------|-------|
| 服务类型 | `cherrystudio` |
| 协议 | `tcp` |
| 完整服务标识 | `_cherrystudio._tcp` |

### 2.2 服务发布（移动端）

移动端必须通过 mDNS/Bonjour 发布服务：

```typescript
{
  name: "Magic Box Mobile",
  type: "cherrystudio",
  protocol: "tcp",
  port: 53317,
  txt: {
    version: "1",
    platform: "ios"  // or "android"
  }
}
```

### 2.3 服务发现（桌面端）

桌面端扫描并解析服务信息：

```typescript
type LanTransferPeer = {
  id: string;
  name: string;
  host?: string;
  fqdn?: string;
  port?: number;
  type?: string;
  protocol?: 'tcp' | 'udp';
  addresses: string[];
  txt?: Record<string, string>;
  updatedAt: number;
}
```

### 2.4 IP 地址选择策略

当一个服务有多个 IP 地址时，优先选择 IPv4：

```typescript
const preferredAddress = addresses.find((addr) => isIPv4(addr)) || addresses[0]
```

---

## 3. TCP 连接与握手

### 3.1 建立连接

1. 客户端使用发现到的 `host:port` 建立 TCP 连接
2. 连接建立后立即发送握手消息
3. 等待服务端的握手确认

### 3.2 握手消息（协议版本 v1）

#### Client → Server：`handshake`

```typescript
type LanTransferHandshakeMessage = {
  type: 'handshake';
  deviceName: string;
  version: string;     // Protocol version, currently "1"
  platform?: string;   // 'darwin' | 'win32' | 'linux'
  appVersion?: string;
}
```

---

## 4. 消息格式规范（混合协议）

v1 采用「控制 JSON + 二进制数据帧」的混合协议（流式模式，不做逐块 ACK）：

- **控制消息**（handshake、heartbeat、file_start/ack、file_end、file_complete）：UTF-8 JSON，以 `\n` 分隔
- **数据消息**（`file_chunk`）：二进制帧，使用 Magic + 总长度分帧，不使用 Base64

### 4.1 控制消息编码（JSON + `\n`）

| 属性 | 规范 |
|----------|--------------|
| 编码 | UTF-8 |
| 序列化 | JSON |
| 消息分隔符 | `\n`（0x0A） |

### 4.2 `file_chunk` 二进制帧格式

为解决 TCP 拆包/粘包问题并消除 Base64 开销，`file_chunk` 使用带总长度的二进制帧：

```
┌──────────┬──────────┬────────┬───────────────┬──────────────┬────────────┬───────────┐
│ Magic    │ TotalLen │ Type   │ TransferId Len│ TransferId   │ ChunkIdx   │ Data      │
│ 0x43 0x53│ (4B BE)  │ 0x01   │ (2B BE)       │ (UTF-8)      │ (4B BE)    │ (raw)     │
└──────────┴──────────┴────────┴───────────────┴──────────────┴────────────┴───────────┘
```

| 字段 | 大小 | 说明 |
|-------|------|-------------|
| Magic | 2B | 固定为 `0x43 0x53`（"CS"），用于与 JSON 消息区分 |
| TotalLen | 4B | 大端序，帧总长度（不含 Magic/TotalLen） |
| Type | 1B | `file_chunk` 为 `0x01` |
| TransferId Len | 2B | 大端序，transferId 字符串长度 |
| TransferId | nB | UTF-8 编码的 transferId（长度取自上一字段） |
| ChunkIdx | 4B | 大端序，分块索引，从 0 开始 |
| Data | mB | 原始文件二进制数据（未编码） |

> 帧总长度计算方式：`TotalLen = 1 + 2 + transferIdLen + 4 + dataLen`

### 4.3 消息解析策略

1. 将 socket 数据读入缓冲区
2. 若前两个字节为 `0x43 0x53` → 按二进制帧解析
3. 否则若首字节为 `{` → 按 JSON + `\n` 控制消息解析
4. 其他情况丢弃 1 个字节并继续循环

### 4.4 消息类型汇总（v1）

| 类型 | 方向 | 编码 | 用途 |
|------|-----------|----------|---------|
| `handshake` | Client → Server | JSON+\n | 握手请求（version=1） |
| `handshake_ack` | Server → Client | JSON+\n | 握手响应 |
| `ping` | Client → Server | JSON+\n | 心跳请求 |
| `pong` | Server → Client | JSON+\n | 心跳响应 |
| `file_start` | Client → Server | JSON+\n | 开始文件传输 |
| `file_start_ack` | Server → Client | JSON+\n | 文件传输确认 |
| `file_chunk` | Client → Server | Binary | 文件数据块（无 Base64，流式，不逐块 ACK） |
| `file_end` | Client → Server | JSON+\n | 文件传输结束 |
| `file_complete` | Server → Client | JSON+\n | 传输完成结果 |

---

## 5. 文件传输协议

### 5.1 传输流程

```
Client (Sender)                     Server (Receiver)
     |                                    |
     |──── 1. file_start ────────────────>|
     |                                    |
     |<─── 2. file_start_ack ─────────────|
     |                                    |
     |══════ Loop: send data chunks ══════|
     |                                    |
     |──── 3. file_chunk [0] ────────────>|
     |──── 3. file_chunk [1] ────────────>|
     |      ... repeat until all sent ... |
     |                                    |
     |──── 5. file_end ──────────────────>|
     |                                    |
     |<─── 6. file_complete ──────────────|
```

### 5.2 消息定义

#### 5.2.1 `file_start`

```typescript
type LanTransferFileStartMessage = {
  type: 'file_start';
  transferId: string;    // UUID, unique transfer identifier
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;      // SHA-256 hash of entire file (hex)
  totalChunks: number;
  chunkSize: number;
}
```

#### 5.2.2 `file_start_ack`

```typescript
type LanTransferFileStartAckMessage = {
  type: 'file_start_ack';
  transferId: string;
  accepted: boolean;
  message?: string;      // Rejection reason
}
```

#### 5.2.3 `file_chunk` —— 二进制帧

帧格式见 4.2 节。`Data` 为原始文件二进制数据。完整性依赖 `file_start.checksum`（整个文件的 SHA-256）。

#### 5.2.4 `file_end`

```typescript
type LanTransferFileEndMessage = {
  type: 'file_end';
  transferId: string;
}
```

#### 5.2.5 `file_complete`

```typescript
type LanTransferFileCompleteMessage = {
  type: 'file_complete';
  transferId: string;
  success: boolean;
  filePath?: string;     // Save path (on success)
  error?: string;        // Error message (on failure)
}
```

### 5.3 校验和

```typescript
async function calculateFileChecksum(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(filePath)
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}
```

### 5.4 分块大小

```typescript
const CHUNK_SIZE = 512 * 1024 // 512KB
const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)
```

---

## 6. 心跳与保活

### 6.1 消息

- **`ping`**（Client → Server）：`{ type: 'ping', payload?: string }`
- **`pong`**（Server → Client）：`{ type: 'pong', received: boolean, payload?: string }`

### 6.2 策略

- 握手成功后立即发送 `ping` 以验证连接
- 可选：周期性发送心跳以保持连接活跃

---

## 7. 错误处理

### 7.1 超时配置

| 操作 | 超时 | 说明 |
|-----------|---------|-------------|
| TCP 连接 | 10s | 建立连接的超时时间 |
| 握手 | 10s | 等待 `handshake_ack` |
| 传输完成 | 60s | 等待 `file_complete` |

### 7.2 错误场景

| 场景 | 客户端处理 | 服务端处理 |
|----------|----------------|-----------------|
| TCP 连接失败 | 通知 UI，允许重试 | - |
| 握手超时 | 断开连接，通知 UI | 关闭 socket |
| 握手被拒绝 | 展示拒绝原因 | - |
| 分块处理失败 | 中止传输并清理 | 清理临时文件 |
| 意外断开 | 清理状态，通知 UI | 清理临时文件 |
| 存储空间不足 | - | 发送 `accepted: false` |

---

## 8. 常量与配置

```typescript
export const LAN_TRANSFER_PROTOCOL_VERSION = '1'
export const LAN_TRANSFER_SERVICE_TYPE = 'cherrystudio'
export const LAN_TRANSFER_SERVICE_FULL_NAME = '_cherrystudio._tcp'
export const LAN_TRANSFER_TCP_PORT = 53317
export const LAN_TRANSFER_CHUNK_SIZE = 512 * 1024         // 512KB
export const LAN_TRANSFER_GLOBAL_TIMEOUT_MS = 10 * 60 * 1000  // 10 minutes
export const LAN_TRANSFER_HANDSHAKE_TIMEOUT_MS = 10_000
export const LAN_TRANSFER_CHUNK_TIMEOUT_MS = 30_000
export const LAN_TRANSFER_COMPLETE_TIMEOUT_MS = 60_000

export const LAN_TRANSFER_ALLOWED_EXTENSIONS = ['.zip']
export const LAN_TRANSFER_ALLOWED_MIME_TYPES = ['application/zip', 'application/x-zip-compressed']
```

---

## 9. 完整时序图

```
┌─────────┐                           ┌─────────┐                           ┌─────────┐
│ Renderer│                           │  Main   │                           │ Mobile  │
│  (UI)   │                           │ Process │                           │ Server  │
└────┬────┘                           └────┬────┘                           └────┬────┘
     │                                     │                                     │
     │  ═══════ Service Discovery ═════════                                      │
     │ startScan()                         │                                     │
     │────────────────────────────────────>│ mDNS browse                         │
     │                                     │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>│
     │                                     │<─ ─ ─ service discovered ─ ─ ─ ─ ─ ─│
     │<────── onServicesUpdated ───────────│                                     │
     │                                     │                                     │
     │  ═══════ Handshake ════════════════                                       │
     │ connect(peer)                       │                                     │
     │────────────────────────────────────>│──────── TCP Connect ───────────────>│
     │                                     │──────── handshake ─────────────────>│
     │                                     │<─────── handshake_ack ──────────────│
     │                                     │──────── ping ──────────────────────>│
     │                                     │<─────── pong ───────────────────────│
     │<────── connect result ──────────────│                                     │
     │                                     │                                     │
     │  ═══════ File Transfer ════════════                                       │
     │ sendFile(path)                      │                                     │
     │────────────────────────────────────>│──────── file_start ────────────────>│
     │                                     │<─────── file_start_ack ─────────────│
     │                                     │──────── file_chunk[0] (binary) ────>│
     │<────── progress event ──────────────│                                     │
     │                                     │──────── file_chunk[1] (binary) ────>│
     │<────── progress event ──────────────│         ... repeat ...              │
     │                                     │──────── file_end ──────────────────>│
     │                                     │<─────── file_complete ──────────────│
     │<────── complete event ──────────────│                                     │
```

---

## 10. 移动端实现指南（v1）

### 10.1 必备能力

1. **mDNS 服务发布**：在 TCP 端口 `53317` 上发布 `_cherrystudio._tcp` 服务
2. **TCP 服务端**：监听指定端口
3. **消息解析**：控制消息使用 UTF-8 + `\n` 的 JSON；数据消息使用二进制帧（Magic+TotalLen 分帧）
4. **握手处理**：校验 `handshake`，发送 `handshake_ack`，响应 `ping`
5. **文件接收（流式）**：解析 `file_start`，接收 `file_chunk` 二进制帧（写入文件 + 增量哈希），处理 `file_end`，发送 `file_complete`

### 10.2 推荐库

**React Native / Expo：**

- mDNS：`react-native-zeroconf` 或 `@homielab/react-native-bonjour`
- TCP：`react-native-tcp-socket`
- 加密：`expo-crypto` 或 `react-native-quick-crypto`

---

## 附录 A：TypeScript 类型定义

完整类型定义位于 `src/shared/types/lanTransfer.ts`。完整接口定义请参见源码。

## 附录 B：版本历史

| 版本 | 日期 | 变更 |
|---------|------|---------|
| 1.0 | 2025-12 | 首次发布，引入二进制帧格式与流式传输 |
