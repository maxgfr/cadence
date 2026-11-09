import { useState } from 'react'
import { useCoachScreen } from '../../app/coach.tsx'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import { PRESET_COLORS, PRESET_EXERCISES, PRESET_SPORTS, type PresetSport } from '../../core/presets/catalog.ts'
import { PRESET_PROGRAMS } from '../../core/presets/presets.ts'
import { Button } from '../../ui/components/Button.tsx'
import { ColorDot } from '../../ui/components/Discipline.tsx'
import picker from '../../ui/DemoPicker.module.css'
import { Screen } from '../../ui/shell/Screen.tsx'
import styles from './Settings.module.css'

/** Adds real exercise libraries and programs; every exercise of a sport from the web is the coach's, offered here. */
export function Presets() {
  const data = useData()
  const toast = useToast()
  const t = useT()
  const p = t.presets
  const [sports, setSports] = useState<PresetSport[]>([])
  const [withPrograms, setWithPrograms] = useState(true)
  const [busy, setBusy] = useState(false)
  useCoachScreen({
    where: 'Presets: ready-made exercise libraries and programs they can add',
    starters: [p.starterGym, p.starterSport],
  })
  return (
    <Screen title={p.title} subtitle={p.subtitle} back={{ href: '/settings', label: t.settings.title }}>
      <div className={picker.picker}>
        <fieldset className={picker.group}>
          <legend className={picker.legend}>{p.legend}</legend>
          {PRESET_SPORTS.map((s) => (
            <label key={s} className={picker.card}>
              <input
                type="checkbox"
                checked={sports.includes(s)}
                onChange={(e) => setSports(e.target.checked ? [...sports, s] : sports.filter((x) => x !== s))}
              />
              <span className={picker.text}>
                <span className={picker.title}>
                  <ColorDot color={PRESET_COLORS[s]} />
                  {p.sport[s]}
                </span>
                <span className={picker.body}>
                  {p.summary(
                    PRESET_EXERCISES.filter((e) => e.sport === s).length,
                    PRESET_PROGRAMS.filter((x) => x.sport === s)
                      .map((x) => p.programs[x.id].name)
                      .join(', '),
                  )}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {sports.length > 0 && (
          <label className={picker.toggle}>
            <input type="checkbox" checked={withPrograms} onChange={(e) => setWithPrograms(e.target.checked)} />
            <span>{p.withPrograms}</span>
          </label>
        )}
      </div>
      <Button
        variant="primary"
        size="large"
        full
        disabled={sports.length === 0}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          const added = await data.loadPreset(sports, withPrograms)
          setBusy(false)
          setSports([])
          toast(p.loaded(added.exercises, added.programs))
        }}
      >
        {sports.length === 0 ? p.pickSport : p.load}
      </Button>
      <p className={styles.muted}>{p.again}</p>
      <section className={styles.section} aria-labelledby="presets-web-title">
        <h2 id="presets-web-title" className={styles.title}>
          {p.webTitle}
        </h2>
        <p className={styles.muted}>{p.webBody}</p>
      </section>
    </Screen>
  )
}
