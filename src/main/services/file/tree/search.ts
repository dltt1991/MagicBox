/**
 * Directory search — ripgrep + fuzzy matching.
 *
 * Only `listDirectory` is public. All ripgrep / scoring internals are private.
 *
 * Two modes share one entry point, distinguished by `options.searchPattern`:
 *   - List mode (`searchPattern === '.'`, the default): enumerate the
 *     directory tree. No result cap by default — set `maxEntries` only when
 *     truncation is desired (e.g. autocomplete dropdowns).
 *   - Search mode (`searchPattern` is a user query): FanBox-style breadth-first
 *     filesystem walk with a time budget and fuzzy scoring. Caller controls
 *     `maxEntries` for the dropdown size.
 */

import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { loggerService } from '@logger'
import { getBinaryExecutionEnv } from '@main/utils/binaryEnv'
import { getBinaryPath } from '@main/utils/binaryResolver'
import type { AbsoluteFilePath, DirectoryEntry, DirectoryListOptions } from '@shared/types/file'

import { defaultRipgrepGlobArgs } from './gitignore'

const logger = loggerService.withContext('Utils:File:Search')

// `fuzzy` is an internal-only knob today (no shared-type field, no real
// caller toggles it). Kept in the resolved-options shape so existing branches
// stay literal-faithful to the legacy `FileStorage` implementation.
interface DirectoryListOptionsInternal extends DirectoryListOptions {
  fuzzy?: boolean
  signal?: AbortSignal
}

type ResolvedOptions = Required<Omit<DirectoryListOptionsInternal, 'searchRequestId' | 'signal'>> &
  Pick<DirectoryListOptionsInternal, 'searchRequestId' | 'signal'>

const DEFAULT_DIRECTORY_LIST_OPTIONS: ResolvedOptions = {
  recursive: true,
  maxDepth: 10,
  includeHidden: false,
  includeFiles: true,
  includeDirectories: true,
  // Was `20` in the legacy FileStorage impl — that turned list-mode calls
  // (ArtifactPane workspace tree) into silently-truncated 20-entry stubs.
  // Truncation is a search-mode concern; callers that want a cap pass
  // `maxEntries` explicitly.
  maxEntries: Number.MAX_SAFE_INTEGER,
  searchPattern: '.',
  fuzzy: true
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return

  throw signal.reason instanceof Error ? signal.reason : new Error('Directory search aborted')
}

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.idea',
  '.vscode',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.cache'
])

const SEARCH_WALK_FILE_LIMIT = 60_000
const SEARCH_WALK_MATCH_LIMIT_MULTIPLIER = 4
const SEARCH_WALK_TIME_BUDGET_MS = 4_000

// `defaultRipgrepGlobArgs()` is the single source of these patterns; both
// chokidar's `ignored` predicate and the post-scan filter consume the same
// defaults via `loadGitignorePredicate`. See `gitignore.ts` for the
// "single source of truth, three consumers" rationale.

// ─── Ripgrep binary + execution ────────────────────────────────────────────

// Ripgrep is a BinaryManager-managed tool: bundled into `cherry.bin` at boot
// and overridable by a mise-installed copy. `getBinaryPath('rg')` resolves
// that single source of truth (mise shim → cherry.bin); a bare `rg` fallback
// fails the existsSync check below, surfacing as "binary not available".
async function resolveRipgrepBinary(): Promise<string | null> {
  const binaryPath = await getBinaryPath('rg')
  return fs.existsSync(binaryPath) ? binaryPath : null
}

function getRipgrepOutputLineLimit(options: ResolvedOptions, multiplier = 1): number | undefined {
  if (!Number.isFinite(options.maxEntries) || options.maxEntries === Number.MAX_SAFE_INTEGER) {
    return undefined
  }

  return Math.max(options.maxEntries, options.maxEntries * multiplier)
}

