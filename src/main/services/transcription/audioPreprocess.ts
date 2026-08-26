import { spawn } from 'node:child_process'

const SAMPLE_RATE = 16_000

/** Decode audio to Whisper's 16 kHz mono float samples without exposing it to a renderer. */
export async function preprocessAudio(audioPath: string, signal?: AbortSignal): Promise<Float32Array> {
  signal?.throwIfAborted()
  return await new Promise<Float32Array>((resolve, reject) => {
    const process = spawn('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-i',
      audioPath,
      '-f',
      'f32le',
      '-ar',
      `${SAMPLE_RATE}`,
      '-ac',
      '1',
      'pipe:1'
    ])
    const chunks: Buffer[] = []
    const abort = () => process.kill('SIGTERM')
    signal?.addEventListener('abort', abort, { once: true })
    process.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.once('error', () => reject(new Error('Audio preprocessing is unavailable')))
    process.once('close', (code) => {
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) return reject(signal.reason)
      if (code !== 0) return reject(new Error('Audio preprocessing failed'))
      const audio = Buffer.concat(chunks)
      resolve(new Float32Array(audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength)))
    })
  })
}

export const LOCAL_WHISPER_SAMPLE_RATE = SAMPLE_RATE
