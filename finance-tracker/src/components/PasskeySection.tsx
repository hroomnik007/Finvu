import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { ConfirmDialog } from './ConfirmDialog'
import { GlassCard } from './GlassCard'
import { deletePasskey, getPasskeys, webauthnRegisterOptions, webauthnRegisterVerify } from '../api/auth'
import type { PasskeyInfo } from '../api/auth'

const labelStyle = { fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--aurora-faint)', margin: '0 0 6px' } as const
const textStyle = { fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 } as const

export function PasskeySection() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [secretOpen, setSecretOpen] = useState(false)
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const reauthFactor: 'password' | 'pin' | null = user?.has_password ? 'password' : user?.has_pin ? 'pin' : null

  const load = useCallback(async () => {
    try {
      setPasskeys(await getPasskeys())
    } catch {
      setPasskeys([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) return null

  async function handleAdd() {
    if (reauthFactor && !secretOpen) { setSecretOpen(true); return }
    if (reauthFactor && !secret) return
    setBusy(true)
    setError(null)
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')
      const options = await webauthnRegisterOptions(
        reauthFactor === 'password' ? { currentPassword: secret }
          : reauthFactor === 'pin' ? { currentPin: secret }
          : {},
      )
      const response = await startRegistration({ optionsJSON: options })
      await webauthnRegisterVerify(response)
      setSecret('')
      setSecretOpen(false)
      if (user?.email) localStorage.setItem(`webauthn_enabled_${user.email}`, '1')
      await load()
    } catch (e: unknown) {
      const serverMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(serverMsg ?? (e as Error)?.message ?? t.auth.registerFailed)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    setConfirmId(null)
    try {
      await deletePasskey(id)
      await load()
    } catch (e: unknown) {
      const serverMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(serverMsg ?? (e as Error)?.message ?? t.auth.registerFailed)
    }
  }

  return (
    <>
      <div style={{ borderTop: '1px solid var(--aurora-gline)', margin: '20px 0 16px' }} />
      <h3 style={labelStyle}>{t.settings.passkeysTitle}</h3>
      <p style={{ ...textStyle, marginBottom: 10 }}>{t.settings.passkeysDesc}</p>

      {loading ? null : passkeys.length === 0 ? (
        <p style={textStyle}>{t.settings.passkeysEmpty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {passkeys.map(p => (
            <GlassCard key={p.id} radius={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...textStyle, fontWeight: 500, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}{p.backedUp ? ` · ${t.settings.passkeySynced}` : ''}
                </p>
                <p style={textStyle}>
                  {t.settings.passkeyCreated}: {new Date(p.createdAt).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmId(p.id)}
                style={{ flexShrink: 0, background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.25)', color: 'var(--aurora-rose)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
              >
                {t.settings.passkeyDelete}
              </button>
            </GlassCard>
          ))}
        </div>
      )}

      {secretOpen && reauthFactor && (
        <input
          type="password"
          value={secret}
          onChange={e => setSecret(e.target.value)}
          inputMode={reauthFactor === 'pin' ? 'numeric' : undefined}
          maxLength={reauthFactor === 'pin' ? 4 : undefined}
          placeholder={reauthFactor === 'pin' ? t.onboarding.passkeyPinLabel : t.profile.currentPassword}
          style={{ marginTop: 10, width: '100%', height: 40, borderRadius: 10, padding: '0 12px', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', color: 'var(--aurora-hi)', fontFamily: "'Manrope', sans-serif", fontSize: 13 }}
        />
      )}

      {error && <p style={{ ...textStyle, color: 'var(--aurora-rose)', marginTop: 8 }}>{error}</p>}

      <button
        type="button"
        onClick={handleAdd}
        disabled={busy || (secretOpen && !secret)}
        style={{ marginTop: 10, height: 40, padding: '0 16px', borderRadius: 12, border: '1.5px solid var(--aurora-violet)', background: 'transparent', color: 'var(--aurora-violet)', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: busy || (secretOpen && !secret) ? 0.6 : 1, fontFamily: "'Outfit', sans-serif" }}
      >
        {t.settings.passkeyAdd}
      </button>

      <ConfirmDialog
        open={!!confirmId}
        message={t.settings.passkeyDeleteConfirm}
        onConfirm={() => confirmId && void handleDelete(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </>
  )
}