async function executeRipgrep(args: string[], maxOutputLines?: number): Promise<{ exitCode: number; output: string }> {
  const ripgrepBinaryPath = await resolveRipgrepBinary()
  if (!ripgrepBinaryPath) {
    throw new Error('Ripgrep binary not available')
  }

  return new Promise((resolve, reject) => {
    const child = spawn(ripgrepBinaryPath, ['--no-config', '--ignore-case', '--no-messages', ...args], {
      env: { ...process.env, ...getBinaryExecutionEnv() },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''
    let errorOutput = ''
    let outputLineCount = 0
    let stoppedAfterLimit = false

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString()
      output += chunk

      if (!maxOutputLines || stoppedAfterLimit) return

      outputLineCount += chunk.split('\n').filter((line) => line.trim()).length
      if (outputLineCount >= maxOutputLines) {
        stoppedAfterLimit = true
        child.kill('SIGTERM')
      }
    })

    child.stderr.on('data', (data: Buffer) => {
      errorOutput += data.toString()
    })

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (stoppedAfterLimit) {
        resolve({
          exitCode: 0,
          output
        })
        return
      }

      // `code === null` happens when the process was killed by a signal
      // (SIGKILL / SIGTERM on OOM, parent crash, etc.). Coercing it to 0
      // would surface as "ripgrep exited successfully with no matches" =
      // an empty directory listing, which is indistinguishable from a real
      // empty result. Reject explicitly so callers can decide.
      if (code === null && signal !== null) {
        reject(new Error(`Ripgrep terminated by signal ${signal}: ${errorOutput || output}`))
        return
      }
      resolve({
        exitCode: code ?? 0,
        output: output || errorOutput
      })
    })

    child.on('error', (error: Error) => {
      reject(error)
    })
  })
}

function hasRipgrepResults(output: string): boolean {
  return output.split('\n').some((line) => line.trim())
}

// ─── Directory walk ────────────────────────────────────────────────────────

async function searchDirectories(
  resolvedPath: string,
  options: ResolvedOptions,
  currentDepth: number = 0,
  limit: number = options.maxEntries
): Promise<string[]> {
  if (!options.includeDirectories) return []
  if (!options.recursive && currentDepth > 0) return []
  if (options.maxDepth > 0 && currentDepth >= options.maxDepth) return []
  if (limit <= 0) return []

  const directories: string[] = []

  try {
    const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true })
    const searchPatternLower = options.searchPattern.toLowerCase()

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (!options.includeHidden && entry.name.startsWith('.')) continue
      if (EXCLUDED_DIRS.has(entry.name)) continue

      const fullPath = path.join(resolvedPath, entry.name).replace(/\\/g, '/')

      if (options.searchPattern === '.' || entry.name.toLowerCase().includes(searchPatternLower)) {
        directories.push(fullPath)
        if (directories.length >= limit) break
      }

      if (options.recursive && currentDepth < options.maxDepth) {
        const subDirs = await searchDirectories(fullPath, options, currentDepth + 1, limit - directories.length)
        directories.push(...subDirs)
        if (directories.length >= limit) break
      }
    }
  } catch (error) {
    logger.warn(`Failed to search directories in: ${resolvedPath}`, error as Error)
  }

  return directories
}

async function searchByFilename(resolvedPath: string, options: ResolvedOptions): Promise<string[]> {
  const files: string[] = []
  const directories: string[] = []

  if (options.includeFiles) {
    const args: string[] = ['--files']

    if (options.includeHidden) {
      args.push('--hidden')
    } else {
      args.push('--glob', '!.*')
    }

    // ripgrep filters by filename (case-insensitive)
    if (options.searchPattern && options.searchPattern !== '.') {
      args.push('--iglob', `*${options.searchPattern}*`)
    }

    args.push(...defaultRipgrepGlobArgs())

    if (!options.recursive) {
      args.push('--max-depth', '1')
    } else if (options.maxDepth > 0) {
      args.push('--max-depth', options.maxDepth.toString())
    }

    args.push(resolvedPath)

    const { exitCode, output } = await executeRipgrep(args, getRipgrepOutputLineLimit(options))

    // Exit 0 = matches; 1 = no matches. With --hidden, macOS privacy
    // protected subdirectories can make ripgrep return 2 while still
    // emitting usable stdout for accessible entries; keep that partial list.
    if (exitCode >= 2 && !hasRipgrepResults(output)) {
      throw new Error(`Ripgrep failed with exit code ${exitCode}: ${output}`)
    }

    files.push(
      ...output
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.replace(/\\/g, '/'))
    )
  }

  if (options.includeDirectories) {
    directories.push(...(await searchDirectories(resolvedPath, options)))
  }

  // Directories first (alphabetical), then files (alphabetical).
  const sortedDirectories = directories.sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
  const sortedFiles = files.sort((a, b) => path.basename(a).localeCompare(path.basename(b)))

  return [...sortedDirectories, ...sortedFiles].slice(0, options.maxEntries)
}

