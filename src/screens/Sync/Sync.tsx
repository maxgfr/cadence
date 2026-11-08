import { Check, QrCode as QrIcon, ScanLine } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { parseConfig, useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { lastSynced, markSynced } from '../../app/sync/lastSync.ts'
import { useToast } from '../../app/toast.tsx'
import { exportBackup } from '../../core/storage/backup.ts'
import { newPairingKey } from '../../core/sync/crypto.ts'
import { total } from '../../core/sync/merge.ts'
import {
  newPairing,
  type Pairing,
  pairingLink,
  parsePairing,
  runSync,
  SyncError,
  type SyncOutcome,
} from '../../core/sync/protocol.ts'
import { Button } from '../../ui/components/Button.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { QrCode } from './QrCode.tsx'
import { Scanner } from './Scanner.tsx'
import styles from './Sync.module.css'

/** How long a shown code waits for the other device. */
const WAIT_MS = 5 * 60_000
/** How long the exchange may take once connected. */
const EXCHANGE_MS = 60_000

type Phase =
  | { kind: 'choose' }
  | { kind: 'show'; pairing: Pairing; link: string }
  | { kind: 'scan' }
  | { kind: 'working' }
  /** `fromLink`: opened from the code's link (on iPhone, in Safari rather than the home-screen app). */
  | { kind: 'done'; outcome: SyncOutcome; fromLink: boolean }
  | { kind: 'error'; message: string }

const wide = () => typeof matchMedia !== 'undefined' && matchMedia('(min-width: 700px)').matches

/**
 * Safari on an iPhone or iPad, not the app added to the home screen: the two keep separate data, so a link opened
 * from the Camera syncs Safari's copy, not the app's.
 */
const iosBrowser = () => {
  if (typeof navigator === 'undefined') return false
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches)
  return ios && !installed
}

/**
 * Sync with another device: one shows a QR code, the other scans it (or opens its link). They connect directly,
 * exchange their data sealed with the code's key, and both apply the same merge. One screen, one action at a time.
 */
