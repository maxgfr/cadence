import { Database, Download, ExternalLink, Info, LayoutTemplate, ShieldCheck, Sparkles, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAi } from '../../app/ai.tsx'
import { BUILD } from '../../app/buildInfo.ts'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import { LANGUAGE_NAMES, LOCALES } from '../../core/i18n/locale.ts'
import { BACKUP_VERSION, DEFAULT_SETTINGS, Language } from '../../core/model/schemas.ts'
import { BackupError, exportBackup, parseBackup, sessionsCsv } from '../../core/storage/backup.ts'
import { Button } from '../../ui/components/Button.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { RadioCards } from '../../ui/components/RadioCards.tsx'
import { Segmented } from '../../ui/components/Segmented.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { download } from '../../ui/download.ts'
import { Screen } from '../../ui/shell/Screen.tsx'
import { useModeOptions } from '../Onboarding/Welcome.tsx'
import styles from './Settings.module.css'

const REST_SECONDS = [30, 45, 60, 90, 120, 150, 180, 240, 300]

const restLabel = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)

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
  const t = useT()
  const modeOptions = useModeOptions()
  const s = data.settings
  const file = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string>()
  const [confirmErase, setConfirmErase] = useState(false)
  const [persisted, persist] = usePersisted()

  return (
    <Screen title={t.settings.title}>
      <section className={styles.section} aria-labelledby="language-title">
        <h2 id="language-title" className={styles.title}>
          {t.settings.language}
        </h2>
        <div className={styles.panel}>
          <SelectField
            label={t.settings.language}
            hideLabel
            value={s.language}
            options={[
              { value: 'system', label: t.settings.languageSystem },
              ...LOCALES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
            ]}
            onChange={(e) => data.updateSettings({ language: Language.parse(e.target.value) })}
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="mode-title">
        <h2 id="mode-title" className={styles.title}>
          {t.settings.mode}
        </h2>
        <RadioCards
          label={t.settings.mode}
          hideLabel
          options={modeOptions}
          value={s.mode}
          onChange={(mode) => data.updateSettings({ mode })}
        />
      </section>

      <section className={styles.section} aria-labelledby="units-title">
        <h2 id="units-title" className={styles.title}>
          {t.settings.units}
        </h2>
        <div className={styles.panel}>
          <div className={styles.pair}>
            <Segmented
              label={t.common.weight}
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
              value={s.weightUnit}
              onChange={(weightUnit) => data.updateSettings({ weightUnit })}
            />
            <Segmented
              label={t.common.distance}
              options={[
                { value: 'm', label: t.settings.metres },
                { value: 'yd', label: t.settings.yards },
              ]}
              value={s.distanceUnit}
              onChange={(distanceUnit) => data.updateSettings({ distanceUnit })}
            />
          </div>
          <div className={styles.pair}>
            <Segmented
              label={t.settings.weekStart}
              options={[
                { value: '1', label: t.settings.monday },
                { value: '0', label: t.settings.sunday },
              ]}
              value={String(s.weekStart) as '0' | '1'}
              onChange={(v) => data.updateSettings({ weekStart: v === '0' ? 0 : 1 })}
            />
            <SelectField
              label={t.settings.restTimer}
              value={String(s.defaultRest)}
              options={[
                { value: '0', label: t.settings.restWhenPlanned },
                ...REST_SECONDS.map((sec) => ({ value: String(sec), label: restLabel(sec) })),
              ]}
              hint={t.settings.restHint}
              onChange={(e) => data.updateSettings({ defaultRest: Number(e.target.value) })}
            />
          </div>
          <Segmented
            label={t.settings.appearance}
            options={[
              { value: 'system', label: t.settings.themeSystem },
              { value: 'light', label: t.settings.themeLight },
              { value: 'dark', label: t.settings.themeDark },
            ]}
            value={s.theme}
            onChange={(theme) => data.updateSettings({ theme })}
          />
        </div>
      </section>

      <ListGroup title={t.settings.training}>
        <ListRow
          leading={<Sparkles size={20} strokeWidth={1.75} />}
          title={t.settings.aiDesign}
          subtitle={ai.ready ? (ai.config.modelId ?? t.settings.aiOn) : t.settings.aiOff}
          href="/settings/ai"
        />
        <ListRow
          leading={<LayoutTemplate size={20} strokeWidth={1.75} />}
          title={t.settings.demo}
          subtitle={t.settings.demoRow}
          href="/settings/demo"
        />
      </ListGroup>

      <ListGroup title={t.settings.yourData} footer={t.settings.yourDataFooter}>
        <ListRow
          leading={<Download size={20} strokeWidth={1.75} />}
          title={t.settings.exportBackup}
          subtitle={t.settings.exportBackupHint}
          onClick={async () => {
            const b = await exportBackup(data.store)
            download(`cadence-backup-${data.today}.json`, JSON.stringify(b, null, 2), 'application/json')
          }}
        />
        <ListRow
          leading={<Upload size={20} strokeWidth={1.75} />}
          title={t.settings.importBackup}
          subtitle={t.settings.importBackupHint}
          onClick={() => file.current?.click()}
        />
        <ListRow
          leading={<Database size={20} strokeWidth={1.75} />}
          title={t.settings.exportCsv}
          subtitle={t.settings.exportCsvHint}
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
            title={t.settings.protect}
            subtitle={t.settings.protectHint}
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
        aria-label={t.settings.backupFile}
        tabIndex={-1}
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setImportError(undefined)
          try {
            const backup = parseBackup(await f.text())
            await data.replaceAll(backup)
            toast(t.settings.imported(backup.sessions.length, backup.programs.length))
          } catch (err) {
            setImportError(err instanceof BackupError ? err.message : t.settings.unreadable)
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
          {t.settings.notPersistent}
        </p>
      )}

      <section className={styles.section} aria-labelledby="erase-title">
        <h2 id="erase-title" className={styles.title}>
          {t.settings.erase}
        </h2>
        {confirmErase ? (
          <div className={styles.danger}>
            <p>{t.settings.eraseConfirm}</p>
            <div className={styles.row}>
              <Button
                variant="danger"
                onClick={async () => {
                  await data.replaceAll({
                    app: 'cadence',
                    version: BACKUP_VERSION,
                    exportedAt: new Date().toISOString(),
                    settings: { ...DEFAULT_SETTINGS, ...s },
                    disciplines: [],
                    exercises: [],
                    programs: [],
                    sessions: [],
                    goals: [],
                  })
                  setConfirmErase(false)
                  toast(t.settings.erased)
                }}
              >
                {t.settings.eraseEverything}
              </Button>
              <Button variant="plain" onClick={() => setConfirmErase(false)}>
                {t.common.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="plain" onClick={() => setConfirmErase(true)}>
            {t.settings.eraseAll}
          </Button>
        )}
      </section>

      <ListGroup title={t.settings.about}>
        <ListRow
          leading={<Info size={20} strokeWidth={1.75} />}
          title={t.common.appName}
          subtitle={t.settings.version(BUILD.version, BUILD.commit)}
        />
        <li className={styles.linkRow}>
          <a href="https://github.com/maxgfr/cadence" target="_blank" rel="noreferrer" className={styles.link}>
            <ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />
            {t.settings.sourceCode}
          </a>
        </li>
      </ListGroup>
      <p className={styles.footnote}>{t.settings.footnote}</p>
    </Screen>
  )
}
