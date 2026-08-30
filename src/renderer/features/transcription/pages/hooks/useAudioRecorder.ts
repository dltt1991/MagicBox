import { ipcApi } from '@renderer/ipc'
import { useCallback, useEffect, useRef, useState } from 'react'

export type AudioRecorderStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'saving'

type RecorderResult = { recordingId: string; suggestedName: string }

export function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mountedRef = useRef(true)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [status, setStatus] = useState<AudioRecorderStatus>('idle')

  useEffect(
    () => () => {
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
    },
    []
  )

  const start = useCallback(async () => {
    setError(null)
    setStatus('starting')
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      streamRef.current = stream
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.start()
      setStatus('recording')
    } catch {
      stream?.getTracks().forEach((track) => track.stop())
      if (streamRef.current === stream) streamRef.current = null
      mediaRecorderRef.current = null
      if (!mountedRef.current) return
      setError(new Error('transcription.error.microphone_unavailable'))
      setStatus('idle')
    }
  }, [])

  const pause = useCallback(() => {
    mediaRecorderRef.current?.pause()
    setStatus('paused')
  }, [])

  const resume = useCallback(() => {
    mediaRecorderRef.current?.resume()
    setStatus('recording')
  }, [])

  const stop = useCallback(async (): Promise<RecorderResult | null> => {
    try {
      const result = await new Promise<RecorderResult>((resolve, reject) => {
        const recorder = mediaRecorderRef.current
        if (!recorder) return reject(new Error('No active recorder'))
        setStatus('saving')
        recorder.onerror = () => reject(new Error('Recording failed'))
        recorder.onstop = () => {
          void saveWav(new Blob(chunksRef.current)).then(resolve, reject)
        }
        recorder.stop()
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      })
      if (!mountedRef.current) {
        await ipcApi.request('transcription.recording.discard', { recordingId: result.recordingId })
        return null
      }
      return result
    } catch {
      if (!mountedRef.current) return null
      setError(new Error('transcription.error.recording_failed'))
      return null
    } finally {
      if (mountedRef.current) setStatus('idle')
    }
  }, [])

  return { error, pause, resume, start, status, stop }
}

async function saveWav(blob: Blob): Promise<RecorderResult> {
  const audioContext = new AudioContext()
  try {
    const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer())
    const wavBytes = encodePcmWav(audioBuffer)
    const target = await ipcApi.request('transcription.recording.create', { extension: '.wav' })
    await ipcApi.request('transcription.recording.write', { recordingId: target.recordingId, wavBytes })
    return { recordingId: target.recordingId, suggestedName: target.suggestedName }
  } finally {
    await audioContext.close()
  }
}

function encodePcmWav(buffer: AudioBuffer): Uint8Array {
  const channelCount = buffer.numberOfChannels
  const frameBytes = channelCount * 2
  const dataBytes = buffer.length * frameBytes
  const bytes = new Uint8Array(44 + dataBytes)
  const view = new DataView(bytes.buffer)
  writeTag(bytes, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeTag(bytes, 8, 'WAVE')
  writeTag(bytes, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * frameBytes, true)
  view.setUint16(32, frameBytes, true)
  view.setUint16(34, 16, true)
  writeTag(bytes, 36, 'data')
  view.setUint32(40, dataBytes, true)
  for (let frame = 0, offset = 44; frame < buffer.length; frame++) {
    for (let channel = 0; channel < channelCount; channel++, offset += 2) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame] ?? 0))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    }
  }
  return bytes
}

function writeTag(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index++) bytes[offset + index] = value.charCodeAt(index)
}
