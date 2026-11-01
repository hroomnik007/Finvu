import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sk } from '../i18n/sk'
import { cs } from '../i18n/cs'
import { en } from '../i18n/en'
import { pl } from '../i18n/pl'
import { hu } from '../i18n/hu'

// Static checks for item 15: every icon-only <button> needs an accessible
// name, and the small controls keep their 44x44 hit area.
const root = resolve(__dirname, '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return tsxFiles(p)
    return e.name.endsWith('.tsx') && !e.name.includes('.test') ? [p] : []
  })
}

// End of a JSX opening tag, skipping `>` inside {expressions}.
function openTagEnd(s: string, from: number): number {
  let depth = 0
  for (let i = from; i < s.length; i++) {
    const c = s[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return i
  }
  return -1
}

function iconOnlyButtonsWithoutName(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/<button\b/g)) {
    const end = openTagEnd(source, m.index! + 7)
    const tag = source.slice(m.index!, end + 1)
    if (tag.endsWith('/>')) continue
    const body = source.slice(end + 1, source.indexOf('</button>', end))
    if (/aria-label(ledby)?=/.test(tag)) continue
    const text = body
      .replace(/<svg[\s\S]*?<\/svg>/g, '')
      .replace(/<[A-Z]\w*[^>]*\/>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, '')
    if (!text || /^\{?['"]?[×✕✖+\-−←→‹›]['"]?\}?$/.test(text)) out.push(tag.slice(0, 80))
  }
  return out
}

describe('icon-only buttons', () => {
  it('detector flags unnamed icon buttons and accepts named ones', () => {
    expect(iconOnlyButtonsWithoutName('<button onClick={x}><X size={16} /></button>')).toHaveLength(1)
    expect(iconOnlyButtonsWithoutName('<button>✕</button>')).toHaveLength(1)
    expect(iconOnlyButtonsWithoutName('<button aria-label={t.common.close}><X size={16} /></button>')).toHaveLength(0)
    expect(iconOnlyButtonsWithoutName('<button onClick={() => a > b}><X />{t.common.save}</button>')).toHaveLength(0)
  })

  it('every icon-only button in the app has an aria-label', () => {
    const offenders = tsxFiles(root).flatMap(f => iconOnlyButtonsWithoutName(readFileSync(f, 'utf8')).map(t => `${relative(root, f)}: ${t}`))
    expect(offenders).toEqual([])
  })
})

describe('tap targets', () => {
  it('the hit-area helper expands to at least 44x44', () => {
    const css = read('index.css')
    expect(css).toMatch(/\.hit-44::before[\s\S]*?width: max\(100%, 44px\);\s*height: max\(100%, 44px\);/)
  })

  it('month arrows and the Moje/Rodinné toggle use it and expose state', () => {
    const s = read('components/Topbar.tsx')
    expect(s).toContain('aria-label={t.common.prevMonth}')
    expect(s).toContain('aria-label={t.common.nextMonth}')
    expect(s).toContain('aria-pressed={dashView === v}')
    expect(s).toContain('role="group" aria-label={t.common.viewScope}')
    expect(s.match(/className="hit-44"/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('settings toggles are switches named by their row', () => {
    const s = read('pages/Settings.tsx')
    expect(s).toContain('role="switch"')
    expect(s).toContain('aria-checked={checked}')
    expect(s).toContain('aria-labelledby={row?.labelId}')
  })
})

describe('new labels exist in every language', () => {
  const keys = ['prevMonth', 'nextMonth', 'dayDecrease', 'dayIncrease', 'iconOption', 'viewScope', 'addNew'] as const
  it.each([['sk', sk], ['cs', cs], ['en', en], ['pl', pl], ['hu', hu]] as const)('%s', (_, lang) => {
    for (const k of keys) expect(lang.common[k], k).toBeTruthy()
    expect(lang.common.iconOption).toContain('{n}')
  })
})
