import { useState } from 'react'
import { useData } from '../../app/data.tsx'
import { useToast } from '../../app/toast.tsx'
import type { DemoSport } from '../../core/demo/catalog.ts'
import { demoRemoval } from '../../core/demo/demo.ts'
import { Button } from '../../ui/components/Button.tsx'
import { DemoPicker } from '../../ui/DemoPicker.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import styles from './Settings.module.css'

/** Load demo sports as a starting point, or take the demo away again. */
export function Demo() {
  const data = useData()
  const toast = useToast()
  const [sports, setSports] = useState<DemoSport[]>([])
  const [withSessions, setWithSessions] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const removal = demoRemoval(data)
  const demoCount = Object.values(removal).reduce((n, ids) => n + ids.length, 0)
  return (
    <Screen
      title="Demo"
      subtitle="Ready-made disciplines, exercises and programs to start from. Everything stays editable."
      back={{ href: '/settings', label: 'Settings' }}
    >
      <DemoPicker sports={sports} onSports={setSports} withSessions={withSessions} onWithSessions={setWithSessions} />
      <Button
        variant="primary"
        size="large"
        full
        disabled={sports.length === 0}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          await data.loadDemo(sports, withSessions)
          setBusy(false)
          setSports([])
          toast('Demo loaded: find it in Exercises and Programs')
        }}
      >
        {sports.length === 0 ? 'Pick at least one sport' : 'Load the demo'}
      </Button>
      <p className={styles.muted}>Loading again never overwrites what you changed: only what is missing is added.</p>
      {demoCount > 0 && (
        <section className={styles.section} aria-labelledby="remove-title">
          <h2 id="remove-title" className={styles.title}>
            Remove the demo
          </h2>
          <p className={styles.muted}>
            {removal.programs.length} programs, {removal.sessions.length} example sessions, {removal.goals.length}{' '}
            goals, {removal.exercises.length} exercises and {removal.disciplines.length} disciplines. Exercises and
            disciplines your own sessions or programs use are kept.
          </p>
          {confirm ? (
            <div className={styles.danger}>
              <p>Remove all of it?</p>
              <div className={styles.row}>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await data.removeDemo()
                    setConfirm(false)
                    toast('Demo removed')
                  }}
                >
                  Remove the demo
                </Button>
                <Button variant="plain" onClick={() => setConfirm(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="plain" onClick={() => setConfirm(true)}>
              Remove the demo…
            </Button>
          )}
        </section>
      )}
    </Screen>
  )
}
