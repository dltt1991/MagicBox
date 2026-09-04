import type { TranscriptionSegment } from '@shared/data/types/transcription'

type TimedSegment = { start?: number; end?: number; startSecond?: number; endSecond?: number; text?: string }

export function mapSegments(segments: readonly TimedSegment[] | undefined): TranscriptionSegment[] {
  return (segments ?? []).flatMap((segment) => {
    const text = segment.text?.trim()
    const start = segment.startSecond ?? segment.start
    const end = segment.endSecond ?? segment.end
    if (!text || start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end)) return []
    return [{ startMs: Math.max(0, Math.round(start * 1000)), endMs: Math.max(0, Math.round(end * 1000)), text }]
  })
}
