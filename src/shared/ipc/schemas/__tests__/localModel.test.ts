import { describe, expect, it } from 'vitest'

import { localModelRequestSchemas } from '../localModel'

describe('local model IPC schemas', () => {
  it('accepts Whisper lifecycle route input', () => {
    for (const route of [
      'local_model.get_status',
      'local_model.download',
      'local_model.cancel',
      'local_model.remove'
    ] as const) {
      expect(localModelRequestSchemas[route].input.safeParse({ model: 'whisper' }).success).toBe(true)
    }
  })
})
