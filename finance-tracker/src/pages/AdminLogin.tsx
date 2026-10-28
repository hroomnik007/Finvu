import { useState } from 'react'
import { Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { adminLogin } from '../api/admin'
import { AuthThemeToggle } from '../components/AuthThemeToggle'
import { GlassCard } from '../components/GlassCard'

interface AdminLoginPageProps {
  onSuccess: () => void
}

export function AdminLoginPage({ onSuccess }: AdminLoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await adminLogin(username, password)
      onSuccess()
    } catch {
      setError('Nesprávne prihlasovacie údaje.')
    } finally {
      setLoading(false)
    }
  }

  const pillInput = (name: string): React.CSSProperties => ({
    width: '100%',
    background: 'var(--aurora-glass)',
    color: 'var(--aurora-hi)',
    borderRadius: 16,
    padding: name === 'password' ? '14px 44px 14px 16px' : '14px 16px',
    fontSize: 14,
    fontFamily: "'Manrope', sans-serif",
    border: `1px solid ${focused === name ? 'var(--aurora-violet)' : 'var(--aurora-gline)'}`,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxShadow: focused === name ? '0 0 0 3px rgba(139,92,246,0.15)' : 'none',
    boxSizing: 'border-box' as const,
  })

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--aurora-lo)',
    fontFamily: "'Manrope', sans-serif",
  }

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: 'var(--aurora-bg-image)', position: 'relative', overflow: 'hidden' }}>

      <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 100 }}>
        <AuthThemeToggle />
      </div>

      <div style={{ width: '100%', maxWidth: 380, margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 24px 28px', position: 'relative', zIndex: 1 }}>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(236,72,153,0.18))',
            border: '1px solid var(--aurora-gline)',
          }}>
            <Lock size={24} strokeWidth={1.8} color="var(--aurora-violet)" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)', margin: '0 0 6px' }}>
              Admin panel
            </h1>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-lo)', margin: 0 }}>Finvu — Správca systému</p>
          </div>
        </div>

        <GlassCard style={{ padding: '28px 24px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>Používateľské meno</label>
              <input
                type="text"
                autoComplete="username"
                placeholder="Používateľské meno"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onFocus={() => setFocused('username')}
                onBlur={() => setFocused(null)}
                required
                style={pillInput('username')}
              />
            </div>

            <div>
              <label style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>Heslo</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  required
                  style={pillInput('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--aurora-lo)', display: 'flex', alignItems: 'center', padding: 2 }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ borderRadius: 14, padding: '10px 14px', fontSize: 13, background: 'rgba(251,113,133,0.12)', color: 'var(--aurora-rose)', border: '1px solid rgba(251,113,133,0.3)', fontFamily: "'Manrope', sans-serif", textAlign: 'center' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                height: 48, width: '100%',
                background: loading ? 'var(--aurora-glass)' : 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))',
                border: 'none', borderRadius: 16,
                color: 'white', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'default' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(139,92,246,0.4)',
                opacity: loading ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: "'Outfit', sans-serif",
                transition: 'all 0.2s',
              }}
            >
              {loading ? (
                <>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', animation: 'spin 0.7s linear infinite' }} />
                  Prihlasovanie...
                </>
              ) : (
                <>Prihlásiť sa <ArrowRight size={14} /></>
              )}
            </button>
          </form>
        </GlassCard>
      </div>
    </div>
  )
}
