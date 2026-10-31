import { useRegisterSW } from 'virtual:pwa-register/react'
import { useTranslation } from '../i18n'

// Reliable reload once the freshly-activated service worker takes control.
// The waiting SW only sends this event after it receives SKIP_WAITING (i.e. after
// the user clicks "Aktualizovať"); on first install the SW stays waiting and does
// not claim this page, so controllerchange does not fire here — no unwanted reload.
let reloadingForUpdate = false
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return
    reloadingForUpdate = true
    window.location.reload()
  })
}

export function PWAUpdateBanner() {
  const { t } = useTranslation()
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // mobile home-screen PWAs rarely trigger the browser's native SW
      // update check on their own — poll explicitly so updates aren't stuck
      if (registration) setInterval(() => registration.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: 'var(--violet)', color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: '10px 16px', paddingTop: 'calc(10px + var(--safe-top))', fontSize: 14, fontWeight: 500,
    }}>
      <span>{t.common.updateAvailable}</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
          color: 'white', borderRadius: 8, padding: '4px 12px',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {t.common.updateBtn}
      </button>
    </div>
  )
}