// ─── FanBox-style fuzzy search ─────────────────────────────────────────────

function getFanboxFuzzyScore(query: string, target: string): number {
  const queryLower = query.toLowerCase()
  const targetLower = target.toLowerCase()
  let queryIndex = 0
  let score = 0
  let lastIndex = -1
  let streak = 0

  for (let targetIndex = 0; targetIndex < targetLower.length && queryIndex < queryLower.length; targetIndex++) {
    if (targetLower[targetIndex] !== queryLower[queryIndex]) continue

    let points = 10
    if (targetIndex === lastIndex + 1) {
      streak++
      points += streak * 8
    } else {
      streak = 0
    }
    if (targetIndex === 0 || /[/_. -]/.test(targetLower[targetIndex - 1])) points += 15
    points += Math.max(0, 8 - targetIndex * 0.1)
    score += points
    lastIndex = targetIndex
    queryIndex++
  }

  if (queryIndex < queryLower.length) return -1
  score -= (targetLower.length - queryLower.length) * 0.2
  return score
}

async function searchByWalking(resolvedPath: string, options: ResolvedOptions): Promise<string[]> {
  const query = options.searchPattern.trim()
  if (!query) return []

  const deadline = Date.now() + SEARCH_WALK_TIME_BUDGET_MS
  const queue: Array<{ path: string; depth: number }> = [{ path: resolvedPath, depth: 0 }]
  const matches: Array<{ path: string; score: number }> = []
  const matchLimit = Number.isFinite(options.maxEntries)
    ? Math.max(options.maxEntries, options.maxEntries * SEARCH_WALK_MATCH_LIMIT_MULTIPLIER)
    : SEARCH_WALK_FILE_LIMIT
  let scannedFiles = 0

  const pushMatch = async (entryPath: string, name: string, isDirectory: boolean, bonus: number) => {
    throwIfAborted(options.signal)
    const nameScore = getFanboxFuzzyScore(query, name)
    if (nameScore <= 0) return

    let mtime = 0
    try {
      throwIfAborted(options.signal)
      mtime = (await fs.promises.lstat(entryPath)).mtimeMs
    } catch {
      throwIfAborted(options.signal)
      // Keep the name match even if metadata is unavailable.
    }
    throwIfAborted(options.signal)

    const pathBonus = getFanboxFuzzyScore(query, entryPath) > 0 ? 3 : 0
    const recencyBonus = Math.max(0, 20 - (Date.now() - mtime) / 86_400_000) * 0.6
    matches.push({ path: entryPath, score: nameScore + pathBonus + recencyBonus + bonus + (isDirectory ? 6 : 0) })
  }

  while (queue.length > 0) {
    throwIfAborted(options.signal)
    if (Date.now() > deadline || scannedFiles >= SEARCH_WALK_FILE_LIMIT || matches.length >= matchLimit) break

    const current = queue.shift()
    if (!current) break
    if (!options.recursive && current.depth > 0) continue
    if (options.maxDepth > 0 && current.depth >= options.maxDepth) continue

    let entries: fs.Dirent[]
    try {
      throwIfAborted(options.signal)
      entries = await fs.promises.readdir(current.path, { withFileTypes: true })
    } catch {
      throwIfAborted(options.signal)
      continue
    }

    for (const entry of entries) {
      throwIfAborted(options.signal)
      if (Date.now() > deadline || scannedFiles >= SEARCH_WALK_FILE_LIMIT || matches.length >= matchLimit) break
      if (entry.name === '.DS_Store') continue
      if (!options.includeHidden && entry.name.startsWith('.')) continue

      const entryPath = path.join(current.path, entry.name).replace(/\\/g, '/')
      const isDirectory = entry.isDirectory()

      if (isDirectory) {
        if (EXCLUDED_DIRS.has(entry.name)) continue
        if (options.includeDirectories) {
          await pushMatch(entryPath, entry.name, true, 0)
        }
        if (options.recursive) queue.push({ path: entryPath, depth: current.depth + 1 })
        continue
      }

      scannedFiles++
      if (!options.includeFiles) continue

      await pushMatch(entryPath, entry.name, false, 0)
    }
  }

  matches.sort((left, right) => right.score - left.score)
  return matches.slice(0, options.maxEntries).map((item) => item.path)
}

