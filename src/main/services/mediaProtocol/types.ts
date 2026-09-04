/** Custom scheme serving in-memory binary media to renderer processes. */
export const CHERRY_MEDIA_SCHEME = 'cherry-media'

/**
 * Media kind — the URL host segment (`cherry-media://<kind>/<id>`).
 * One scheme carries every kind so adding a kind never touches preboot:
 * `protocol.registerSchemesAsPrivileged` may only be called once per process.
 */
export const MediaKind = {
  Image: 'image',
  Audio: 'audio'
} as const

export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind]

export const MEDIA_KINDS = new Set<string>(Object.values(MediaKind))

/** In-memory media entry served by the protocol handler. */
export interface InMemoryMediaEntry {
  data: Buffer
  mimeType: string
}

/** File-backed audio entry served as a stream so long recordings stay off the heap. */
export interface FileMediaEntry {
  filePath: string
  mimeType: string
}

export type MediaEntry = InMemoryMediaEntry | FileMediaEntry
