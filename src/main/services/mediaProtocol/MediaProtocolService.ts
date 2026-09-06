import { randomUUID } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import { Readable } from 'node:stream'

import { loggerService } from '@logger'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { protocol } from 'electron'

import {
  CHERRY_MEDIA_SCHEME,
  type FileMediaEntry,
  MEDIA_KINDS,
  type MediaEntry,
  MediaKind,
  type MediaKind as MediaKindValue
} from './types'

const logger = loggerService.withContext('MediaProtocolService')

/**
 * Serves in-memory binary media to renderer processes over `cherry-media://`.
 *
 * Callers pair every `store()` with a `remove()` — nothing reclaims entries
 * automatically, by design. A single full-screen capture is tens of MB, so one
 * missed `remove()` pins real memory; the guard against that is a test asserting
 * the store is empty once a session ends, not a timer guessing how long a
 * session should have lasted.
 *
 * NOT to be merged into `services/protocol/ProtocolService` — that one registers
 * the app as an OS handler for `cherrystudio://` deep links (external → app),
 * whereas this one answers in-process renderer requests for our own bytes. The
 * scheme registration also has to happen before `app.whenReady()`, which that
 * service's phase cannot express.
 */
@Injectable('MediaProtocolService')
@ServicePhase(Phase.WhenReady)
export class MediaProtocolService extends BaseService {
  private stores = new Map<MediaKindValue, Map<string, MediaEntry>>()

  protected async onInit(): Promise<void> {
    // `protocol.handle` requires an app-ready process, hence Phase.WhenReady.
    protocol.handle(CHERRY_MEDIA_SCHEME, (request) => this.handleRequest(request))
    this.registerDisposable(() => protocol.unhandle(CHERRY_MEDIA_SCHEME))
    this.registerDisposable(() => this.stores.clear())
    logger.info('Media protocol handler registered', { scheme: CHERRY_MEDIA_SCHEME })
  }

  /**
   * Store a buffer and return its id. The caller owns the entry's lifetime and
   * must pair this with `remove()` — nothing reclaims it automatically.
   */
  store(kind: MediaKindValue, data: Buffer, mimeType: string): string {
    const id = randomUUID()
    let kindStore = this.stores.get(kind)
    if (!kindStore) {
      kindStore = new Map()
      this.stores.set(kind, kindStore)
    }
    kindStore.set(id, { data, mimeType })
    return id
  }

  /** Register an owned audio file for streamed playback without loading it into memory. */
  storeFile(kind: typeof MediaKind.Audio, id: string, filePath: string, mimeType: string): string {
    let kindStore = this.stores.get(kind)
    if (!kindStore) {
      kindStore = new Map()
      this.stores.set(kind, kindStore)
    }
    kindStore.set(id, { filePath, mimeType })
    return id
  }

  /** Remove an entry. Returns whether it existed. */
  remove(kind: MediaKindValue, id: string): boolean {
    return this.stores.get(kind)?.delete(id) ?? false
  }

  /** Build the URL a renderer loads to read a stored entry. */
  getUrl(kind: MediaKindValue, id: string): string {
    return `${CHERRY_MEDIA_SCHEME}://${kind}/${id}`
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const kind = url.hostname

    if (!MEDIA_KINDS.has(kind)) {
      return new Response('Unknown media kind', { status: 400 })
    }

    // pathname is "/{id}" — strip the leading slash
    const id = url.pathname.slice(1)
    if (!id) {
      return new Response('Missing media id', { status: 400 })
    }

    const entry = this.stores.get(kind as MediaKindValue)?.get(id)
    if (!entry) {
      return new Response('Not found', { status: 404 })
    }

    return 'data' in entry ? this.handleMemoryEntry(entry) : this.handleFileEntry(entry, request)
  }

  private handleMemoryEntry(entry: Extract<MediaEntry, { data: Buffer }>): Response {
    return new Response(new Uint8Array(entry.data), { headers: { 'Content-Type': entry.mimeType } })
  }

  private async handleFileEntry(entry: FileMediaEntry, request: Request): Promise<Response> {
    let size: number
    try {
      const stat = await fs.stat(entry.filePath)
      if (!stat.isFile()) return new Response('Not found', { status: 404 })
      size = stat.size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const range = parseRange(request.headers.get('Range'), size)
    if (range === 'invalid') {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` }
      })
    }

    const start = range?.start ?? 0
    const end = range?.end ?? Math.max(size - 1, 0)
    const length = range ? end - start + 1 : size
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Content-Length': String(length),
      'Content-Type': entry.mimeType
    })
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`)

    if (size === 0) return new Response(null, { headers })
    const stream = Readable.toWeb(createReadStream(entry.filePath, range ? { start, end } : undefined))
    return new Response(stream as ReadableStream, { status: range ? 206 : 200, headers })
  }
}

type ByteRange = { start: number; end: number }

function parseRange(header: string | null, size: number): ByteRange | 'invalid' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return 'invalid'

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || size === 0) return 'invalid'
    return { start: Math.max(size - suffixLength, 0), end: size - 1 }
  }

  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) {
    return 'invalid'
  }
  return { start, end: Math.min(requestedEnd, size - 1) }
}
