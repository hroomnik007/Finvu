import { useState, useEffect } from 'react'
import { Users, UserPlus, CreditCard, Flame, LogOut, Check, X } from 'lucide-react'
import { AdminLoginPage } from './AdminLogin'
import { GlassCard } from '../components/GlassCard'
import {
  checkAdminSession, adminLogout, clearAdminState,
  fetchAdminStats, fetchAdminUsers,
  type AdminStats, type AdminUser,
} from '../api/admin'

export function AdminPage() {
  useEffect(() => {
    document.title = 'Finvu Admin'
    return () => { document.title = 'Finvu' }
  }, [])

  // undefined = still checking the httpOnly admin cookie with the server
  const [hasSession, setHasSession] = useState<boolean | undefined>(undefined)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const loading = hasSession && !stats && !error

  useEffect(() => {
    checkAdminSession().then(setHasSession)
  }, [])

  useEffect(() => {
    if (!hasSession) return
    Promise.all([fetchAdminStats(), fetchAdminUsers()])
      .then(([s, u]) => {
        setStats(s)
        setUsers(u.users)
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 401 || status === 403) {
          clearAdminState()
          setHasSession(false)
        } else {
          setError('Nepodarilo sa načítať admin dáta.')
        }
      })
  }, [hasSession])

  if (hasSession === undefined) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--aurora-bg-image)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: "'Manrope', sans-serif", color: 'var(--aurora-lo)', fontSize: 16 }}>Načítavam...</p>
      </div>
    )
  }

  if (!hasSession) {
    return <AdminLoginPage onSuccess={() => setHasSession(true)} />
  }

  function handleLogout() {
    adminLogout()
    setHasSession(false)
    setStats(null)
    setUsers([])
    setError(null)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--aurora-bg-image)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: "'Manrope', sans-serif", color: 'var(--aurora-lo)', fontSize: 16 }}>Načítavam...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--aurora-bg-image)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: "'Manrope', sans-serif", color: 'var(--aurora-rose)', fontSize: 16 }}>{error}</p>
      </div>
    )
  }

  const statCards = stats ? [
    { label: 'Celkom používateľov', value: stats.totalUsers, color: 'var(--aurora-violet-text)', bg: 'rgba(139,92,246,0.15)', icon: Users },
    { label: 'Noví (7 dní)', value: stats.newUsers7d, color: 'var(--aurora-emerald)', bg: 'rgba(52,211,153,0.15)', icon: UserPlus },
    { label: 'Celkom transakcií', value: stats.totalTransactions, color: 'var(--aurora-cyan)', bg: 'rgba(34,211,238,0.15)', icon: CreditCard },
    { label: 'Aktívni (30 dní)', value: stats.activeUsers30d, color: 'var(--aurora-amber)', bg: 'rgba(251,191,36,0.15)', icon: Flame },
  ] : []

  return (
    <div style={{
      minHeight: '100svh',
      background: 'var(--aurora-bg-image)',
      color: 'var(--aurora-hi)',
      padding: '32px 24px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <img src="/logo.svg" alt="Finvu" style={{ width: 32, height: 32 }} />
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Finvu</span>
            </div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 26, fontWeight: 700, color: 'var(--aurora-hi)' }}>Admin panel</h1>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, color: 'var(--aurora-lo)', marginTop: 4 }}>Prehľad systémových štatistík</p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              height: 40,
              padding: '0 20px',
              background: 'transparent',
              border: '1px solid rgba(251,113,133,0.4)',
              borderRadius: 14,
              color: 'var(--aurora-rose)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Manrope', sans-serif",
              cursor: 'pointer',
            }}
          >
            <LogOut size={15} strokeWidth={2} />
            Odhlásiť
          </button>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
          {statCards.map(card => (
            <GlassCard key={card.label} radius={20} style={{ padding: '20px 16px' }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: card.bg, marginBottom: 14,
              }}>
                <card.icon size={20} strokeWidth={1.8} color={card.color} />
              </div>
              <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 700, color: 'var(--aurora-hi)' }}>
                {card.value.toLocaleString('sk-SK')}
              </p>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-lo)', marginTop: 4 }}>{card.label}</p>
            </GlassCard>
          ))}
        </div>

        {/* User table */}
        <GlassCard radius={20} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--aurora-gline)' }}>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 600, color: 'var(--aurora-hi)' }}>Používatelia ({users.length})</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--aurora-gline)' }}>
                  {['Meno', 'Email', 'Email overený', 'Registrácia', 'Posledné prihlásenie', 'Naposledy aktívny', 'Transakcie'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--aurora-lo)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--aurora-gline)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--aurora-hi)', fontWeight: 500 }}>{u.name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--aurora-lo)' }}>{u.email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: '50%',
                        background: u.emailVerified ? 'rgba(52,211,153,0.15)' : 'rgba(251,113,133,0.15)',
                        color: u.emailVerified ? 'var(--aurora-emerald)' : 'var(--aurora-rose)',
                      }}>
                        {u.emailVerified ? <Check size={13} strokeWidth={2.5} /> : <X size={13} strokeWidth={2.5} />}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--aurora-lo)' }}>
                      {new Date(u.createdAt).toLocaleDateString('sk-SK')}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--aurora-lo)' }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('sk-SK') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--aurora-lo)' }}>
                      {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString('sk-SK') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--aurora-violet-text)', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                      {u.transactionCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