export function Sync() {
  const t = useT()
  const s = t.sync
  const data = useData()
  const ai = useAi()
  const toast = useToast()
  const search = useSearch()
  const [, navigate] = useLocation()
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' })
  const [step, setStep] = useState<'waiting' | 'connecting' | 'syncing'>('connecting')
  const [pasted, setPasted] = useState('')
  const [cameraOff, setCameraOff] = useState(false)
  const busy = useRef(false)
  // This sync started from the code's link, not from this screen.
  const opened = useRef(false)
  const abort = useRef<AbortController | null>(null)
  // Leaving the screen stops a sync; a remount right away (React StrictMode in development) does not.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const ctrl = abort.current
      setTimeout(() => {
        if (!mounted.current) ctrl?.abort()
      }, 0)
    }
  }, [])

  const run = useCallback(
    async (pairing: Pairing, shown: boolean) => {
      if (busy.current) return
      busy.current = true
      const ctrl = new AbortController()
      abort.current = ctrl
      const wait = setTimeout(() => ctrl.abort(new SyncError('timeout')), WAIT_MS)
      if (!shown) setPhase({ kind: 'working' })
      setStep(shown ? 'waiting' : 'connecting')
      let close: (() => Promise<void>) | undefined
      try {
        const { connect } = await import('../../app/sync/transport.ts')
        const link = await connect(pairing, ctrl.signal)
        close = link.close
        clearTimeout(wait)
        setPhase({ kind: 'working' })
        setStep('syncing')
        // Everything goes, the AI settings and key included (sealed end to end); the newest win on both devices.
        const previous = lastSynced()
        const exchange = runSync(link.channel, pairing.key, {
          snapshot: async () => ({
            backup: await exportBackup(data.store),
            ...(previous ? { syncedAt: previous.toISOString() } : {}),
            ...(ai.ready
              ? {
                  ai: {
                    config: JSON.stringify(ai.config),
                    key: await ai.getKey(),
                    ...(ai.config.savedAt ? { savedAt: ai.config.savedAt } : {}),
                  },
                }
              : {}),
          }),
          apply: async (merged, theirs) => {
            await data.replaceAll(merged)
            if (theirs) await ai.save(parseConfig(theirs.config), theirs.key, theirs.savedAt)
          },
        })
        const outcome = await Promise.race([
          exchange,
          new Promise<never>((_, reject) => setTimeout(() => reject(new SyncError('timeout')), EXCHANGE_MS)),
        ])
        markSynced()
        setPhase({ kind: 'done', outcome, fromLink: !shown && opened.current })
      } catch (e) {
        const reason = e instanceof SyncError ? e : ctrl.signal.reason instanceof SyncError ? ctrl.signal.reason : null
        setPhase({
          kind: 'error',
          message: reason ? s.errors[reason.code === 'closed' ? 'failed' : reason.code] : s.errors.failed,
        })
      } finally {
        clearTimeout(wait)
        await close?.().catch(() => {})
        busy.current = false
      }
    },
    [ai, data, s],
  )

  // Opened from the QR code's link (the phone's camera app, or a pasted link): start right away.
  useEffect(() => {
    const p = parsePairing(`?${search}`)
    if (p) {
      opened.current = true
      navigate('/settings/sync', { replace: true })
      run(p, false)
    }
  }, [search, navigate, run])

  const show = () => {
    const pairing = newPairing(newPairingKey())
    const link = pairingLink(location.href, pairing)
    setPhase({ kind: 'show', pairing, link })
    run(pairing, true)
  }

  const join = (text: string) => {
    const p = parsePairing(text)
    if (p) run(p, false)
    return p !== undefined
  }

  const last = lastSynced()

  const choices = [
    { key: 'show', icon: QrIcon, title: s.show, hint: s.showHint, onClick: show },
    { key: 'scan', icon: ScanLine, title: s.scan, hint: s.scanHint, onClick: () => setPhase({ kind: 'scan' }) },
  ]
  if (!wide()) choices.reverse()

  return (
    <Screen title={s.title} back={{ href: '/settings', label: t.settings.title }}>
      {phase.kind === 'choose' && (
        <div className={styles.stack}>
          <p className={styles.lead}>{s.lead}</p>
          <div className={styles.choices}>
            {choices.map((c, i) => (
              <button
                key={c.key}
                type="button"
                className={i === 0 ? styles.choicePrimary : styles.choice}
                onClick={c.onClick}
              >
                <c.icon size={28} strokeWidth={1.75} aria-hidden="true" />
                <span className={styles.choiceTitle}>{c.title}</span>
                <span className={styles.choiceHint}>{c.hint}</span>
              </button>
            ))}
          </div>
          <p className={styles.hint}>{last ? s.lastSynced(last.toLocaleString()) : s.never}</p>
        </div>
      )}

      {phase.kind === 'show' && (
        <div className={styles.stack}>
          <QrCode className={styles.qr} value={phase.link} label={s.qr} />
          <p className={styles.status} role="status">
            <span className={styles.dot} aria-hidden="true" />
            {step === 'waiting' ? s.waiting : s.syncing}
          </p>
          <p className={styles.hint}>{s.expires}</p>
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(phase.link).catch(() => {})
              toast(s.linkCopied)
            }}
          >
            {s.copyLink}
          </Button>
        </div>
      )}

      {phase.kind === 'scan' && (
        <div className={styles.stack}>
          {!cameraOff && (
            <>
              <Scanner
                className={styles.camera}
                label={s.camera}
                onFound={(text) => {
                  join(text)
                }}
                onUnavailable={() => setCameraOff(true)}
              />
              <p className={styles.lead}>{s.camera}</p>
            </>
          )}
          {cameraOff && <p className={styles.lead}>{s.cameraBlocked}</p>}
          <form
            className={styles.paste}
            onSubmit={(e) => {
              e.preventDefault()
              if (!join(pasted)) toast(s.invalidLink)
            }}
          >
            <Field label={s.pasteLink} value={pasted} onChange={(e) => setPasted(e.target.value)} autoComplete="off" />
            <Button type="submit" variant="primary" disabled={!pasted.trim()}>
              {s.join}
            </Button>
          </form>
          <p className={styles.hint}>{s.iosHint}</p>
        </div>
      )}

      {phase.kind === 'working' && (
        <p className={styles.status} role="status">
          <span className={styles.dot} aria-hidden="true" />
          {step === 'syncing' ? s.syncing : s.connecting}
        </p>
      )}

      {phase.kind === 'done' && (
        <div className={styles.stack} role="status">
          <p className={styles.done}>
            <Check size={28} strokeWidth={2.25} aria-hidden="true" />
            {s.upToDate}
          </p>
          <p className={styles.lead}>
            {total(phase.outcome.received) + total(phase.outcome.sent) === 0
              ? s.nothingNew
              : `${s.received(total(phase.outcome.received))} · ${s.sent(total(phase.outcome.sent))}`}
          </p>
          {phase.outcome.tookAi && <p className={styles.lead}>{s.tookAi}</p>}
          {phase.fromLink && iosBrowser() && <p className={styles.note}>{s.safariSynced}</p>}
          <Button variant="primary" size="large" full onClick={() => navigate('/')}>
            {t.common.done}
          </Button>
          <Button variant="plain" full onClick={() => setPhase({ kind: 'choose' })}>
            {s.again}
          </Button>
        </div>
      )}

      {phase.kind === 'error' && (
        <div className={styles.stack}>
          <p className={styles.error} role="alert">
            {phase.message}
          </p>
          <Button variant="primary" size="large" full onClick={() => setPhase({ kind: 'choose' })}>
            {t.common.tryAgain}
          </Button>
        </div>
      )}
    </Screen>
  )
}
