import { useT } from '../app/i18n.tsx'
import { DEMO_DISCIPLINES, DEMO_EXERCISES, DEMO_SPORTS, type DemoSport } from '../core/demo/catalog.ts'
import { TEMPLATES } from '../core/demo/programs.ts'
import type { Messages } from '../core/i18n/index.ts'
import { ColorDot } from './components/Discipline.tsx'
import styles from './DemoPicker.module.css'

/** What a demo sport brings: its kind of exercises, how many, and its programs. */
export function sportSummary(s: DemoSport, t: Messages): string {
  const n = DEMO_EXERCISES.filter((e) => e.sport === s).length
  const programs = TEMPLATES.filter((p) => p.sport === s).map((p) => p.name)
  return t.forms.demo.summary(t.forms.demo.sport[s], n, programs.length, programs.join(', '))
}

interface DemoPickerProps {
  sports: DemoSport[]
  onSports: (s: DemoSport[]) => void
  withSessions: boolean
  onWithSessions: (v: boolean) => void
}

/** Pick the demo sports to start from, any combination, and whether to add example history. */
export function DemoPicker({ sports, onSports, withSessions, onWithSessions }: DemoPickerProps) {
  const t = useT()
  return (
    <div className={styles.picker}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t.forms.demo.legend}</legend>
        {DEMO_SPORTS.map((s) => {
          const d = DEMO_DISCIPLINES[s]
          return (
            <label key={s} className={styles.card}>
              <input
                type="checkbox"
                checked={sports.includes(s)}
                onChange={(e) => onSports(e.target.checked ? [...sports, s] : sports.filter((x) => x !== s))}
              />
              <span className={styles.text}>
                <span className={styles.title}>
                  <ColorDot color={d.color} />
                  {d.name}
                </span>
                <span className={styles.body}>{sportSummary(s, t)}</span>
              </span>
            </label>
          )
        })}
      </fieldset>
      {sports.length > 0 && (
        <label className={styles.toggle}>
          <input type="checkbox" checked={withSessions} onChange={(e) => onWithSessions(e.target.checked)} />
          <span>{t.forms.demo.withSessions}</span>
        </label>
      )}
    </div>
  )
}
