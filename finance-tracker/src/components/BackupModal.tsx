import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { X, Lock, Upload, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { fetchBackup, restoreBackup, type RestoreCounts } from '../api/backup'
import {
  BackupFileError, backupCounts, decryptBackup, encryptBackup, inspectBackupFile, plainBackupFile,
  type BackupCounts, type BackupErrorCode,
} from '../utils/backupCrypto'
import { ConfirmDialog } from './ConfirmDialog'
import { todayISO } from '../utils/format'

const GRADIENT = 'linear-gradient(135deg, var(--aurora-violet), var(--aurora-fuchsia))'
const MIN_PASSWORD = 8

interface BackupModalProps {
  open: boolean
  mode: 'download' | 'restore'
  onClose: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px', borderRadius: 12, boxSizing: 'border-box',
  background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', color: 'var(--aurora-hi)',
  fontSize: 14, fontFamily: "'Manrope', sans-serif", outline: 'none',
}
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  width: '100%', height: 48, borderRadius: 14, border: 'none', background: GRADIENT, color: '#fff',
  fontSize: 15, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'inherit',
})
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--aurora-lo)', margin: '0 0 6px', fontFamily: "'Manrope', sans-serif" }
const errorStyle: React.CSSProperties = { fontSize: 13, color: 'var(--aurora-rose)', margin: '8px 0 0', fontFamily: "'Manrope', sans-serif" }

