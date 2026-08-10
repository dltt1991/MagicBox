# 提供商与模型注册表系统

本文档描述 Magic Box 如何加载、解析并将提供商/模型预设数据与用户数据进行合并。

## 架构概览

```
@cherrystudio/provider-registry (package)
├── data/
│   ├── models.json           预设模型（能力、定价、模态……）
│   ├── providers.json        预设提供商（端点、apiFeatures、元数据）
│   └── provider-models.json  提供商专属模型覆盖（按提供商微调）
├── src/
│   ├── registry-loader.ts    RegistryLoader：加载、验证、缓存、索引、空闲 TTL
│   ├── registry-utils.ts     纯函数：lookupRegistryModel、buildPersistedEndpointConfigs
│   ├── utils/normalize.ts    normalizeModelId 及辅助函数（聚合商前缀、变体后缀……）
│   └── schemas/              用于验证的 Zod schema
│
src/main/data/
├── db/seeding/
│   └── seeders/
│       └── presetProviderSeeder.ts   ISeeder：仅插入提供商身份/认证脚手架
├── services/
│   ├── ProviderRegistryService.ts 注册表查询及提供商/模型基线解析
│   ├── ModelService.ts            模型 CRUD 及用户增量应用
│   └── ProviderService.ts         提供商 CRUD 及读时提供商合并
└── api/handlers/
    ├── models.ts                  模型 CRUD、协调及注册表解析路由
    └── providers.ts               提供商 CRUD 及预设投影路由
```

目录条目数量有意不在此处重复：JSON 文件是真实来源，其大小独立于本架构变化。

## 数据流

### 1. 启动：预设提供商种子数据写入

```
DbService.onInit()
  → SeedRunner.runAll(seeders)
    → PresetProviderSeeder.run(db)
      → RegistryLoader.loadProviders()     // 读取 providers.json
      → SELECT existing provider IDs from user_provider
      → INSERT only new provider identity/auth rows
      → Never materialize registry-owned connection config
```

`SeedRunner` 在 `providers.json` 版本变更时重新执行该 seeder，但 seeder 始终为仅插入模式：已存在的提供商行将被跳过。这是安全的，因为注册表所有的连接配置不会被写入行中；每次读取时都会从当前注册表解析。行中仅包含身份信息、用户自有的显示名称以及任何必要的认证框架。

规范预设提供商不可被用户删除。大多数提供商的 `providerId === presetProviderId`；别名/分组预设也通过注册表查询受到保护。继承自预设的用户自建提供商可以被删除。

### 2. 按需：创建模型

```
POST /models [{ providerId: 'openai', modelId: 'gpt-4o' }]
  → handler: for each item, providerRegistryService.lookupModel(providerId, modelId)
    → RegistryLoader.findModel('gpt-4o')           // O(1) 索引，归一化回退
    → RegistryLoader.findOverride('openai', 'gpt-4o')  // O(1) 索引
    → resolve endpoint profile from registry data   // 仅主进程；不持久化
    → returns { presetModel, registryOverride, reasoningProfile }
  → handler: modelService.create(items)
    → mergePresetModel(preset, override, ...)
    → compare explicit DTO fields with the registry baseline
    → INSERT only differing nullable columns into user_model
  → list/get/mutation response
    → rebuild current registry baseline
    → apply every non-null sparse column
```

### 3. 解析 SDK 模型列表

```
GET /providers/:providerId/models:resolve?ids=gpt-4o&ids=o3
  → providerRegistryService.resolveModels(providerId, modelIds)
    → For each modelId:
        → RegistryLoader.findModel(modelId)         // O(1)，归一化回退
        → RegistryLoader.findOverride(providerId, modelId)  // O(1)
        → mergePresetModel(preset, override, ...) or createCustomModel(...)
    → Return merged Model[]

SDK 仅提供模型 ID，其他所有数据（能力、定价等）均来自注册表——SDK 数据不会覆盖注册表中的精选数据。
```

## 合并函数

三个函数分别对应三种不同使用场景：

| 函数 | 使用场景 | 层次 |
|----------|----------|--------|
| `mergePresetModel` | 注册表查询、resolveModels | preset → override |
| `applyUserOverlay` | 带显式用户增量的模型读取 | 合并后的注册表基线 → 用户 |
| `createCustomModel` | 无注册表匹配 | 仅 modelId |