// ─── Main dispatch ─────────────────────────────────────────────────────────

async function listDirectoryWithRipgrep(resolvedPath: string, options: ResolvedOptions): Promise<string[]> {
  if (options.fuzzy && options.searchPattern && options.searchPattern !== '.') {
    return searchByWalking(resolvedPath, options)
  }

  // List mode (searchPattern === '.') or non-fuzzy search: filename glob path.
  logger.debug('Searching by filename pattern', { pattern: options.searchPattern, path: resolvedPath })
  const filenameResults = await searchByFilename(resolvedPath, options)
  logger.debug('Found matches by filename', { count: filenameResults.length })
  return filenameResults.slice(0, options.maxEntries)
}

/**
 * List contents of a directory, with optional fuzzy / glob search.
 *
 * Returns a flat array of forward-slash-normalized paths. In list mode the
 * default maxEntries is `Number.MAX_SAFE_INTEGER` — no truncation. In search
 * mode the caller decides the cap via `options.maxEntries`.
 */
export async function listDirectory(
  dirPath: AbsoluteFilePath | string,
  options?: DirectoryListOptionsInternal
): Promise<string[]> {
  const mergedOptions: ResolvedOptions = {
    ...DEFAULT_DIRECTORY_LIST_OPTIONS,
    ...options
  }

  const resolvedPath = path.resolve(dirPath)

  const stat = await fs.promises.stat(resolvedPath).catch((error) => {
    logger.error(`Failed to access directory: ${resolvedPath}`, error as Error)
    throw error
  })

  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolvedPath}`)
  }

  const usesWalkingSearch = mergedOptions.fuzzy && mergedOptions.searchPattern && mergedOptions.searchPattern !== '.'
  if (!usesWalkingSearch && !(await resolveRipgrepBinary())) {
    throw new Error('Ripgrep binary not available')
  }

  return listDirectoryWithRipgrep(resolvedPath, mergedOptions)
}

/**
 * Like {@link listDirectory}, but classifies each entry as file vs directory in
 * the same round trip. Lets renderer callers (e.g. the artifact file tree's
 * lazy expansion) avoid a follow-up `isDirectory` IPC per entry — the `stat`s
 * happen here, batched on the main side, instead of N renderer→main calls.
 */
export async function listDirectoryEntries(
  dirPath: AbsoluteFilePath | string,
  options?: DirectoryListOptionsInternal
): Promise<DirectoryEntry[]> {
  const paths = await listDirectory(dirPath, options)
  const entries = await Promise.all(
    paths.map(async (entryPath) => {
      try {
        throwIfAborted(options?.signal)
        const stat = await fs.promises.stat(entryPath)
        throwIfAborted(options?.signal)
        return { path: entryPath as AbsoluteFilePath, isDirectory: stat.isDirectory() }
      } catch {
        throwIfAborted(options?.signal)
        // Entry vanished between listing and stat — drop it (matches the
        // renderer's old per-entry isDirectory failure handling).
        return null
      }
    })
  )
  return entries.filter((entry): entry is DirectoryEntry => entry !== null)
}
