import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Static checks: these attributes decide whether password managers and iOS
// autofill work, and they regress silently, so pin them down.
const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

describe('auth form autofill attributes', () => {
  it('login keeps the passkey-aware username field and a current-password field', () => {
    const s = src('pages/Login.tsx')
    expect(s).toContain('autoComplete="username webauthn"')
    expect(s).toContain('autoComplete="current-password"')
    expect(s).toContain('htmlFor="login-email"')
    expect(s).toContain('id="login-email"')
    expect(s).toContain('htmlFor="login-password"')
    expect(s).toContain('id="login-password"')
  })

  it('registration uses name, email and two new-password fields with labels', () => {
    const s = src('pages/Register.tsx')
    expect(s).toContain('autoComplete="name"')
    expect(s).toContain('autoComplete="email"')
    expect(s.match(/autoComplete="new-password"/g)?.length).toBe(2)
    for (const id of ['register-name', 'register-email', 'register-password', 'register-confirm']) {
      expect(s).toContain(`htmlFor="${id}"`)
      expect(s).toContain(`id="${id}"`)
    }
    expect(s).not.toContain('>MENO<')
  })

  it('reset password uses new-password', () => {
    expect(src('pages/ResetPassword.tsx').match(/autoComplete="new-password"/g)?.length).toBe(2)
  })

  it('PIN re-auth fields never offer saved passwords', () => {
    for (const f of ['components/OnboardingTutorial.tsx', 'components/PasskeySection.tsx', 'components/DeleteAccountModal.tsx']) {
      expect(src(f)).toMatch(/autoComplete=\{[a-zA-Z]+ === 'pin' \? 'off' : 'current-password'\}/)
    }
  })

  it('forces 16px text fields on phones so iOS does not zoom', () => {
    const css = src('index.css')
    expect(css).toMatch(/@media \(max-width: 767px\) \{\s*input:not\(\[type=checkbox\]\)[^{]*\{\s*font-size: 16px !important;/)
  })

  it('big amount fields opt out of the 16px rule instead of shrinking', () => {
    expect(src('components/AmountInput.tsx')).toMatch(/data-keep-font=\{keepFont \|\| undefined\}/)
    expect(src('index.css')).toContain(':not([data-keep-font])')
  })
})
