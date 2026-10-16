import { useState } from 'react'
import { useData } from '../../app/data.tsx'
import type { DemoSport } from '../../core/demo/catalog.ts'
import type { Mode, Settings } from '../../core/model/schemas.ts'
import { Button } from '../../ui/components/Button.tsx'
import { RadioCards } from '../../ui/components/RadioCards.tsx'
import { Segmented } from '../../ui/components/Segmented.tsx'
import { DemoPicker } from '../../ui/DemoPicker.tsx'
import styles from './Welcome.module.css'

export const MODE_OPTIONS: readonly { value: Mode; title: string; body: string }[] = [
  {
    value: 'normal',
    title: 'Normal',
    body: 'Sets, reps, loads and times. Session effort, records and the main charts. The quickest way to log.',
  },
  {
    value: 'advanced',
    title: 'Advanced',
    body: 'Adds effort per set, %1RM, RPE and pace targets, rest and tempo in plans, tonnage per muscle and adherence.',
  },
]

/** First run: the two choices that change every screen, then straight to Today. */
export function Welcome() {
  const { settings, updateSettings, loadDemo } = useData()
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
          <h1 className={styles.title}>Cadence</h1>
          <p className={styles.lead}>
            Plan and log your training, whatever the sport, and see what it does. Everything stays on this device.
          </p>
        </header>
        <RadioCards label="How much detail do you want?" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        <div className={styles.units}>
          <Segmented
            label="Weight"
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
            value={weightUnit}
            onChange={setWeightUnit}
          />
          <Segmented
            label="Distance"
            options={[
              { value: 'm', label: 'metres' },
              { value: 'yd', label: 'yards' },
            ]}
            value={distanceUnit}
            onChange={setDistanceUnit}
          />
        </div>
        <p className={styles.note}>Both can be changed any time in Settings. Switching mode never loses data.</p>
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
          {sports.length > 0 ? 'Start with the demo' : 'Start empty'}
        </Button>
      </div>
    </main>
  )
}
