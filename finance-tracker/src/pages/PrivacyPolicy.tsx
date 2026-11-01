import { ArrowLeft } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'

const SECTIONS = [
  {
    title: '1. Správca údajov',
    body: <p>Správcom osobných údajov je prevádzkovateľ aplikácie Finvu dostupnej na adrese finvu.pedani.eu.</p>,
  },
  {
    title: '2. Aké údaje zbierame',
    body: (
      <ul style={{ listStyle: 'disc', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li>Meno a emailová adresa (pri registrácii)</li>
        <li>Finančné záznamy, ktoré zadáš (príjmy, výdavky, kategórie)</li>
        <li>Technické údaje potrebné pre fungovanie aplikácie (IP adresa, čas prihlásenia)</li>
      </ul>
    ),
  },
  {
    title: '3. Účel spracovania',
    body: <p>Tvoje údaje spracúvame výlučne za účelom poskytovania funkcionality aplikácie Finvu — evidencie osobných financií. Údaje nepredávame tretím stranám ani ich nepoužívame na marketingové účely.</p>,
  },
  {
    title: '4. Ukladanie údajov',
    body: <p>Tvoje dáta sú bezpečne uložené na serveri v EU. Prenos dát je šifrovaný pomocou HTTPS. Heslá sú ukladané iba v zahashovanej forme (bcrypt).</p>,
  },
  {
    title: '5. Tvoje práva',
    body: (
      <ul style={{ listStyle: 'disc', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li>Právo na prístup k tvojim údajom</li>
        <li>Právo na opravu nesprávnych údajov</li>
        <li>Právo na vymazanie účtu a všetkých údajov (dostupné v Nastaveniach aplikácie)</li>
        <li>Právo na prenosnosť údajov (export do JSON dostupný v Nastaveniach)</li>
      </ul>
    ),
  },
  {
    title: '6. Cookies',
    body: <p>Aplikácia používa iba nevyhnutné technické cookies pre správu prihlásenia (httpOnly refresh token). Nepoužívame analytické ani reklamné cookies.</p>,
  },
  {
    title: '7. Kontakt',
    body: <p>V prípade otázok týkajúcich sa ochrany súkromia nás kontaktuj na emailovej adrese dostupnej cez aplikáciu.</p>,
  },
]

export function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--aurora-bg-image)', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}>

        <button
          type="button"
          onClick={() => window.history.back()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--aurora-violet-text)', fontFamily: "'Manrope', sans-serif",
            fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 24,
          }}
        >
          <ArrowLeft size={15} /> Späť
        </button>

        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 26, fontWeight: 700, color: 'var(--aurora-hi)', margin: '0 0 8px' }}>
          Zásady ochrany súkromia — Finvu
        </h1>
        <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: '0 0 28px' }}>
          Platné od: 1. januára 2025
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {SECTIONS.map(s => (
            <GlassCard key={s.title} radius={16}>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--aurora-hi)', margin: '0 0 10px' }}>
                {s.title}
              </h2>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13.5, lineHeight: 1.65, color: 'var(--aurora-lo)' }}>
                {s.body}
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  )
}
