# 文件列表模糊搜索

本文档介绍 Magic Box 中文件列表的模糊搜索实现。

## 概述

模糊搜索允许用户输入部分或近似的文件名/路径来查找文件。它采用两级文件过滤策略（ripgrep glob 预过滤 + 贪心子串匹配回退），并结合基于子序列的打分，以兼顾性能与灵活性。

## 特性

- **Ripgrep Glob 预过滤**：使用 glob 模式进行主过滤，获得原生级别的过滤速度
- **贪心子串匹配**：当 ripgrep glob 预过滤没有结果时使用的回退过滤策略
- **基于子序列的路径段打分**：打分阶段，当查询字符按顺序出现时，路径段会获得额外权重
- **相关度打分**：结果按多因子计算出的相关度分数排序

## 匹配策略

### 1. Ripgrep Glob 预过滤（主策略）

查询会被转换为 glob 模式，交由 ripgrep 做初步过滤：

```
Query: "updater"
Glob:  "*u*p*d*a*t*e*r*"
```

这样可以利用 ripgrep 的原生性能完成初步文件过滤。

### 2. 贪心子串匹配（回退策略）

当 glob 预过滤没有返回结果时，系统回退到贪心子串匹配，从而支持更灵活的匹配：

```
Query: "updatercontroller"
File:  "packages/update/src/node/updateController.ts"

Matching process:
1. Find "update" (longest match from start)
2. Remaining "rcontroller" → find "r" then "controller"
3. All parts matched → Success
```

## 打分算法

结果依据 `FileStorage.ts` 中定义的命名常量计算相关度分数并排序：

| 常量 | 值 | 说明 |
|----------|-------|-------------|
| `SCORE_FILENAME_STARTS` | 100 | 文件名以查询开头（优先级最高） |
| `SCORE_FILENAME_CONTAINS` | 80 | 文件名包含完整的查询子串 |
| `SCORE_SEGMENT_MATCH` | 60 | 每个匹配查询的路径段 |
| `SCORE_WORD_BOUNDARY` | 20 | 查询匹配到单词起始位置 |
| `SCORE_CONSECUTIVE_CHAR` | 15 | 每个连续匹配的字符 |
| `PATH_LENGTH_PENALTY_FACTOR` | 4 | 路径越长的对数惩罚 |

### 打分策略

打分的优先顺序为：

1. **文件名匹配**（最高）：查询出现在文件名中的文件相关度最高
2. **路径段匹配**：匹配的路径段越多，相关度越强
3. **单词边界**：优先匹配单词起始位置（例如 "upd" 匹配 "update"）
4. **连续匹配**：连续字符序列越长，分数越高
5. **路径长度**：更短的路径更优（对数惩罚可避免长路径占据结果）

### 打分示例

对于查询 `updater`：

| 文件 | 打分因子 |
|------|---------------|
| `RCUpdater.js` | 路径短 + 文件名包含 "updater" |
| `updateController.ts` | 多个路径段匹配 |
| `UpdaterHelper.plist` | 长路径惩罚 |

## 配置

### DirectoryListOptions

```typescript
interface DirectoryListOptions {
  recursive?: boolean      // Default: true
  maxDepth?: number        // Default: 10
  includeHidden?: boolean  // Default: false
  includeFiles?: boolean   // Default: true
  includeDirectories?: boolean // Default: true
  maxEntries?: number      // Default: 20
  searchPattern?: string   // Default: '.'
  fuzzy?: boolean          // Default: true
}
```

## 用法

```typescript
// Basic fuzzy search
const files = await window.api.file.listDirectory(dirPath, {
  searchPattern: 'updater',
  fuzzy: true,
  maxEntries: 20
})

// Disable fuzzy search (exact glob matching)
const files = await window.api.file.listDirectory(dirPath, {
  searchPattern: 'update',
  fuzzy: false
})
```

## 性能考量

1. **Ripgrep 预过滤**：大多数查询由 ripgrep 的原生 glob 匹配处理，速度极快
2. **按需回退**：贪心子串匹配（需加载全部文件）仅在 glob 匹配返回空结果时执行
3. **结果数量限制**：默认只返回前 20 条结果
4. **排除目录**：常见的大体积目录会被自动排除：
   - `node_modules`
   - `.git`
   - `dist`、`build`
   - `.next`、`.nuxt`
   - `coverage`、`.cache`

## 实现细节

实现位于 `src/main/services/FileStorage.ts`：

- `queryToGlobPattern()`：将查询转换为 ripgrep glob 模式
- `isFuzzyMatch()`：子序列匹配算法
- `isGreedySubstringMatch()`：贪心子串匹配回退
- `getFuzzyMatchScore()`：计算相关度分数
- `listDirectoryWithRipgrep()`：搜索主流程编排
