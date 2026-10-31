// Launch intents from the installed app: home-screen shortcuts (manifest
// "shortcuts") and the Web Share Target (manifest "share_target").
//
// Everything here stays on the device. A shared text arrives either as GET
// query parameters or, for a POST, through the service worker
// (public/share-target-sw.js), which stashes it in the Cache API and redirects
// to "?share=text" / "?share=file". The intent is kept in sessionStorage so it
// survives a login in the same tab, and is only acted on once the user is
// signed in. Nothing is ever saved automatically: the user always sees the
// prefilled modal and confirms it.

export type LaunchIntent =
  | { kind: 'add-expense'; amount?: string; note?: string }
  | { kind: 'add-income' }
  | { kind: 'annual' }
  | { kind: 'import-file' }

export interface SharedText {
  title?: string | null
  text?: string | null
  url?: string | null
}

export interface ParsedShare {
  /** Positive amount, or null when the text has none that looks like money. */
  amount: number | null
  description: string
}

const PENDING_KEY = 'finvu_launch_intent'
// An intent left behind by an abandoned login should not pop up hours later.
const PENDING_TTL_MS = 30 * 60 * 1000
export const NOTE_MAX = 200

const SHARE_CACHE = 'finvu-share-target'
const shareUrl = (name: 'file' | 'text') => `${import.meta.env.BASE_URL}__share/${name}`

const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi
const SPACE = '[ \\u00a0\\u202f]'
// A number with optional thousands groups (space, nbsp, dot or comma) and an
// optional 1-2 digit decimal part. Not part of a longer number or a date.
const NUMBER_RE = new RegExp(
  `(?<![\\d.,])(\\d{1,3}(?:(?:${SPACE}|[.,])\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)(?![\\d]|[.,]\\d)`,
  'g',
)
const CURRENCY_AFTER = new RegExp(`^${SPACE}?(?:€|eur\\b|eura\\b|euro\\b|e\\b)`, 'i')
const CURRENCY_BEFORE = new RegExp(`(?:€|\\beur)${SPACE}?$`, 'i')
const SIGN_BEFORE = new RegExp(`[-−–+]${SPACE}?$`)

/** "1 234,56" → 1234.56, "1,234.56" → 1234.56, "12,5" → 12.5, "1.234" → 1234. */
export function normalizeNumber(raw: string): number {
  const s = raw.replace(/[ \u00a0\u202f]/g, '')
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  let intPart = s
  let frac = ''
  if (lastDot !== -1 && lastComma !== -1) {
    const at = Math.max(lastDot, lastComma)
    intPart = s.slice(0, at)
    frac = s.slice(at + 1)
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ','
    const parts = s.split(sep)
    const tail = parts[parts.length - 1]
    if (parts.length === 2 && tail.length <= 2) {
      intPart = parts[0]
      frac = tail
    }
  }
  return Number(`${intPart.replace(/[.,]/g, '')}.${frac || '0'}`)
}

interface Candidate { start: number; end: number; value: number; score: number }

/**
 * Pulls an amount out of shared text and turns the rest into a description.
 * Prefers a number next to a currency (€, EUR), then one with decimals. Bare
 * whole numbers (order numbers, years) are not taken as amounts. Numbers inside
 * links are ignored. The sign is dropped: a share is always an expense.
 */
export function parseSharedText(input: SharedText): ParsedShare {
  const parts: string[] = []
  for (const p of [input.title, input.text, input.url]) {
    const v = (p ?? '').trim()
    if (v && !parts.some(q => q.includes(v))) parts.push(v)
  }
  const joined = parts.join(' ')

  // Search without links so numbers in URLs are never picked, keeping offsets.
  const masked = joined.replace(URL_RE, m => ' '.repeat(m.length))
  const candidates: Candidate[] = []
  for (const m of masked.matchAll(NUMBER_RE)) {
    let start = m.index
    let end = start + m[0].length
    const value = normalizeNumber(m[1])
    if (!Number.isFinite(value) || value <= 0 || value >= 1e9) continue
    const after = masked.slice(end).match(CURRENCY_AFTER)
    const beforeText = masked.slice(0, start)
    const before = beforeText.match(CURRENCY_BEFORE)
    let score = /[.,]\d{1,2}$/.test(m[1]) ? 1 : 0
    if (after) { end += after[0].length; score += 2 }
    if (before) { start -= before[0].length; score += 2 }
    const sign = masked.slice(0, start).match(SIGN_BEFORE)
    if (sign) start -= sign[0].length
    if (score === 0) continue
    candidates.push({ start, end, value, score })
  }
  const best = candidates.reduce<Candidate | null>((acc, c) => (!acc || c.score > acc.score ? c : acc), null)

  const rest = best ? `${joined.slice(0, best.start)} ${joined.slice(best.end)}` : joined
  const description = rest
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,.;:–—-]+|[\s,;:–—-]+$/g, '')
    .slice(0, NOTE_MAX)
    .trim()
  return { amount: best ? Math.round(best.value * 100) / 100 : null, description }
}

