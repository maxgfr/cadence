import { useState } from 'react'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
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
  const t = useT()
  const d = t.settings.demoPage
  const [sports, setSports] = useState<DemoSport[]>([])
  const [withSessions, setWithSessions] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const removal = demoRemoval(data)
  const demoCount = Object.values(removal).reduce((n, ids) => n + ids.length, 0)
  return (
    <Screen title={t.settings.demo} subtitle={d.subtitle} back={{ href: '/settings', label: t.settings.title }}>
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
          toast(d.loaded)
        }}
      >
        {sports.length === 0 ? d.pickSport : d.load}
      </Button>
      <p className={styles.muted}>{d.loadAgain}</p>
      {demoCount > 0 && (
        <section className={styles.section} aria-labelledby="remove-title">
          <h2 id="remove-title" className={styles.title}>
            {d.remove}
          </h2>
          <p className={styles.muted}>
            {d.contents(
              removal.programs.length,
              removal.sessions.length,
              removal.goals.length,
              removal.exercises.length,
              removal.disciplines.length,
            )}
          </p>
          {confirm ? (
            <div className={styles.danger}>
              <p>{d.removeConfirm}</p>
              <div className={styles.row}>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await data.removeDemo()
                    setConfirm(false)
                    toast(d.removed)
                  }}
                >
                  {d.remove}
                </Button>
                <Button variant="plain" onClick={() => setConfirm(false)}>
                  {d.keep}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="plain" onClick={() => setConfirm(true)}>
              {d.removeEllipsis}
            </Button>
          )}
        </section>
      )}
    </Screen>
  )
}
