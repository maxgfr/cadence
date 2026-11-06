import { useState } from 'react'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import type { DemoSport } from '../../core/demo/catalog.ts'
import type { Mode, Settings } from '../../core/model/schemas.ts'
import { Button } from '../../ui/components/Button.tsx'
import { RadioCards } from '../../ui/components/RadioCards.tsx'
import { Segmented } from '../../ui/components/Segmented.tsx'
import { DemoPicker } from '../../ui/DemoPicker.tsx'
import styles from './Welcome.module.css'

/** The two modes, in the displayed language (Welcome and Settings). */
export function useModeOptions(): readonly { value: Mode; title: string; body: string }[] {
  const t = useT()
  return [
    { value: 'normal', title: t.welcome.normalTitle, body: t.welcome.normalBody },
    { value: 'advanced', title: t.welcome.advancedTitle, body: t.welcome.advancedBody },
  ]
}

/** First run: the two choices that change every screen, then straight to Today. */
export function Welcome() {
  const { settings, updateSettings, loadDemo } = useData()
  const t = useT()
  const modeOptions = useModeOptions()
  const [sports, setSports] = useState<DemoSport[]>([])
  const [withSessions, setWithSessions] = useState(false)
  const [mode, setMode] = useState<Mode>(settings.mode)
  const [weightUnit, setWeightUnit] = useState<Settings['weightUnit']>(settings.weightUnit)
  const [distanceUnit, setDistanceUnit] = useState<Settings['distanceUnit']>(settings.distanceUnit)
  const [busy, setBusy] = useState(false)

  return (
    <main className={styles.welcome}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <svg className={styles.mark} viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" />
            <path d="M17 42h7l5-20 6 25 5-15h7" />
          </svg>
          <h1 className={styles.title}>{t.common.appName}</h1>
          <p className={styles.lead}>{t.welcome.lead}</p>
        </header>
        <RadioCards label={t.welcome.detailQuestion} options={modeOptions} value={mode} onChange={setMode} />
        <div className={styles.units}>
          <Segmented
            label={t.common.weight}
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
            value={weightUnit}
            onChange={setWeightUnit}
          />
          <Segmented
            label={t.common.distance}
            options={[
              { value: 'm', label: t.welcome.metres },
              { value: 'yd', label: t.welcome.yards },
            ]}
            value={distanceUnit}
            onChange={setDistanceUnit}
          />
        </div>
        <p className={styles.note}>{t.welcome.note}</p>
        <DemoPicker sports={sports} onSports={setSports} withSessions={withSessions} onWithSessions={setWithSessions} />
        <Button
          variant="primary"
          size="large"
          full
          loading={busy}
          onClick={async () => {
            setBusy(true)
            if (sports.length > 0) await loadDemo(sports, withSessions)
            await updateSettings({ mode, weightUnit, distanceUnit, onboarded: true })
          }}
        >
          {sports.length > 0 ? t.welcome.startDemo : t.welcome.startEmpty}
        </Button>
      </div>
    </main>
  )
}