公共逻辑提取至 `applyPresetAndOverride`（preset + override 合并）和 `resolveReasoning`（推理配置解析）。

### 优先级

```
non-null sparse columns  >  provider-models.json  >  models.json
        最高                      中间                    最低
```

对于有预设支撑的行，每个可空的模型配置列都是其自身的所有权标记：null 表示继承注册表，而任何非 null 值则是用户增量。自定义行存储完整配置。这使得目录变更无需数据迁移即可作用于已有行。显式空字符串和空数组仍是有效的覆盖值。

### 用户覆盖保护

当用户修改某个可由注册表丰富的字段（例如 `name`）时，该值直接存入对应的可空列。读时解析从当前注册表开始，应用每一个非 null 列。创建/PATCH 操作将传入值与当前注册表基线对比，因此渲染进程的回显不会冻结目录值；将值恢复为基线会清除该列。

**后续新增模型字段：**

- *注册表所有（不可用户编辑）：* 仅将其加入注册表 schema、运行时 `Model` 及 `mergePresetModel`。不添加 `user_model` 列或持久化增量。现有预设行在下次读取时即可获得该字段，无需 schema 迁移或数据回填。
- *用户可编辑的预设字段：* 添加可空增量列，将其纳入创建/PATCH 覆盖映射及预设增量字段集。schema 迁移新增该列，但现有行无需数据回填：null 表示继承当前注册表值。
- *自定义模型字段：* 自定义行拥有完整配置。新增的必填自定义字段需要运行时默认值或对自定义行的回填；这是预设继承规则的有意例外。
- 因此，自定义行与预设行共享的列，对自定义行可以是必填的，而对预设行仍可为 null（例如 `capabilities` 和 `reasoning`）。

## RegistryLoader

对注册表 JSON 进行缓存、索引访问，支持空闲自动过期。

### 生命周期

- **懒加载**：数据在首次访问时加载（不在启动时加载）
- **预计算索引**：模型和覆盖索引在首次加载时构建，支持 O(1) 查询
- **空闲 TTL**：在 30 秒无访问后自动失效
- **访问刷新**：每次 `findModel/findOverride/loadModels` 调用均重置计时器
- **服务级缓存**：`ProviderRegistryService` 在查询间共享一个 loader；提供商 seeder 自行创建独立的 loader

### 索引

| 索引 | 键 | 用途 |
|-------|-----|-----|
| `modelById` | `model.id` | 精确模型查询 |
| `modelByNormId` | `normalizeModelId(id)` | 归一化回退 |
| `modelBySizedNorm` | 保留参数量的归一化模型 ID | 解析带参数量标签的变体 |
| `overrideByKey` | `providerId::modelId` | 精确覆盖查询 |
| `overrideByNormKey` | `providerId::normalizeModelId(id)` | 归一化回退 |
| `overrideByApiKey` | `providerId::apiModelId` | 精确提供商侧模型 ID 查询 |
| `overrideByNormApiKey` | `providerId::normalizeModelId(apiModelId)` | 归一化提供商侧回退 |
| `overridesByProvider` | `providerId` | 某提供商的所有覆盖 |

### 查询 API

```typescript
loader.findModel(modelId)                    // O(1)：精确匹配 → 归一化回退
loader.findOverride(providerId, modelId)     // O(1)：精确匹配 → 归一化回退
loader.getOverridesForProvider(providerId)   // O(1)：按提供商分组
loader.invalidate()                          // 释放所有数据，下次访问时重新加载
```

## 模型 ID 归一化

不同提供商的用户侧模型 ID 往往与注册表规范 ID 不同：

| 用户看到 | 注册表中 | 归一化方式 |
|-----------|-------------|---------------|
| `aihubmix-gpt-4o` | `gpt-4o` | 去除聚合商前缀 |
| `gpt-4o:free` | `gpt-4o` | 去除变体后缀 |
| `claude-3.5-sonnet` | `claude-3-5-sonnet` | 归一化版本分隔符 |
| `aihubmix-gpt-4o:free` | `gpt-4o` | 组合处理 |

