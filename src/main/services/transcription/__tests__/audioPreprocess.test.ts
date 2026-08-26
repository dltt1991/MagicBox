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
    const audio = await preprocessAudio('/audio.wav', undefined, {
      readFile: vi.fn().mockResolvedValue(pcmWav([0, 16_384, -16_384]))
    })

    expect(Array.from(audio)).toEqual([0, 0.5, -0.5])
  })

  it('explains when an input needs an audio decoder that is not bundled', async () => {
    await expect(
      preprocessAudio('/audio.mp3', undefined, { readFile: vi.fn().mockResolvedValue(Buffer.from('not a wav')) })
    ).rejects.toThrow('Local Whisper supports uncompressed WAV audio only in this build')
  })
})
