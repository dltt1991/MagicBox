import type { RefObject } from 'react'
import { useCallback } from 'react'

export function useSegmentSeek(audioRef: RefObject<HTMLAudioElement | null>) {
  return useCallback(
    (startMs: number) => {
      if (audioRef.current) audioRef.current.currentTime = startMs / 1000
    },
    [audioRef]
  )
}
