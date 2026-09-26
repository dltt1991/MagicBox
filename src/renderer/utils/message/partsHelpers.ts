/**
 * Utility functions for reading data directly from CherryMessagePart[].
 *
 * These are the parts-native equivalents of find.ts functions (which read from blocks).
 * Components should prefer these when PartsContext is available.
 *
 * Lifecycle: introduced in S6, will become the primary utilities after
 * all components migrate to read parts. find.ts will then be removed.
 */

import type { CherryMessagePart } from '@shared/data/types/message'
import { readCherryMeta, type TranslationPartData } from '@shared/data/types/uiParts'

/**
 * Extract concatenated **text-part** content from parts.
 *
 * NOTE: text-only — NOT equivalent to `find.ts` `getMainTextContent`, which was
 * widened to also fold in fenced code (`data-code`), translations
 * (`data-translation`) and error text (`data-error`). Do not swap one for the
 * other in a migration without accounting for that divergence, or code/error/
 * translation would silently drop from export/copy.
 */
export function getTextFromParts(parts: CherryMessagePart[]): string {
  return parts
    .filter((p): p is Extract<CherryMessagePart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .filter((t) => t.trim().length > 0)
    .join('\n\n')
}

/**
 * Extract concatenated reasoning/thinking content from parts (equivalent to getThinkingContent).
 */
export function getReasoningFromParts(parts: CherryMessagePart[]): string {
  return parts
    .filter((p): p is Extract<CherryMessagePart, { type: 'reasoning' }> => p.type === 'reasoning')
    .map((p) => p.text)
    .filter((t) => t.trim().length > 0)
    .join('\n\n')
}

/**
 * Check if parts contain any text content (equivalent to findMainTextBlocks().length > 0).
 */
export function hasTextParts(parts: CherryMessagePart[]): boolean {
  return parts.some((p) => p.type === 'text' && p.text.trim().length > 0)
}

/**
 * Check if parts contain any translation data parts.
 * DataUIPart for translation has type: 'data-translation'.
 */
export function hasTranslationParts(parts: CherryMessagePart[]): boolean {
  return parts.some((p) => p.type === 'data-translation')
}

type TextMessagePart = Extract<CherryMessagePart, { type: 'text' }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOpaqueReplaySignature(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).some((key) => key.toLowerCase().includes('signature'))
}

function hasUnroundtrippableTextMetadata(part: TextMessagePart, textPartCount: number): boolean {
  const providerMetadata: unknown = part.providerMetadata
  if (providerMetadata === undefined) return false
  if (!isRecord(providerMetadata)) return true
  if (Object.keys(providerMetadata).length === 0) return false
  if (
    Object.entries(providerMetadata).some(
      ([provider, value]) => provider !== 'cherry' && hasOpaqueReplaySignature(value)
    )
  ) {
    return true
  }

  const cherry = providerMetadata.cherry
  if (!isRecord(cherry)) return cherry !== undefined

  for (const [key, value] of Object.entries(cherry)) {
    if (key === 'references') {
      if (!Array.isArray(value) || value.length > 0) return true
      continue
    }
    if (key === 'composer') {
      if (value !== undefined && (textPartCount !== 1 || !readCherryMeta(part)?.composer)) return true
      continue
    }
    return true
  }

  return false
}

/**
 * Assistant edits rebuild text parts as one Composer draft, with an anchor chip holding the place
 * of every `reasoning`/tool part between them, so saving moves text only. The edited text becomes
 * the message's new content and its next-turn context; provider-derived metadata (item ids,
 * citations, composer snapshots, thought signatures) is dropped with the old text, and translation
 * parts are derived and removed.
 *
 * Files are the one part kind with no anchor: Composer rebuilds attachments from its own state and
 * re-emits them as a single run directly after the edited text. So every `file` part must already
 * sit exactly there — a file anywhere else (`file → text`, `text → tool → file`) would be moved by
 * a save, and stays non-editable.
 */
export function canEditAssistantMessageParts(parts: CherryMessagePart[]): boolean {
  let hasText = false
  let hasEditablePart = false
  let hasFile = false
  let editableRunEnded = false
  const textPartCount = parts.reduce((count, part) => count + (part.type === 'text' ? 1 : 0), 0)

  for (const part of parts) {
    if (part.type === 'data-translation') continue
    if (part.type === 'text') {
      if (editableRunEnded || hasFile || hasUnroundtrippableTextMetadata(part, textPartCount)) return false
      hasText ||= part.text.trim().length > 0
      hasEditablePart = true
      continue
    }
    if (part.type === 'file') {
      if (editableRunEnded) return false
      hasEditablePart = true
      hasFile = true
      continue
    }
    if (hasEditablePart) editableRunEnded = true
  }

  return hasText
}

/**
 * Extract translation content from data-translation parts.
 */
export function getTranslationFromParts(parts: CherryMessagePart[]): TranslationPartData[] {
  return parts
    .filter(
      (p): p is { type: 'data-translation'; id?: string; data: TranslationPartData } => p.type === 'data-translation'
    )
    .map((p) => p.data)
}
