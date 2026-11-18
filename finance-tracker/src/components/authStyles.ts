import type { CSSProperties } from 'react'

// Shared look of the pre-login forms (Login, Register, ForgotPassword, ResetPassword).
// Colours come from --aurora-* tokens only, so light mode follows automatically.

export const authLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--aurora-lo)',
  fontFamily: "'Manrope', sans-serif",
}

export function authInputStyle(focused: boolean, withIcon = false): CSSProperties {
  return {
    width: '100%',
    background: 'var(--aurora-glass)',
    color: 'var(--aurora-hi)',
    borderRadius: 16,
    padding: withIcon ? '14px 44px 14px 16px' : '14px 16px',
    fontSize: 14,
    fontFamily: "'Manrope', sans-serif",
    border: `1px solid ${focused ? 'var(--aurora-violet)' : 'var(--aurora-gline)'}`,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxShadow: focused ? '0 0 0 3px rgba(139,92,246,0.15)' : 'none',
    boxSizing: 'border-box',
  }
}

export function authButtonStyle(state: 'idle' | 'busy' | 'disabled' = 'idle'): CSSProperties {
  return {
    height: 48, width: '100%', marginTop: 8,
    background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))',
    color: 'white', border: 'none', borderRadius: 16,
    fontSize: 14, fontWeight: 700,
    cursor: state === 'busy' ? 'wait' : state === 'disabled' ? 'not-allowed' : 'pointer',
    boxShadow: state === 'idle' ? '0 4px 20px rgba(139,92,246,0.4)' : 'none',
    opacity: state === 'busy' ? 0.7 : state === 'disabled' ? 0.55 : 1,
    transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: "'Outfit', sans-serif",
  }
}

export const authErrorStyle: CSSProperties = {
  borderRadius: 14, padding: '10px 14px', fontSize: 13,
  background: 'rgba(251,113,133,0.12)', color: 'var(--aurora-rose)',
  border: '1px solid rgba(251,113,133,0.3)', marginBottom: 14,
  fontFamily: "'Manrope', sans-serif",
}

export const authLinkButtonStyle: CSSProperties = {
  color: 'var(--aurora-violet-text)', fontWeight: 700, background: 'none', border: 'none',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, padding: 0,
}

export const authFooterStyle: CSSProperties = {
  textAlign: 'center', fontSize: 12.5, color: 'var(--aurora-lo)',
  margin: '28px 0 0', fontFamily: "'Manrope', sans-serif",
}

export const authSpinnerStyle: CSSProperties = {
  width: 16, height: 16, borderRadius: '50%',
  border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white',
  animation: 'spin 0.7s linear infinite',
}
