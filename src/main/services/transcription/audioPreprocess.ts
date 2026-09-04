import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

import { getBinaryPath } from '@main/utils/binaryResolver'

const require = createRequire(import.meta.url)
const SAMPLE_RATE = 16_000
const SUPPORTED_COMPRESSED_AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.flac', '.webm'])
const UNSUPPORTED_AUDIO_ERROR = 'Unsupported audio format. Use WAV, MP3, M4A, AAC, OGG, FLAC, or WEBM audio.'

export interface AudioPreprocessDependencies {
  decodeCompressedAudio?: typeof decodeCompressedAudio
  readFile?: typeof readFile
}

/** Decode WAV audio to Whisper's 16 kHz mono float samples without exposing it to a renderer. */
export async function preprocessAudio(
  audioPath: string,
  signal?: AbortSignal,
  dependencies: AudioPreprocessDependencies = {}
): Promise<Float32Array> {
  signal?.throwIfAborted()
  const extension = path.extname(audioPath).toLowerCase()
  if (SUPPORTED_COMPRESSED_AUDIO_EXTENSIONS.has(extension)) {
    return (dependencies.decodeCompressedAudio ?? decodeCompressedAudio)(audioPath, signal)
  }
  if (extension !== '.wav') throw new Error(UNSUPPORTED_AUDIO_ERROR)
  const encoded = await (dependencies.readFile ?? readFile)(audioPath)
  signal?.throwIfAborted()
  return decodeWav(encoded)
}

async function decodeCompressedAudio(audioPath: string, signal?: AbortSignal): Promise<Float32Array> {
  const encoded = await runFfmpeg(audioPath, signal)
  if (encoded.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) throw new Error(UNSUPPORTED_AUDIO_ERROR)
  return new Float32Array(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength))
}

async function runFfmpeg(audioPath: string, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted()
  const ffmpegPath = resolveBundledFfmpegPath() ?? (await getBinaryPath('ffmpeg'))
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let stderr = ''
    const child = spawn(ffmpegPath, [
      '-v',
      'error',
      '-nostdin',
      '-i',
      audioPath,
      '-ac',
      '1',
      '-ar',
      String(SAMPLE_RATE),
      '-f',
      'f32le',
      'pipe:1'
    ])
    const abort = () => {
      child.kill('SIGKILL')
      reject(new DOMException('Audio preprocessing aborted', 'AbortError'))
    }

    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-8_192)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort)
      if (code === 0) {
        resolve(Buffer.concat(chunks))
      } else {
        reject(new Error(stderr.trim() || UNSUPPORTED_AUDIO_ERROR))
      }
    })
  })
}

function resolveBundledFfmpegPath(): string | null {
  try {
    const installer = require('@ffmpeg-installer/ffmpeg') as { path?: string }
    return installer.path ?? null
  } catch {
    return null
  }
}

function decodeWav(encoded: Uint8Array): Float32Array {
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength)
  if (encoded.byteLength < 12 || readTag(encoded, 0) !== 'RIFF' || readTag(encoded, 8) !== 'WAVE') {
    throw new Error(UNSUPPORTED_AUDIO_ERROR)
  }

  let format: { type: number; channels: number; sampleRate: number; bitsPerSample: number } | undefined
  let dataOffset: number | undefined
  let dataSize: number | undefined
  let offset = 12
  while (offset + 8 <= encoded.byteLength) {
    const size = view.getUint32(offset + 4, true)
    const chunkOffset = offset + 8
    const nextOffset = chunkOffset + size
    if (nextOffset > encoded.byteLength) throw new Error(UNSUPPORTED_AUDIO_ERROR)
    if (readTag(encoded, offset) === 'fmt ' && size >= 16) {
      format = {
        type: view.getUint16(chunkOffset, true),
        channels: view.getUint16(chunkOffset + 2, true),
        sampleRate: view.getUint32(chunkOffset + 4, true),
        bitsPerSample: view.getUint16(chunkOffset + 14, true)
      }
    } else if (readTag(encoded, offset) === 'data') {
      dataOffset = chunkOffset
      dataSize = size
    }
    offset = nextOffset + (size % 2)
  }

  if (!format || dataOffset === undefined || dataSize === undefined) throw new Error(UNSUPPORTED_AUDIO_ERROR)
  const bytesPerSample = format.bitsPerSample / 8
  const frameSize = format.channels * bytesPerSample
  if (
    !Number.isInteger(bytesPerSample) ||
    !format.channels ||
    !format.sampleRate ||
    !frameSize ||
    dataSize % frameSize !== 0
  ) {
    throw new Error(UNSUPPORTED_AUDIO_ERROR)
  }

  const frames = dataSize / frameSize
  const mono = new Float32Array(frames)
  for (let frame = 0; frame < frames; frame++) {
    let value = 0
    for (let channel = 0; channel < format.channels; channel++) {
      value += readSample(view, dataOffset + frame * frameSize + channel * bytesPerSample, format)
    }
    mono[frame] = value / format.channels
  }
  return resample(mono, format.sampleRate)
}

function readTag(data: Uint8Array, offset: number): string {
  return String.fromCharCode(...data.subarray(offset, offset + 4))
}

function readSample(view: DataView, offset: number, format: { type: number; bitsPerSample: number }): number {
  if (format.type === 3 && format.bitsPerSample === 32) return view.getFloat32(offset, true)
  if (format.type !== 1) throw new Error(UNSUPPORTED_AUDIO_ERROR)
  switch (format.bitsPerSample) {
    case 8:
      return (view.getUint8(offset) - 128) / 128
    case 16:
      return view.getInt16(offset, true) / 32_768
    case 24: {
      const value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getInt8(offset + 2) << 16)
      return value / 8_388_608
    }
    case 32:
      return view.getInt32(offset, true) / 2_147_483_648
    default:
      throw new Error(UNSUPPORTED_AUDIO_ERROR)
  }
}

function resample(samples: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === SAMPLE_RATE) return samples
  const output = new Float32Array(Math.round((samples.length * SAMPLE_RATE) / sourceRate))
  for (let index = 0; index < output.length; index++) {
    const position = (index * sourceRate) / SAMPLE_RATE
    const before = Math.floor(position)
    const after = Math.min(before + 1, samples.length - 1)
    output[index] = samples[before] + (samples[after] - samples[before]) * (position - before)
  }
  return output
}

export const LOCAL_WHISPER_SAMPLE_RATE = SAMPLE_RATE
