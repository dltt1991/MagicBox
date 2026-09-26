import type { WhisperInferenceContract } from '@main/ai/localModel/runtime/inferenceProcess'
import type { InferenceInitData } from '@main/ai/localModel/runtime/protocol'
import { serveUtilityProcess } from '@main/core/utilityProcess/runtime/serveUtilityProcess'

import { applyInitData, disposeCachedResources } from './inferenceRuntime'
import { whisperHandlers } from './inferenceWhisperHandlers'

serveUtilityProcess<WhisperInferenceContract, InferenceInitData>({
  id: 'inference.whisper',
  initialize: (initData) => applyInitData(initData),
  handlers: whisperHandlers,
  dispose: ({ logger }) => disposeCachedResources(logger)
})