function downloadText(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function BackupModal({ open, mode, onClose }: BackupModalProps) {
  const { t } = useTranslation()
  const b = t.backup
  const qc = useQueryClient()
  const { refreshUser } = useAuth()

  // download
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [plain, setPlain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // restore
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileText, setFileText] = useState<string | null>(null)
  const [encrypted, setEncrypted] = useState(false)
  const [backup, setBackup] = useState<unknown>(null)
  const [counts, setCounts] = useState<BackupCounts | null>(null)
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [result, setResult] = useState<RestoreCounts | null>(null)

  useEffect(() => {
    if (!open) return
    setPw(''); setPw2(''); setPlain(false); setBusy(false); setDone(false); setError(null)
    setFileName(null); setFileText(null); setEncrypted(false); setBackup(null); setCounts(null)
    setRestoreMode('merge'); setConfirmOpen(false); setResult(null)
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy && !confirmOpen) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, confirmOpen, onClose])

  if (!open) return null

  const fileError = (code: BackupErrorCode) =>
    code === 'wrong-password' ? b.wrongPassword
      : code === 'unsupported' ? (globalThis.crypto?.subtle ? b.unsupported : b.noCrypto)
        : code === 'password-required' ? b.passwordShort
          : b.notBackup

  const serverError = (e: unknown) => {
    if (isAxiosError(e)) {
      const s = e.response?.status
      if (s === 400) return b.errInvalid
      if (s === 429) return b.errTooMany
      if (s === 413) return b.errTooLarge
    }
    return b.errGeneric
  }

  const pwProblem = plain ? null
    : pw.length < MIN_PASSWORD ? b.passwordShort
      : pw !== pw2 ? b.passwordMismatch
        : null

  async function handleDownload() {
    if (pwProblem || busy) return
    setBusy(true); setError(null)
    try {
      const data = await fetchBackup()
      const stamp = todayISO()
      if (plain) {
        downloadText(plainBackupFile(data), `finvu-backup-${stamp}.json`, 'application/json')
      } else {
        const file = await encryptBackup(data, pw)
        downloadText(file, `finvu-backup-${stamp}.finvu`, 'application/octet-stream')
      }
      setPw(''); setPw2('')
      setDone(true)
    } catch (e) {
      setError(e instanceof BackupFileError ? fileError(e.code) : serverError(e))
    } finally {
      setBusy(false)
    }
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null); setBackup(null); setCounts(null); setPw('')
    if (f.size > 50 * 1024 * 1024) { setError(b.errTooLarge); return }
    const text = await f.text()
    setFileName(f.name)
    try {
      const info = inspectBackupFile(text)
      setFileText(text)
      setEncrypted(info.encrypted)
      if (!info.encrypted) await unlock(text, undefined)
    } catch (err) {
      setFileText(null)
      setError(err instanceof BackupFileError ? fileError(err.code) : b.notBackup)
    }
  }

  async function unlock(text = fileText, password: string | undefined = pw) {
    if (!text || busy) return
    setBusy(true); setError(null)
    try {
      const data = await decryptBackup(text, password)
      setCounts(backupCounts(data))
      setBackup(data)
      setPw('')
    } catch (err) {
      setError(err instanceof BackupFileError ? fileError(err.code) : b.notBackup)
    } finally {
      setBusy(false)
    }
  }

  async function doRestore() {
    if (!backup || busy) return
    setConfirmOpen(false)
    setBusy(true); setError(null)
    try {
      const r = await restoreBackup(backup, restoreMode)
      setResult(r)
      setBackup(null)
      await Promise.all([qc.invalidateQueries(), restoreMode === 'replace' ? refreshUser() : Promise.resolve()])
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  const fmtDate = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString() : '–')
  const statRow = (label: string, value: string | number) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--aurora-gline)', fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>
      <span style={{ color: 'var(--aurora-lo)' }}>{label}</span>
      <span style={{ color: 'var(--aurora-hi)', fontWeight: 700 }}>{value}</span>
    </div>
  )

  const title = mode === 'download' ? b.downloadTitle : b.restoreTitle

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,3,8,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={() => { if (!busy) onClose() }} />
      <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'relative', width: '100%', maxWidth: 460, maxHeight: '92vh', background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 26, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 70px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--aurora-gline)' }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{title}</h2>
          <button onClick={onClose} disabled={busy} aria-label={t.common.close} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {mode === 'download' ? (
            done ? (
              <div style={{ textAlign: 'center', padding: '28px 0 8px' }}>
                <CheckCircle2 size={44} color="#34D399" style={{ marginBottom: 10 }} />
                <p style={{ fontSize: 17, fontWeight: 600, color: '#34D399', margin: '0 0 6px' }}>{b.downloaded}</p>
                <p style={{ fontSize: 13, color: 'var(--aurora-lo)', margin: '0 0 18px', fontFamily: "'Manrope', sans-serif" }}>{b.downloadedSub}</p>
                <button onClick={onClose} style={primaryBtn(false)}>{b.close}</button>
              </div>
            ) : (
              <form onSubmit={e => { e.preventDefault(); void handleDownload() }}>
                {!plain && (
                  <>
                    <label style={labelStyle} htmlFor="backup-pw">{b.password}</label>
                    <input id="backup-pw" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} style={inputStyle} autoFocus />
                    <label style={{ ...labelStyle, marginTop: 12 }} htmlFor="backup-pw2">{b.passwordRepeat}</label>
                    <input id="backup-pw2" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} style={inputStyle} />
                    <p style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--aurora-faint)', margin: '10px 0 0', fontFamily: "'Manrope', sans-serif" }}>
                      <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />{b.passwordHint}
                    </p>
                  </>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: 'var(--aurora-lo)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}>
                  <input type="checkbox" checked={plain} onChange={e => setPlain(e.target.checked)} />
                  {b.plainToggle}
                </label>
                {plain && (
                  <div role="alert" style={{ display: 'flex', gap: 8, marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(251,113,133,0.12)', border: '1px solid rgba(251,113,133,0.35)', color: 'var(--aurora-rose)', fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />{b.plainWarning}
                  </div>
                )}
                {!plain && (pw.length > 0 || pw2.length > 0) && pwProblem && <p style={errorStyle}>{pwProblem}</p>}
                {error && <p style={errorStyle}>{error}</p>}
                <div style={{ marginTop: 16 }}>
                  <button type="submit" disabled={!!pwProblem || busy} style={primaryBtn(!!pwProblem || busy)}>{busy ? b.downloading : b.download}</button>
                </div>
              </form>
            )
          ) : result ? (
            <div style={{ padding: '18px 0 4px' }}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <CheckCircle2 size={44} color="#34D399" style={{ marginBottom: 8 }} />
                <p style={{ fontSize: 17, fontWeight: 600, color: '#34D399', margin: 0 }}>{b.restored}</p>
              </div>
              {statRow(b.previewTx, result.transactions)}
              {statRow(b.previewCategories, result.categories)}
              {statRow(b.previewRules, result.categoryRules)}
              {statRow(b.previewGoals, result.savingsGoals)}
              {statRow(b.previewDeposits, result.savingsDeposits)}
              {result.skippedTransactions > 0 && statRow(b.resultSkipped, result.skippedTransactions)}
              <div style={{ marginTop: 16 }}><button onClick={onClose} style={primaryBtn(false)}>{b.close}</button></div>
            </div>
          ) : (
            <div>
              <input ref={fileRef} type="file" accept=".finvu,.json,application/json" onChange={e => void handlePick(e)} style={{ display: 'none' }} data-testid="backup-file" />
              {!fileText ? (
                <button type="button" onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '26px 16px', borderRadius: 16, border: '1.5px dashed var(--aurora-gline)', background: 'var(--aurora-glass)', color: 'var(--aurora-hi)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <Upload size={24} color="var(--aurora-violet)" />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{b.pickFile}</span>
                  <span style={{ fontSize: 12, color: 'var(--aurora-faint)' }}>{b.pickFileHint}</span>
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', fontSize: 13, color: 'var(--aurora-hi)', fontFamily: "'Manrope', sans-serif" }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {encrypted && <Lock size={14} color="var(--aurora-violet)" />}{fileName}
                  </span>
                  <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} style={{ background: 'none', border: 'none', color: 'var(--aurora-violet)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>{b.otherFile}</button>
                </div>
              )}

              {fileText && !encrypted && counts && (
                <p style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--aurora-rose)', margin: '8px 0 0', fontFamily: "'Manrope', sans-serif" }}><AlertTriangle size={14} />{b.plainFile}</p>
              )}

              {fileText && encrypted && !counts && (
                <form style={{ marginTop: 14 }} onSubmit={e => { e.preventDefault(); void unlock() }}>
                  <label style={labelStyle} htmlFor="restore-pw">{b.password}</label>
                  <input id="restore-pw" type="password" autoComplete="current-password" value={pw} onChange={e => { setPw(e.target.value); setError(null) }} style={inputStyle} autoFocus />
                  {error && <p style={errorStyle} role="alert">{error}</p>}
                  <div style={{ marginTop: 14 }}>
                    <button type="submit" disabled={!pw || busy} style={primaryBtn(!pw || busy)}>{busy ? b.unlocking : b.unlock}</button>
                  </div>
                </form>
              )}

              {counts && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ ...labelStyle, marginBottom: 2 }}>{b.previewTitle}</p>
                  {statRow(b.previewTx, counts.fixed > 0 ? `${counts.transactions} (${b.previewFixed} ${counts.fixed})` : counts.transactions)}
                  {statRow(b.previewCategories, counts.categories)}
                  {statRow(b.previewRules, counts.categoryRules)}
                  {statRow(b.previewGoals, counts.savingsGoals)}
                  {statRow(b.previewDeposits, counts.savingsDeposits)}
                  {counts.from && statRow(b.previewRange, `${fmtDate(counts.from)} – ${fmtDate(counts.to)}`)}
                  {counts.exportedAt && statRow(b.previewExported, fmtDate(counts.exportedAt))}

                  <div role="radiogroup" style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                    {(['merge', 'replace'] as const).map(m => {
                      const active = restoreMode === m
                      const danger = m === 'replace'
                      return (
                        <button key={m} type="button" role="radio" aria-checked={active} onClick={() => setRestoreMode(m)}
                          style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                            background: active ? (danger ? 'rgba(251,113,133,0.12)' : 'rgba(139,92,246,0.14)') : 'var(--aurora-glass)',
                            border: `1.5px solid ${active ? (danger ? 'var(--aurora-rose)' : 'var(--aurora-violet)') : 'var(--aurora-gline)'}` }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: danger && active ? 'var(--aurora-rose)' : 'var(--aurora-hi)' }}>{m === 'merge' ? b.modeMerge : b.modeReplace}</div>
                          <div style={{ fontSize: 12, color: 'var(--aurora-lo)', marginTop: 2, fontFamily: "'Manrope', sans-serif" }}>{m === 'merge' ? b.modeMergeSub : b.modeReplaceSub}</div>
                        </button>
                      )
                    })}
                  </div>
                  {error && <p style={errorStyle} role="alert">{error}</p>}
                  <div style={{ marginTop: 14 }}>
                    <button type="button" disabled={busy} onClick={() => (restoreMode === 'replace' ? setConfirmOpen(true) : void doRestore())} style={primaryBtn(busy)}>
                      {busy ? b.restoring : b.restore}
                    </button>
                  </div>
                </div>
              )}

              {!fileText && error && <p style={errorStyle} role="alert">{error}</p>}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirmOpen} message={b.replaceConfirm} confirmLabel={b.modeReplace} onConfirm={() => void doRestore()} onCancel={() => setConfirmOpen(false)} />
    </div>
  )
}
