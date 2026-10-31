import { describe, expect, it } from 'vitest'
import { suggestPasskeyName } from './passkeyName'

const names = { passkeyDefaultName: 'Biometrický kľúč', passkeyExternalName: 'Telefón alebo bezpečnostný kľúč' }
const name = (userAgent: string, maxTouchPoints = 0, att = 'platform') => suggestPasskeyName({ userAgent, maxTouchPoints }, att, names)

describe('suggestPasskeyName', () => {
  it('names the common devices', () => {
    expect(name('Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari')
    expect(name('Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Chrome')
    expect(name('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15', 5)).toBe('iPad · Safari')
    expect(name('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15')).toBe('Mac · Safari')
    expect(name('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')).toBe('Android · Chrome')
    expect(name('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0 Mobile Safari/537.36')).toBe('Android · Samsung Internet')
    expect(name('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0')).toBe('Windows · Edge')
    expect(name('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0')).toBe('Linux · Firefox')
    expect(name('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('ChromeOS · Chrome')
  })

  it('falls back to the translated names', () => {
    expect(name('curl/8')).toBe('Biometrický kľúč')
    expect(name('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0', 0, 'cross-platform')).toBe('Telefón alebo bezpečnostný kľúč')
  })
})
