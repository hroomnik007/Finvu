import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useGoogleLogin } from '@react-oauth/google'
import { useTranslation } from '../i18n'
import { useModalA11y } from '../hooks/useModalA11y'
import { useAuth } from '../context/AuthContext'
import { getPinDeviceStatus, deactivateAccount } from '../api/auth'
import type { DeleteAccountProof } from '../api/auth'

type Method = 'password' | 'pin' | 'google'

const inputStyle = { height: 44, width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, color: 'var(--aurora-hi)', fontSize: 14, padding: '0 14px', outline: 'none', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box' } as const
const labelStyle = { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--aurora-rose)' } as const

/**
 * Account deletion (and deactivation, `mode="deactivate"`) needs a fresh proof of identity, not just the session:
 * the password for password accounts; for passwordless ones the PIN
 * (only on a device bound to it) or signing in to the linked Google account again.
 */
export function DeleteAccountModal({ onClose, mode = 'delete' }: { onClose: () => void; mode?: 'delete' | 'deactivate' }) {
  const { t } = useTranslation()
  const { user, deleteAccount, logout } = useAuth()
  const deactivating = mode === 'deactivate'
  const [methods, setMethods] = useState<Method[] | null>(user?.has_password ? ['password'] : null)
  const [method, setMethod] = useState<Method | null>(user?.has_password ? 'password' : null)
  const [secret, setSecret] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Which proofs this passwordless account can give on this device
  useEffect(() => {
    if (user?.has_password) return
    let cancelled = false
    void (async () => {
      const pinDevice = user?.has_pin ? await getPinDeviceStatus().catch(() => ({ deviceRegistered: false })) : { deviceRegistered: false }
      const available: Method[] = [
        ...(pinDevice.deviceRegistered ? ['pin' as const] : []),
        ...(user?.has_google ? ['google' as const] : []),
      ]
      if (cancelled) return
      setMethods(available)
      setMethod(available[0] ?? null)
    })()
    return () => { cancelled = true }
  }, [user?.has_password, user?.has_pin, user?.has_google])

  const confirmWord = deactivating ? t.settings.deactivateConfirmWord : t.settings.deleteConfirmWord
  const confirmed = confirm.trim().toUpperCase() === confirmWord

  function showError(err: unknown, m: Method) {
    const status = (err as { response?: { status?: number } })?.response?.status
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
    if (status === 502 || status === 501 || status === 404) setError(t.settings.deleteAccountUnavailable)
    else if (status === 429) setError(t.auth.tooManyAttempts)
    else if (code === 'PIN_DEVICE_NOT_BOUND') setError(t.settings.deletePinDevice)
    else if (status === 401 || status === 400) {
      setError(m === 'password' ? t.settings.wrongCurrentPassword
        : m === 'pin' ? t.auth.wrongPin
        : t.settings.deleteGoogleMismatch)
    } else setError(deactivating ? t.settings.deactivateFailed : t.settings.deleteFailed)
  }

  async function submit(proof: DeleteAccountProof, m: Method) {
    try {
      if (deactivating) {
        await deactivateAccount(proof)
        await logout()
      } else {
        await deleteAccount(proof) // logs out on success
      }
    } catch (err) {
      showError(err, m)
      setBusy(false)
    }
  }

  // Implicit flow: every popup sign-in yields a brand-new access token, which
  // is what the server checks for freshness and for the linked Google account.
  const googleReauth = useGoogleLogin({
    onSuccess: tokenResponse => void submit({ googleAccessToken: tokenResponse.access_token }, 'google'),
    onError: () => { setError(t.auth.googleError); setBusy(false) },
    onNonOAuthError: () => setBusy(false), // popup closed / blocked
  })

  async function handleDelete() {
    if (!method || !confirmed) return
    setBusy(true)
    setError(null)
    if (method === 'password') return submit({ currentPassword: secret }, method)
    if (method === 'pin') return submit({ pin: secret }, method)
    googleReauth()
  }

  const needsSecret = method === 'password' || method === 'pin'
  const { panelRef, titleId, dialogProps } = useModalA11y({ open: true, onClose: busy ? undefined : onClose })
  const canDelete = !!method && confirmed && !busy && (!needsSecret || !!secret)
  const methodLabel: Record<Method, string> = {
    password: t.settings.currentPassword,
    pin: t.settings.deleteMethodPin,
    google: t.settings.deleteMethodGoogle,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 fade-in">
      <div ref={panelRef} {...dialogProps} style={{ outline: 'none', background: 'var(--aurora-panel)', border: '1px solid rgba(251,113,133,0.3)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 384 }} className="modal-in">
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} tabIndex={-1} style={{ outline: 'none', fontSize: 15, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0 }}>{deactivating ? t.settings.deactivateAccount : t.settings.deleteAccount}</h2>
          <button onClick={onClose} aria-label={t.common.cancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', padding: 4, display: 'flex' }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--aurora-faint)', marginBottom: 16 }}>{deactivating ? t.settings.deactivateAccountDesc : t.settings.deleteAccountDesc}</p>

        {methods && methods.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <span style={labelStyle}>{t.settings.deleteVerifyWith}</span>
            <div role="radiogroup" style={{ display: 'flex', gap: 6 }}>
              {methods.map(m => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => { setMethod(m); setSecret(''); setError(null) }}
                  style={{ flex: 1, height: 36, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: method === m ? 'rgba(251,113,133,0.15)' : 'transparent', border: `1px solid ${method === m ? 'rgba(251,113,133,0.5)' : 'var(--aurora-gline)'}`, color: method === m ? 'var(--aurora-hi)' : 'var(--aurora-faint)' }}
                >
                  {methodLabel[m]}
                </button>
              ))}
            </div>
          </div>
        )}
        {methods && methods.length === 1 && method !== 'password' && (
          <p style={{ fontSize: 13, color: 'var(--aurora-faint)', marginBottom: 12 }}>{t.settings.deleteVerifyWith}: <strong style={{ color: 'var(--aurora-hi)' }}>{methodLabel[methods[0]]}</strong></p>
        )}
        {methods && methods.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--aurora-rose)', marginBottom: 12 }}>{t.settings.deleteNoMethod}</p>
        )}

        {needsSecret && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <label htmlFor="delete-secret" style={labelStyle}>{method === 'pin' ? t.onboarding.passkeyPinLabel : t.settings.currentPassword}</label>
            <input
              id="delete-secret"
              type="password"
              autoComplete={method === 'pin' ? 'off' : 'current-password'}
              inputMode={method === 'pin' ? 'numeric' : undefined}
              maxLength={method === 'pin' ? 4 : undefined}
              placeholder={method === 'pin' ? t.onboarding.passkeyPinLabel : t.settings.currentPassword}
              value={secret}
              onChange={e => { setSecret(method === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value); setError(null) }}
              style={inputStyle}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          <label htmlFor="delete-confirm" style={labelStyle}>{deactivating ? t.settings.deactivateAccountConfirmLabel : t.settings.deleteAccountConfirmLabel}</label>
          <input
            id="delete-confirm"
            type="text"
            placeholder={confirmWord}
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setError(null) }}
            style={inputStyle}
          />
        </div>
        {error && <p role="alert" style={{ fontSize: 12, color: 'var(--aurora-rose)', marginBottom: 8 }}>{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-[color:var(--aurora-faint)] hover:bg-white/10 transition-colors cursor-pointer">
            {t.common.cancel}
          </button>
          <button
            disabled={!canDelete}
            onClick={() => void handleDelete()}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: canDelete ? '#DC2626' : undefined }}
          >
            {busy ? (deactivating ? t.settings.deactivating : t.settings.dangerDeleting) : (deactivating ? t.settings.deactivateAccountConfirmBtn : t.settings.deleteAccountConfirmBtn)}
          </button>
        </div>
      </div>
    </div>
  )
}
