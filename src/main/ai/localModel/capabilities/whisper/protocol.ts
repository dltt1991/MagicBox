export interface WhisperChunk {
  timestamp: [number, number]
  text: string
}

export interface WhisperTranscribePayload {
  modelDir: string
  dtype: string
  audio: Float32Array
  language?: string
}

export interface WhisperTranscribeResult {
  text: string
  chunks: WhisperChunk[]
  runtime: 'accelerated' | 'cpu'
}
