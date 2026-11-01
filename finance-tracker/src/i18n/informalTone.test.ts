import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sk } from './sk'
import { cs } from './cs'
import { hu } from './hu'

// Finvu speaks to the user informally ("ty") in Slovak and Czech. These checks
// catch formal "vy" forms (2nd person plural verbs and Váš/Vaše/Vám) creeping
// back into the translations.

function strings(obj: unknown, path = ''): Array<[string, string]> {
  if (typeof obj === 'string') return [[path, obj]]
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

// Formal pronouns / possessives and the auxiliary verbs.
const PRONOUNS = /(^|[^\p{L}])([Vv]á[šm]|[Vv]aš\p{L}*|[Vv]ás|[Vv]ámi|ste|jste|Ste|Jste)(?=[^\p{L}]|$)/u
// 2nd person plural verb endings (imperative and present), e.g. Skúste, Zadajte,
// Přidejte, Můžete, máte. Words that merely end in -te and are not verbs are listed.
const VERB = /(^|[^\p{L}])(\p{L}+(?:ajte|ejte|ujte|ijte|ite|ete|íte|áte|ťte|ďte|ňte|ste|šte|žte|čte|vte|lte|rte|ěte|ote))(?=[^\p{L}]|$)/u
const NOT_VERBS = new Set(['mieste', 'ešte', 'limite', 'okamžite', 'importe', 'roste', 'místě', 'účte', 'Ešte', 'formáte'])

function formalHits(locale: unknown) {
  const hits: string[] = []
  for (const [key, value] of strings(locale)) {
    const p = value.match(PRONOUNS)
    if (p) hits.push(`${key}: "${p[2]}" in ${JSON.stringify(value)}`)
    const re = new RegExp(VERB.source, 'gu')
    for (const m of value.matchAll(re)) {
      if (!NOT_VERBS.has(m[2])) hits.push(`${key}: "${m[2]}" in ${JSON.stringify(value)}`)
    }
  }
  return hits
}

describe('informal tone (ty) in sk/cs', () => {
  it('Slovak translations use no formal forms', () => {
    expect(formalHits(sk)).toEqual([])
  })
  it('Czech translations use no formal forms', () => {
    expect(formalHits(cs)).toEqual([])
  })
  it('the detector actually catches formal forms', () => {
    expect(formalHits({ a: 'Skúste znova.', b: 'Vaše meno', c: 'Přidejte příjem', d: 'Nie ste členom' })).toHaveLength(4)
    expect(formalHits({ a: 'Skús znova.', b: 'Tvoje meno', c: 'Ešte na jednom mieste' })).toEqual([])
  })
  it('the register name placeholder is informal', () => {
    expect(sk.auth.namePlaceholder).toBe('Tvoje meno')
    expect(cs.auth.namePlaceholder).toBe('Tvoje jméno')
  })
  it('hardcoded Slovak UI and backend messages are informal', () => {
    const root = join(__dirname, '..', '..', '..')
    const files = [
      'finance-tracker/src/pages/AdminLogin.tsx',
      'backend/src/routes/auth.ts',
      'backend/src/routes/households.ts',
      'backend/src/lib/loginLockout.ts',
      'backend/src/lib/email.ts',
      'backend/src/controllers/auth.controller.ts',
      'backend/src/controllers/households.controller.ts',
      'backend/src/controllers/webauthn.controller.ts',
    ]
    const bad = /\b(Skúste|Zadajte|Kliknite|Vitajte|Overte|overte|kontaktujte|ignorujte|Môžete|môžete|nemôžete|Nemáte|máte|Prihláste|potvrďte|opustite|nastavte|Použite)\b|[Vv]áš\b|vášho|\b(Nie ste|Ste už|Ak ste)\b/u
    const hits = files.flatMap((f) => {
      let src = ''
      try { src = readFileSync(join(root, f), 'utf8') } catch { return [] }
      return src.split('\n').filter((l) => bad.test(l)).map((l) => `${f}: ${l.trim()}`)
    })
    expect(hits).toEqual([])
  })
})

// Hungarian uses tegezés too. Catch the formal (magázó) imperatives, Ön/Önnek,
// "Kérjük," openers and the 3rd-person polite verb forms used for "you".
const HU_FORMAL = /(^|[^\p{L}])(Ön|Önnek|Önt|Öné|Kérjük|[Kk]attintson|[Aa]dja|[Aa]djon|[Vv]álasszon|[Vv]álassza|[Pp]róbálja|[Ee]llenőrizze|[Tt]öltse|[Áá]llítsa|[Áá]llítson|[Hh]ozzon|[Hh]ozza|[Íí]rja|[Hh]úzza|[Jj]elentkezzen|[Rr]egisztráljon|[Kk]ezdjen|[Tt]örli|[Tt]örölje|[Ee]ltávolítja|[Ff]elülírja|[Ff]olytatja|[Ss]zeretne|[Jj]elölje|[Oo]ssza|[Ee]rősítse|[Ff]iókja|[Aa]datai|bejelentkezhet|[Ee]mlékezzen|[Mm]utassa|[Hh]agyja)(?=[^\p{L}]|$)/u
// Third-person "adja meg"/"törli" are fine where the subject is someone else.
const HU_ALLOWED = new Set(['household.inviteCodeDesc', 'backup.modeMergeSub', 'expenses.categories.autoLimitDesc',
  'settings.dangerResetDesc', 'settings.deleteAccountSub', 'backup.modeReplaceSub'])

function huFormalHits(locale: unknown) {
  return strings(locale)
    .filter(([key]) => !HU_ALLOWED.has(key))
    .flatMap(([key, value]) => {
      const m = value.match(HU_FORMAL)
      return m ? [`${key}: "${m[2]}" in ${JSON.stringify(value)}`] : []
    })
}

describe('informal tone (tegezés) in hu', () => {
  it('Hungarian translations use no formal forms', () => {
    expect(huFormalHits(hu)).toEqual([])
  })
  it('the detector catches formal Hungarian', () => {
    expect(huFormalHits({ a: 'Kérjük, próbálja újra.', b: 'vagy kattintson ide', c: 'Az Ön neve', d: 'Biztosan törli?' })).toHaveLength(4)
    expect(huFormalHits({ a: 'Próbáld újra.', b: 'vagy kattints ide', c: 'A neved', d: 'Biztosan törlöd?' })).toEqual([])
  })
  it('the register name placeholder is informal', () => {
    expect(hu.auth.namePlaceholder).toBe('A neved')
  })
})
