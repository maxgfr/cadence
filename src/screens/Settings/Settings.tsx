import { Database, Download, ExternalLink, Info, LayoutTemplate, ShieldCheck, Sparkles, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAi } from '../../app/ai.tsx'
import { BUILD } from '../../app/buildInfo.ts'
import { useData } from '../../app/data.tsx'
import { useToast } from '../../app/toast.tsx'
import { BACKUP_VERSION, DEFAULT_SETTINGS } from '../../core/model/schemas.ts'
import { BackupError, exportBackup, parseBackup, sessionsCsv } from '../../core/storage/backup.ts'
import { Button } from '../../ui/components/Button.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { RadioCards } from '../../ui/components/RadioCards.tsx'
import { Segmented } from '../../ui/components/Segmented.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { download } from '../../ui/download.ts'
import { Screen } from '../../ui/shell/Screen.tsx'
import { MODE_OPTIONS } from '../Onboarding/Welcome.tsx'
import styles from './Settings.module.css'

const REST_OPTIONS = [
  { value: '0', label: 'Only when planned' },
  ...[30, 45, 60, 90, 120, 150, 180, 240, 300].map((s) => ({
    value: String(s),
    label: s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  })),
]

function usePersisted(): [boolean | undefined, () => Promise<void>] {
  const [persisted, setPersisted] = useState<boolean>()
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(undefined))
  }, [])
  return [
    persisted,
    async () => {
      const ok = (await navigator.storage?.persist?.()) ?? false
      setPersisted(ok)
    },
  ]
}