/** Amount as the add form types it: comma decimal, no grouping. */
export function amountForInput(amount: number | null): string {
  if (amount === null) return ''
  return (Number.isInteger(amount) ? String(amount) : amount.toFixed(2)).replace('.', ',')
}

function fromShared(shared: SharedText): LaunchIntent {
  const { amount, description } = parseSharedText(shared)
  return { kind: 'add-expense', amount: amountForInput(amount), note: description }
}

/**
 * Reads an intent from the launch URL. Returns null when there is none, or
 * 'stashed-text' when the service worker left the shared text in the cache.
 */
export function intentFromSearch(search: string): LaunchIntent | 'stashed-text' | null {
  const q = new URLSearchParams(search)
  const action = q.get('action')
  if (action === 'add-expense') return { kind: 'add-expense' }
  if (action === 'add-income') return { kind: 'add-income' }
  if (action === 'annual') return { kind: 'annual' }
  const share = q.get('share')
  if (share === 'file') return { kind: 'import-file' }
  if (share === 'text') {
    if (q.has('title') || q.has('text') || q.has('url')) {
      return fromShared({ title: q.get('title'), text: q.get('text'), url: q.get('url') })
    }
    return 'stashed-text'
  }
  return null
}

const INTENT_PARAMS = ['action', 'share', 'title', 'text', 'url']

function savePending(intent: LaunchIntent) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ intent, at: Date.now() })) } catch { /* private mode */ }
}

async function takeStashedText(): Promise<SharedText | null> {
  if (!('caches' in window)) return null
  try {
    const cache = await caches.open(SHARE_CACHE)
    const res = await cache.match(shareUrl('text'))
    if (!res) return null
    await cache.delete(shareUrl('text'))
    return (await res.json()) as SharedText
  } catch { return null }
}

/**
 * Called once at startup, before React renders: remembers the launch intent
 * and strips its parameters from the address bar so a reload does not repeat it.
 */
export async function captureLaunchIntent(loc: Location = window.location): Promise<void> {
  const found = intentFromSearch(loc.search)
  if (!found) return
  const q = new URLSearchParams(loc.search)
  for (const p of INTENT_PARAMS) q.delete(p)
  const qs = q.toString()
  history.replaceState(history.state, '', `${loc.pathname}${qs ? `?${qs}` : ''}${loc.hash}`)
  if (found === 'stashed-text') {
    const shared = await takeStashedText()
    if (shared) savePending(fromShared(shared))
    return
  }
  savePending(found)
}

export function takePendingIntent(): LaunchIntent | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PENDING_KEY)
    const { intent, at } = JSON.parse(raw) as { intent: LaunchIntent; at: number }
    return Date.now() - at <= PENDING_TTL_MS ? intent : null
  } catch { return null }
}

export function hasPendingIntent(): boolean {
  try { return sessionStorage.getItem(PENDING_KEY) !== null } catch { return false }
}

/** The file the service worker stashed from a share, removed from the cache once read. */
export async function takeSharedFile(): Promise<File | null> {
  if (!('caches' in window)) return null
  try {
    const cache = await caches.open(SHARE_CACHE)
    const res = await cache.match(shareUrl('file'))
    if (!res) return null
    await cache.delete(shareUrl('file'))
    const name = decodeURIComponent(res.headers.get('X-File-Name') ?? '') || 'vypis.xml'
    const blob = await res.blob()
    return new File([blob], name, { type: blob.type || 'application/xml' })
  } catch { return null }
}