实现于 `normalizeModelId()`（`packages/provider-registry/src/utils/normalize.ts`）：

```
1. 去除提供商前缀（如 "anthropic/claude-3" → "claude-3"）
2. 转为小写
3. 去除聚合商前缀（aihubmix-、zai-、siliconflow-……）
4. 展开已知缩写（mm- → minimax-）
5. 去除变体后缀（:free、-thinking、(beta)……）
6. 去除参数量后缀（-72b、-7b……）
7. 归一化版本分隔符（3.5 → 3-5、3p5 → 3-5）
```

**查询策略**：先精确匹配，再归一化回退。这确保当 `gpt-4o` 和 `aihubmix-gpt-4o` 作为独立条目同时存在时，精确匹配优先。

## 关键数据库表

### user_provider

| 列 | 用途 |
|--------|---------|
| `providerId` | 主键，用户自定义唯一 ID |
| `presetProviderId` | 关联 providers.json 中的条目（null = 自定义提供商）。双重用途：标识源预设 *以及* 侧边栏分组键——对少数注册表行（如 `zai`→`zhipu`、`minimax-global`→`minimax`），它指向另一个预设，使其折叠到该分组下。 |
| `name` | 用户自有显示名称，在行首次写入时从预设初始化 |
| `endpointConfigs` | JSON 增量：用户 `baseUrl` 覆盖；自定义提供商也可存储 `adapterFamily` 路由提示 |
| `defaultChatEndpoint` | 可空用户覆盖；null 时继承注册表默认值 |
| `apiKeys` | JSON 数组，存储 API 密钥条目 |
| `apiFeatures` | JSON 增量：仅存储与注册表/应用默认值不同的标志；null 时继承所有默认值 |

### user_model

| 列 | 用途 |
|--------|---------|
| `id` | 确定性主键：`providerId::modelId` |
| `providerId` + `modelId` | 提供商内唯一的模型标识 |
| `presetModelId` | 关联 models.json 条目（null = 自定义模型） |
| `name` / `capabilities` / `supportsStreaming` | 自定义行必填；预设行可空增量 |
| `inputModalities` / `outputModalities` | 完整自定义配置或可空预设增量 |
| `contextWindow` / `maxOutputTokens` | 完整自定义配置或可空预设增量 |
| `reasoning` | 自定义模型的固有控制/token 限制；预设行从注册表解析 |
| `pricing` | 完整自定义配置或可空预设增量 |
| `parameters` | 完整自定义配置或可空预设增量 |
| `orderKey` | 提供商模型列表中的分数排序键 |
| `notes` | 用户对该模型的备注 |

## 提供商配置合并

提供商连接配置遵循与模型相同的分层读时合并方式。`user_provider` 行是**增量**：仅存储用户显式设置的内容；键缺失表示"使用注册表值"。合并在 `rowToRuntimeProvider`（ProviderService）中通过 `ProviderRegistryService.mergeEndpointConfigs` / `getProviderDisplayMetadata` 完成：

```
user_provider（DB，增量）  >  providers.json（注册表）  >  应用默认值
```

| 字段 | 所有权 | 解析方式 |
| --- | --- | --- |
| `endpointConfigs[ep].baseUrl` | 用户 | 行 > 注册表 |
| `endpointConfigs[ep].adapterFamily` | 注册表 | 注册表 > 行（自定义提供商提示）> `inferAdapterFamily(ep)` |
| `endpointConfigs[ep].modelsApiUrls` | 注册表 | 仅注册表 |
| 端点类型键集 | 注册表 ∪ 用户 | 注册表与行键的并集 |
| `apiFeatures` | 混合 | `{...DEFAULT_API_FEATURES, ...registry, ...row}` |
| `defaultChatEndpoint` | 混合 | 行 > 注册表 |

由于注册表所有的信息从不冻结到行中，注册表更新（新端点类型、变更的适配器族、baseURL、功能标志或默认端点）在此增量契约下创建的行中生效时**无需数据迁移**（#17096）。写入路径强制执行增量：`EndpointConfigOverride` 是唯一可持久化的端点形态，PATCH 归一化会丢弃等于注册表基线的值。

