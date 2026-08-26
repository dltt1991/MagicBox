import { describe, expect, it, vi } from 'vitest'

import { preprocessAudio } from '../audioPreprocess'

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
    const transcode = vi.fn()
    const audio = await preprocessAudio('/audio.wav', undefined, {
      readFile: vi.fn().mockResolvedValue(pcmWav([0, 16_384, -16_384])),
      transcode
    })

    expect(Array.from(audio)).toEqual([0, 0.5, -0.5])
    expect(transcode).not.toHaveBeenCalled()
  })

  it.each(['webm', 'mp3'])('uses the bundled decoder for %s audio and removes its temporary WAV', async (extension) => {
    const transcode = vi.fn().mockResolvedValue(undefined)
    const remove = vi.fn().mockResolvedValue(undefined)
    const outputPath = '/temp/transcription.wav'

    const audio = await preprocessAudio(`/audio.${extension}`, undefined, {
      ffmpegPath: '/bundled/ffmpeg',
      readFile: vi.fn().mockResolvedValue(pcmWav([0, 16_384, -16_384])),
      transcode,
      remove,
      tempPath: () => outputPath
    })

    expect(Array.from(audio)).toEqual([0, 0.5, -0.5])
    expect(transcode).toHaveBeenCalledWith('/bundled/ffmpeg', `/audio.${extension}`, outputPath, undefined)
    expect(remove).toHaveBeenCalledWith(outputPath)
  })

  it('cleans up a canceled compressed-audio conversion', async () => {
    const controller = new AbortController()
    const remove = vi.fn().mockResolvedValue(undefined)
    const transcode = vi.fn().mockImplementation(async (_binary, _input, _output, signal?: AbortSignal) => {
      controller.abort()
      signal?.throwIfAborted()
    })

    await expect(
      preprocessAudio('/audio.webm', controller.signal, {
        ffmpegPath: '/bundled/ffmpeg',
        readFile: vi.fn(),
        transcode,
        remove,
        tempPath: () => '/temp/transcription.wav'
      })
    ).rejects.toThrow()

    expect(remove).toHaveBeenCalledWith('/temp/transcription.wav')
  })
})
