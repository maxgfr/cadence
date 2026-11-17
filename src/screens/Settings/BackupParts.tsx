import { useT } from '../../app/i18n.tsx'
import type { Messages } from '../../core/i18n/index.ts'
import type { BackupPart } from '../../core/model/schemas.ts'
import { BACKUP_PARTS } from '../../core/storage/backup.ts'
import type { Collections } from '../../core/storage/store.ts'
import { cx } from '../../ui/cx.ts'
import picker from '../../ui/DemoPicker.module.css'
import styles from './Settings.module.css'

type Lists = { [C in keyof Collections]: readonly Collections[C][] }

/** What a part holds, counted. */
export function partSummary(t: Messages, part: BackupPart, lists: Lists): string {
  const b = t.settings.backupSheet
  switch (part) {
    case 'history':
      return b.sessions(lists.sessions.length)
    case 'exercises':
      return `${b.exercises(lists.exercises.length)}, ${b.disciplines(lists.disciplines.length)}`
    case 'programs':
      return b.programs(lists.programs.length)
    case 'goals':
      return b.goals(lists.goals.length)
    case 'notes':
      return b.notes(lists.notes.length)
    case 'settings':
      return b.settingsHint
  }
}

/** The parts of a backup, ticked or not; those not `available` cannot be ticked. */
export function BackupParts({
  legend,
  value,
  onChange,
  lists,
  available = BACKUP_PARTS,
}: {
  legend: string
  value: readonly BackupPart[]
  onChange: (parts: BackupPart[]) => void
  lists: Lists
  available?: readonly BackupPart[]
}) {
  const t = useT()
  const b = t.settings.backupSheet
  return (
    <fieldset className={picker.group}>
      <legend className={picker.legend}>{legend}</legend>
      {BACKUP_PARTS.map((p) => {
        const off = !available.includes(p)
        return (
          <label key={p} className={cx(picker.card, off && styles.partOff)}>
            <input
              type="checkbox"
              checked={!off && value.includes(p)}
              disabled={off}
              onChange={(e) => onChange(BACKUP_PARTS.filter((x) => (x === p ? e.target.checked : value.includes(x))))}
            />
            <span className={picker.text}>
              <span className={picker.title}>{b.parts[p]}</span>
              <span className={picker.body}>{off ? b.notInFile : partSummary(t, p, lists)}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
