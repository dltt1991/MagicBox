import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ONNXRUNTIME_LEAVES, ONNXRUNTIME_NODE_VERSION } from '../localModelCatalog'

describe('local model catalog', () => {
  it('keeps the downloaded onnxruntime-node binary version aligned with package.json', () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }

    expect(ONNXRUNTIME_NODE_VERSION).toBe(packageJson.dependencies['onnxruntime-node'])
    expect(ONNXRUNTIME_LEAVES.darwin.arm64.sharedLibs).toContain(`libonnxruntime.${ONNXRUNTIME_NODE_VERSION}.dylib`)
  })
})
