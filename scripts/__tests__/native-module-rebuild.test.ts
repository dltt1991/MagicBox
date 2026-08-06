import * as fs from 'node:fs'
import * as path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

describe('Electron packaging native-module ABI contract', () => {
  it.each(
    Object.entries(pkg.scripts).filter(
      ([, script]) => typeof script === 'string' && script.includes('electron-builder')
    )
  )('%s rebuilds native modules for Electron before packaging', (_name, script) => {
    expect(script).toMatch(/pnpm rebuild:electron && electron-builder/)
  })
})
