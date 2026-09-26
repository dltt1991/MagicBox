import type { WhisperInferenceContract } from '@main/ai/localModel/runtime/inferenceProcess'
import type { UtilityProcessHandlers } from '@main/core/utilityProcess/runtime/serveUtilityProcess'

import { cacheResource, currentRuntimeProfile, getTransformers, withHardwareFallback } from './inferenceRuntime'

const WHISPER_CHUNK_LENGTH_SECONDS = 30
const WHISPER_STRIDE_LENGTH_SECONDS = 5

function getSpeechPipeline(modelDir: string, dtype: string, logger: { info: (message: string) => void }) {
  return cacheResource(`${modelDir}|${dtype}`, async () => {
    const { pipeline } = getTransformers()
    const profile = currentRuntimeProfile()
    const transcriber = await pipeline('automatic-speech-recognition', modelDir, {
      dtype,
      device: profile.transformersDevice,
      session_options: profile.sessionOptions
    })
    if (profile.id !== 'cpu') logger.info(`hardware provider active provider=${profile.id} runtime=whisper`)
    return transcriber
  })
}

export const whisperHandlers: UtilityProcessHandlers<WhisperInferenceContract> = {
  transcribe: ({ modelDir, dtype, audio, language }, { logger }) =>
    withHardwareFallback(
      async () => {
        const transcriber = await getSpeechPipeline(modelDir, dtype, logger)
        const output = await transcriber(audio, {
          chunk_length_s: WHISPER_CHUNK_LENGTH_SECONDS,
          stride_length_s: WHISPER_STRIDE_LENGTH_SECONDS,
          return_timestamps: true,
          task: 'transcribe',
          language: language || 'zh'
        })
        return {
          text: output.text ?? '',
          chunks: output.chunks ?? [],
          runtime: currentRuntimeProfile().id === 'cpu' ? 'cpu' : 'accelerated'
        }
      },
      { logger, describeRequest: () => `request=whisper.transcribe modelDir=${JSON.stringify(modelDir)}` }
    )
}