export function Settings() {
  const data = useData()
  const ai = useAi()
  const toast = useToast()
  const s = data.settings
  const file = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string>()
  const [confirmErase, setConfirmErase] = useState(false)
  const [persisted, persist] = usePersisted()

  return (
    <Screen title="Settings">
      <section className={styles.section} aria-labelledby="mode-title">
        <h2 id="mode-title" className={styles.title}>
          Mode
        </h2>
        <RadioCards
          label="Mode"
          hideLabel
          options={MODE_OPTIONS}
          value={s.mode}
          onChange={(mode) => data.updateSettings({ mode })}
        />
      </section>

      <section className={styles.section} aria-labelledby="units-title">
        <h2 id="units-title" className={styles.title}>
          Units and display
        </h2>
        <div className={styles.panel}>
          <div className={styles.pair}>
            <Segmented
              label="Weight"
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
              value={s.weightUnit}
              onChange={(weightUnit) => data.updateSettings({ weightUnit })}
            />
            <Segmented
              label="Distance"
              options={[
                { value: 'm', label: 'metres' },
                { value: 'yd', label: 'yards' },
              ]}
              value={s.distanceUnit}
              onChange={(distanceUnit) => data.updateSettings({ distanceUnit })}
            />
          </div>
          <div className={styles.pair}>
            <Segmented
              label="Week starts on"
              options={[
                { value: '1', label: 'Monday' },
                { value: '0', label: 'Sunday' },
              ]}
              value={String(s.weekStart) as '0' | '1'}
              onChange={(v) => data.updateSettings({ weekStart: v === '0' ? 0 : 1 })}
            />
            <SelectField
              label="Rest timer"
              value={String(s.defaultRest)}
              options={REST_OPTIONS}
              hint="Never starts on its own: you start it from an exercise. Its length when the plan gives no rest."
              onChange={(e) => data.updateSettings({ defaultRest: Number(e.target.value) })}
            />
          </div>
          <Segmented
            label="Appearance"
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            value={s.theme}
            onChange={(theme) => data.updateSettings({ theme })}
          />
        </div>
      </section>

      <ListGroup title="Training">
        <ListRow
          leading={<Sparkles size={20} strokeWidth={1.75} />}
          title="AI program design"
          subtitle={ai.ready ? (ai.config.modelId ?? 'On') : 'Off · optional, uses your own key'}
          href="/settings/ai"
        />
        <ListRow
          leading={<LayoutTemplate size={20} strokeWidth={1.75} />}
          title="Demo"
          subtitle="Gym, Swimming, Track and field: exercises and programs to start from"
          href="/settings/demo"
        />
      </ListGroup>

      <ListGroup
        title="Your data"
        footer="Everything stays in this browser on this device. Export a backup now and then: clearing site data or losing the device loses what is not exported. AI keys are never exported."
      >
        <ListRow
          leading={<Download size={20} strokeWidth={1.75} />}
          title="Export backup"
          subtitle="Disciplines, exercises, programs, sessions, goals and settings, as JSON"
          onClick={async () => {
            const b = await exportBackup(data.store)
            download(`cadence-backup-${data.today}.json`, JSON.stringify(b, null, 2), 'application/json')
          }}
        />
        <ListRow
          leading={<Upload size={20} strokeWidth={1.75} />}
          title="Import backup"
          subtitle="Replaces what is on this device"
          onClick={() => file.current?.click()}
        />
        <ListRow
          leading={<Database size={20} strokeWidth={1.75} />}
          title="Export sessions as CSV"
          subtitle="One row per set, for spreadsheets"
          onClick={() =>
            download(
              `cadence-sessions-${data.today}.csv`,
              sessionsCsv(data.sessions, data.index, data.disciplineIndex),
              'text/csv',
            )
          }
        />
        {persisted === false && (
          <ListRow
            leading={<ShieldCheck size={20} strokeWidth={1.75} />}
            title="Protect storage"
            subtitle="Asks the browser not to clear Cadence's data when space runs low"
            onClick={async () => {
              await persist()
            }}
          />
        )}
      </ListGroup>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Backup file"
        tabIndex={-1}
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setImportError(undefined)
          try {
            const backup = parseBackup(await f.text())
            await data.replaceAll(backup)
            toast(`Backup imported: ${backup.sessions.length} sessions, ${backup.programs.length} programs`)
          } catch (err) {
            setImportError(err instanceof BackupError ? err.message : 'The file could not be read.')
          }
        }}
      />
      {importError && (
        <p className={styles.error} role="alert">
          {importError}
        </p>
      )}
      {!data.persistent && (
        <p className={styles.error} role="alert">
          This browser does not allow Cadence to store data (private mode?). Nothing logged now survives a reload:
          export before you close.
        </p>
      )}

      <section className={styles.section} aria-labelledby="erase-title">
        <h2 id="erase-title" className={styles.title}>
          Erase
        </h2>
        {confirmErase ? (
          <div className={styles.danger}>
            <p>
              Delete every program, session, goal and exercise on this device? Export a backup first if you may want
              them back.
            </p>
            <div className={styles.row}>
              <Button
                variant="danger"
                onClick={async () => {
                  await data.replaceAll({
                    app: 'cadence',
                    version: BACKUP_VERSION,
                    exportedAt: new Date().toISOString(),
                    settings: { ...DEFAULT_SETTINGS, ...s, activeProgramId: undefined },
                    disciplines: [],
                    exercises: [],
                    programs: [],
                    sessions: [],
                    goals: [],
                  })
                  setConfirmErase(false)
                  toast('All training data erased')
                }}
              >
                Erase everything
              </Button>
              <Button variant="plain" onClick={() => setConfirmErase(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="plain" onClick={() => setConfirmErase(true)}>
            Erase all training data…
          </Button>
        )}
      </section>

      <ListGroup title="About">
        <ListRow
          leading={<Info size={20} strokeWidth={1.75} />}
          title="Cadence"
          subtitle={`Version ${BUILD.version} · ${BUILD.commit}`}
        />
        <li className={styles.linkRow}>
          <a href="https://github.com/maxgfr/cadence" target="_blank" rel="noreferrer" className={styles.link}>
            <ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />
            Source code and issues on GitHub
          </a>
        </li>
      </ListGroup>
      <p className={styles.footnote}>No account, no server, no tracking. MIT licence.</p>
    </Screen>
  )
}
