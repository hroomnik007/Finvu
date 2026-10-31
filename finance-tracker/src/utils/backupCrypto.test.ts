import { describe, expect, it } from 'vitest'
import { BackupFileError, backupCounts, decryptBackup, encryptBackup, inspectBackupFile, plainBackupFile, PBKDF2_ITERATIONS } from './backupCrypto'

const sample = {
  format: 'finvu-backup', version: 1, exportedAt: '2026-10-31T12:00:00.000Z',
  data: {
    settings: { theme: 'dark', language: 'sk', trackingStartDate: '2026-01-01', currencyFormat: 'sk', defaultPage: 'dashboard', savingsEnabled: true },
    categories: [{ id: 'c1', name: 'Jedlo', type: 'expense' }],
    categoryRules: [{ keyword: 'lidl', categoryId: 'c1' }],
    transactions: [
      { categoryId: 'c1', type: 'expense', amount: '12.50', description: 'Lidl – nákup ľščťžýáíé', date: '2026-03-04', isFixed: false, endedOn: null },
      { categoryId: null, type: 'expense', amount: '500.00', description: 'Nájom', date: '2026-01-01', isFixed: true, endedOn: '2026-07-01' },
    ],
    savingsGoals: [], savingsDeposits: [],
  },
}

async function rejects(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(BackupFileError)
  await expect(p).rejects.toMatchObject({ code })
}

describe('backup file encryption', () => {
  it('round-trips with the right password and uses the strong defaults', async () => {
    const file = await encryptBackup(sample, 'správne heslo 123')
    const header = JSON.parse(file)
    expect(header).toMatchObject({ finvu: 'backup', v: 1, cipher: 'AES-256-GCM', kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS } })
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000)
    expect(atob(header.salt)).toHaveLength(16)
    expect(atob(header.iv)).toHaveLength(12)
    // nothing readable leaks into the file
    expect(file).not.toContain('Lidl')
    expect(file).not.toContain('Nájom')
    expect(inspectBackupFile(file)).toEqual({ encrypted: true })
    expect(await decryptBackup(file, 'správne heslo 123')).toEqual(sample)
  })

  it('uses a fresh salt and iv every time', async () => {
    const a = JSON.parse(await encryptBackup(sample, 'pw-pw-pw', 100_000))
    const b = JSON.parse(await encryptBackup(sample, 'pw-pw-pw', 100_000))
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ct).not.toBe(b.ct)
  })

  it('reports a wrong password clearly', async () => {
    const file = await encryptBackup(sample, 'right', 100_000)
    await rejects(decryptBackup(file, 'wrong'), 'wrong-password')
    await rejects(decryptBackup(file), 'password-required')
  })

  it('detects tampering with the header or the ciphertext', async () => {
    const f = JSON.parse(await encryptBackup(sample, 'pw', 100_000))
    await rejects(decryptBackup(JSON.stringify({ ...f, kdf: { ...f.kdf, iterations: 100_001 } }), 'pw'), 'wrong-password')
    const ct = atob(f.ct)
    const flipped = btoa(String.fromCharCode(ct.charCodeAt(0) ^ 1) + ct.slice(1))
    await rejects(decryptBackup(JSON.stringify({ ...f, ct: flipped }), 'pw'), 'wrong-password')
  })

  it('rejects files that are not backups or have unsafe parameters', async () => {
    await rejects(decryptBackup('not json', 'x'), 'not-backup')
    await rejects(decryptBackup('{"hello":1}', 'x'), 'not-backup')
    const f = JSON.parse(await encryptBackup(sample, 'pw', 100_000))
    await rejects(decryptBackup(JSON.stringify({ ...f, v: 2 }), 'pw'), 'unsupported')
    await rejects(decryptBackup(JSON.stringify({ ...f, kdf: { ...f.kdf, iterations: 1000 } }), 'pw'), 'unsupported')
    await rejects(decryptBackup(JSON.stringify({ ...f, kdf: { ...f.kdf, iterations: 1e9 } }), 'pw'), 'unsupported')
    await rejects(decryptBackup(JSON.stringify({ ...f, cipher: 'AES-128-CBC' }), 'pw'), 'unsupported')
  })

  it('reads an unencrypted export without a password', async () => {
    const file = plainBackupFile(sample)
    expect(inspectBackupFile(file)).toEqual({ encrypted: false })
    expect(await decryptBackup(file)).toEqual(sample)
  })

  it('counts what a backup holds for the preview', () => {
    expect(backupCounts(sample)).toEqual({
      transactions: 2, fixed: 1, categories: 1, categoryRules: 1, savingsGoals: 0, savingsDeposits: 0,
      from: '2026-01-01', to: '2026-03-04', exportedAt: '2026-10-31T12:00:00.000Z',
    })
    expect(() => backupCounts({ format: 'other' })).toThrow(BackupFileError)
  })
})
