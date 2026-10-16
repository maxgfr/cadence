import { DEMO_DISCIPLINES, DEMO_EXERCISES, DEMO_SPORTS, type DemoSport } from '../core/demo/catalog.ts'
import { TEMPLATES } from '../core/demo/programs.ts'
import { ColorDot } from './components/Discipline.tsx'
import styles from './DemoPicker.module.css'

const SPORT_TEXT: Record<DemoSport, string> = {
  gym: 'Main lifts and accessories',
  swim: 'Strokes and drills',
  track: 'Sprints, runs, drills and plyometrics',
}

export function sportSummary(s: DemoSport): string {
  const n = DEMO_EXERCISES.filter((e) => e.sport === s).length
  const programs = TEMPLATES.filter((t) => t.sport === s).map((t) => t.name)
  return `${SPORT_TEXT[s]}: ${n} exercises. ${programs.length === 1 ? 'Program' : 'Programs'}: ${programs.join(', ')}.`
}

interface DemoPickerProps {
  sports: DemoSport[]
  onSports: (s: DemoSport[]) => void
  withSessions: boolean
  onWithSessions: (v: boolean) => void
}

/** Pick the demo sports to start from, any combination, and whether to add example history. */
export function DemoPicker({ sports, onSports, withSessions, onWithSessions }: DemoPickerProps) {
  return (
    <div className={styles.picker}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Start from a demo sport (optional)</legend>
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
                <span className={styles.body}>{sportSummary(s)}</span>
              </span>
            </label>
          )
        })}
      </fieldset>
      {sports.length > 0 && (
        <label className={styles.toggle}>
          <input type="checkbox" checked={withSessions} onChange={(e) => onWithSessions(e.target.checked)} />
          <span>
            Also add 10 weeks of example sessions and a goal, to see records and charts at work. They are not yours:
            remove them from Settings › Demo.
          </span>
        </label>
      )}
    </div>
  )
}
