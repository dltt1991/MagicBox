import { execFile, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it, vi } from 'vitest'

import { preprocessAudio } from '../audioPreprocess'

const execFileAsync = promisify(execFile)
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

function pcmWav(samples: number[]): Buffer {
  const dataSize = samples.length * 2
  const wav = Buffer.alloc(44 + dataSize)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(16_000, 24)
  wav.writeUInt32LE(32_000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)
  samples.forEach((sample, index) => wav.writeInt16LE(sample, 44 + index * 2))
  return wav
}

describe('preprocessAudio', () => {
  it('decodes 16 kHz PCM WAV audio in-process without an external decoder', async () => {
    const readFile = vi.fn().mockResolvedValue(pcmWav([0, 16_384, -16_384]))
    const audio = await preprocessAudio('/audio.wav', undefined, {
      readFile
    })

    expect(Array.from(audio)).toEqual([0, 0.5, -0.5])
    expect(readFile).toHaveBeenCalledWith('/audio.wav')
  })

  it.each(['mp3', 'm4a', 'aac', 'ogg', 'flac', 'webm'])(
    'decodes %s audio through the compressed audio decoder',
    async (extension) => {
      const readFile = vi.fn()
      const decodeCompressedAudio = vi.fn().mockResolvedValue(new Float32Array([0.25, -0.25]))

      const audio = await preprocessAudio(`/audio.${extension}`, undefined, {
        decodeCompressedAudio,
        readFile
      })

      expect(Array.from(audio)).toEqual([0.25, -0.25])
      expect(readFile).not.toHaveBeenCalled()
      expect(decodeCompressedAudio).toHaveBeenCalledWith(`/audio.${extension}`, undefined)
    }
  )

  it('rejects unsupported audio extensions before reading the file', async () => {
    const readFile = vi.fn()

    await expect(preprocessAudio('/audio.txt', undefined, { readFile })).rejects.toThrow(
      'Unsupported audio format. Use WAV, MP3, M4A, AAC, OGG, FLAC, or WEBM audio.'
    )

    expect(readFile).not.toHaveBeenCalled()
  })

  it.skipIf(!hasFfmpeg)('decodes real MP3 audio to Whisper samples with ffmpeg', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'magicbox-audio-'))
    const audioPath = path.join(dir, 'tone.mp3')

    try {
      await execFileAsync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.2',
        '-ar',
        '44100',
        '-ac',
        '1',
        audioPath
      ])

      const audio = await preprocessAudio(audioPath)

      expect(audio).toBeInstanceOf(Float32Array)
      expect(audio.length).toBeGreaterThan(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
