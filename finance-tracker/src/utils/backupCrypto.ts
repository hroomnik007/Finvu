// Finvu backup files (.finvu): the backup JSON is encrypted in the browser with
// a key derived from the user's password, so neither the file nor the server
// ever holds it in a readable form outside the authenticated session.
//
// File = one JSON object:
//   { finvu: "backup", v: 1, cipher: "AES-256-GCM",
//     kdf: { name: "PBKDF2", hash: "SHA-256", iterations }, salt, iv, ct }
// salt/iv/ct are base64. The header fields (everything except ct) are bound to
// the ciphertext as GCM additional data, so they can't be swapped unnoticed.
// An unencrypted export uses cipher: "none" and carries the backup as `data`.

export const BACKUP_FILE_VERSION = 1
export const PBKDF2_ITERATIONS = 600_000
// Refuse absurd work factors from a crafted file (the browser would hang)
const MAX_ITERATIONS = 10_000_000
const MIN_ITERATIONS = 100_000

export type BackupErrorCode = 'not-backup' | 'unsupported' | 'wrong-password' | 'password-required'
export class BackupFileError extends Error {
  readonly code: BackupErrorCode
  constructor(code: BackupErrorCode) {
    super(code)
    this.name = 'BackupFileError'
    this.code = code
  }
}

interface EncryptedHeader {
  finvu: 'backup'
  v: number
  cipher: 'AES-256-GCM'
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number }
  salt: string
  iv: string
}
interface EncryptedFile extends EncryptedHeader { ct: string }
interface PlainFile { finvu: 'backup'; v: number; cipher: 'none'; data: unknown }

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle
  if (!s) throw new BackupFileError('unsupported')
  return s
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// The exact bytes used as additional data: header fields in a fixed order
function headerBytes(h: EncryptedHeader): Uint8Array<ArrayBuffer> {
  const canonical = JSON.stringify({ finvu: h.finvu, v: h.v, cipher: h.cipher, kdf: { name: h.kdf.name, hash: h.kdf.hash, iterations: h.kdf.iterations }, salt: h.salt, iv: h.iv })
  return new TextEncoder().encode(canonical)
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number, usage: KeyUsage): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

export async function encryptBackup(backup: unknown, password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  if (!password) throw new BackupFileError('password-required')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const header: EncryptedHeader = {
    finvu: 'backup', v: BACKUP_FILE_VERSION, cipher: 'AES-256-GCM',
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations },
    salt: toBase64(salt), iv: toBase64(iv),
  }
  const key = await deriveKey(password, salt, iterations, 'encrypt')
  const plain = new TextEncoder().encode(JSON.stringify(backup))
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: headerBytes(header), tagLength: 128 }, key, plain)
  const file: EncryptedFile = { ...header, ct: toBase64(new Uint8Array(ct)) }
  return JSON.stringify(file)
}

export function plainBackupFile(backup: unknown): string {
  const file: PlainFile = { finvu: 'backup', v: BACKUP_FILE_VERSION, cipher: 'none', data: backup }
  return JSON.stringify(file)
}

/** Reads just enough to tell whether the file needs a password. */
export function inspectBackupFile(text: string): { encrypted: boolean } {
  const f = parseFile(text)
  return { encrypted: f.cipher !== 'none' }
}

function parseFile(text: string): EncryptedFile | PlainFile {
  let f: unknown
  try { f = JSON.parse(text) } catch { throw new BackupFileError('not-backup') }
  if (!f || typeof f !== 'object' || (f as { finvu?: unknown }).finvu !== 'backup') throw new BackupFileError('not-backup')
  const o = f as Record<string, unknown>
  if (o.v !== BACKUP_FILE_VERSION) throw new BackupFileError('unsupported')
  if (o.cipher === 'none') {
    if (!('data' in o)) throw new BackupFileError('not-backup')
    return o as unknown as PlainFile
  }
  if (o.cipher !== 'AES-256-GCM') throw new BackupFileError('unsupported')
  const kdf = o.kdf as Record<string, unknown> | undefined
  if (!kdf || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || typeof kdf.iterations !== 'number'
    || !Number.isInteger(kdf.iterations) || kdf.iterations < MIN_ITERATIONS || kdf.iterations > MAX_ITERATIONS) {
    throw new BackupFileError('unsupported')
  }
  if (typeof o.salt !== 'string' || typeof o.iv !== 'string' || typeof o.ct !== 'string') throw new BackupFileError('not-backup')
  return o as unknown as EncryptedFile
}

export async function decryptBackup(text: string, password?: string): Promise<unknown> {
  const f = parseFile(text)
  if (f.cipher === 'none') return f.data
  if (!password) throw new BackupFileError('password-required')
  let salt: Uint8Array<ArrayBuffer>, iv: Uint8Array<ArrayBuffer>, ct: Uint8Array<ArrayBuffer>
  try { salt = fromBase64(f.salt); iv = fromBase64(f.iv); ct = fromBase64(f.ct) } catch { throw new BackupFileError('not-backup') }
  if (iv.length !== 12 || salt.length < 16) throw new BackupFileError('not-backup')
  const key = await deriveKey(password, salt, f.kdf.iterations, 'decrypt')
  let plain: ArrayBuffer
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: headerBytes(f), tagLength: 128 }, key, ct)
  } catch {
    // GCM can't tell a wrong password from a damaged file; the password is by far the likelier cause
    throw new BackupFileError('wrong-password')
  }
  try { return JSON.parse(new TextDecoder().decode(plain)) } catch { throw new BackupFileError('not-backup') }
}

export interface BackupCounts {
  transactions: number; fixed: number; categories: number; categoryRules: number; savingsGoals: number; savingsDeposits: number
  from: string | null; to: string | null; exportedAt: string | null
}

/** Shape check for the preview; the server validates the backup fully on restore. */
export function backupCounts(backup: unknown): BackupCounts {
  const b = backup as { format?: unknown; exportedAt?: unknown; data?: Record<string, unknown> }
  if (!b || b.format !== 'finvu-backup' || !b.data || typeof b.data !== 'object') throw new BackupFileError('not-backup')
  const arr = (k: string) => (Array.isArray(b.data![k]) ? b.data![k] as unknown[] : null)
  const txs = arr('transactions'), cats = arr('categories'), rules = arr('categoryRules'), goals = arr('savingsGoals'), deps = arr('savingsDeposits')
  if (!txs || !cats || !rules || !goals || !deps) throw new BackupFileError('not-backup')
  const dates = txs.map(t => (t as { date?: unknown }).date).filter((d): d is string => typeof d === 'string').sort()
  return {
    transactions: txs.length,
    fixed: txs.filter(t => (t as { isFixed?: unknown }).isFixed === true).length,
    categories: cats.length, categoryRules: rules.length, savingsGoals: goals.length, savingsDeposits: deps.length,
    from: dates[0] ?? null, to: dates[dates.length - 1] ?? null,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : null,
  }
}