例如，未被用户修改的预设 `baseUrl` 不存在于行中。若提供商在 `providers.json` 中变更了该 URL，下次读取将返回新 URL。用户自定义的代理 URL 保留在行中，直到用户将其重置为当前注册表值时才停止优先。

提供商 `name` 是有意不同的：它是用户自有的完整值，在写入种子数据时初始化，而非注册表增量。后续的注册表重命名不会替换它。若产品语义变更为"继承直到用户重命名"，则 `name` 必须先转换为显式增量表示形式。

### 何时需要回填

当存储所有权契约未改变时，注册表内容更新不需要回填：

- 注册表专有字段在读时直接解析。
- `baseUrl`、`apiFeatures`、`defaultChatEndpoint` 等混合字段在行增量缺失时继承注册表值。
- 现有用户覆盖有意继续优先；它们不是过期数据。
- 新增的注册表专有字段应加入读时投影，而非持久化。

仍可能需要 schema 迁移来为新的用户可编辑字段添加存储，但当 null/缺失表示"继承"时，预设行无需数据回填。仅在以下情况需要回填：完整的自定义行新增了无运行时默认值的必填字段，或现有字段从完整快照所有权变更为增量所有权且需要兼容旧数据库时。

**后续新增注册表字段：**

- *注册表所有（不可用户编辑）：* 仅加入读时合并输出。对于端点配置字段，不将其加入 `EndpointConfigOverride`——zod 会自动从写入 DTO 中剥离。零迁移。
- *用户可编辑的端点字段（混合所有权）：* 将其加入 `EndpointConfigOverrideSchema`（`keyof` 集合是权威的所有权声明），在合并中添加 `row.x ?? registry.x` 规则，并可选地在写入时丢弃等于基线的值。零迁移——缺失的键回退到注册表。
- *用户可编辑的提供商字段：* 若属于现有 JSON 增量（如 `apiFeatures`），以零迁移方式扩展该 schema 和合并规则。否则选择显式的持久化覆盖存储位置。新增独立列是 schema 变更，但可空预设增量列仍无需值回填。此设计不使任意顶层字段免于迁移。
- 永远不要将注册表所有的值作为行快照持久化：这正是注册表更新变得陈旧的原因。

## 推理配置

推理跨越两个边界划分：

- **模型数据**声明固有控制和 token 限制。主进程注册表丰富将其投影到运行时专属的 `selectableEfforts`，供渲染进程控件使用。
- **提供商注册表数据**声明封闭的 `reasoningFormat` 线路配置。它仅在主进程中解析和解释；永远不会复制到 SQLite、DataApi 或渲染进程状态中。

请求路径依次从精确的提供商-模型、端点覆盖/默认值，再到穷举格式默认值中解析出一个配置。它将该配置与提交时的规范选择结合，输出原生 AI SDK 提供商选项或通用兼容参数。

详见 [推理控制](../../../../packages/provider-registry/docs/reasoning-control.md)，了解 schema、优先级规则及 UI 到请求的数据流。

## 文件位置

| 内容 | 位置 |
|------|-------|
| 注册表 JSON 数据 | `packages/provider-registry/data/` |
| Zod schema | `packages/provider-registry/src/schemas/` |
| RegistryLoader（加载、索引、TTL） | `packages/provider-registry/src/registry-loader.ts` |
| 纯查询/转换 | `packages/provider-registry/src/registry-utils.ts` |
| 归一化工具 | `packages/provider-registry/src/utils/normalize.ts` |
| 种子运行器 | `src/main/data/db/seeding/SeedRunner.ts` |
| 预设提供商种子写入 | `src/main/data/db/seeding/seeders/presetProviderSeeder.ts` |
| 服务（合并查询） | `src/main/data/services/ProviderRegistryService.ts` |
| 模型服务 | `src/main/data/services/ModelService.ts` |
| 提供商服务 | `src/main/data/services/ProviderService.ts` |
| 注册表/模型基线合并 | `src/main/data/services/ProviderRegistryService.ts` |
| 用户模型增量覆盖 | `src/main/data/services/ModelService.ts` |
| DB schema | `src/main/data/db/schemas/userModel.ts`、`userProvider.ts` |
