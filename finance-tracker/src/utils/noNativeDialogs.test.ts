import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Errors and confirmations go through the app's toasts (showErrorToast) and
// ConfirmDialog: a native alert()/confirm() is unstyled, untranslated chrome
// and blocks the whole page.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

describe('no native dialogs', () => {
  it('the app never calls alert(), confirm() or prompt()', () => {
    const root = join(__dirname, '..')
    const hits = files(root).flatMap(f =>
      readFileSync(f, 'utf8').split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /(^|[^\w.])(window\.)?(alert|confirm|prompt)\(/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
        .map(({ line, i }) => `${f.slice(root.length + 1)}:${i + 1} ${line.trim()}`))
    expect(hits).toEqual([])
  })
})
