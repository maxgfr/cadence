import { Download, History as HistoryIcon, Plus, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStartSession } from '../../app/actions.ts'
import { useData } from '../../app/data.tsx'
import { formatDay, fromIsoDate } from '../../core/model/dates.ts'
import { recordHistory } from '../../core/stats/records.ts'
import { sessionsCsv } from '../../core/storage/backup.ts'
import { Button } from '../../ui/components/Button.tsx'
import { DisciplineDot } from '../../ui/components/Discipline.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { download } from '../../ui/download.ts'
import { useUnits } from '../../ui/units.ts'
import styles from './History.module.css'
import { sessionSummary } from './summary.ts'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Every session, newest first, grouped by month: the History view of Progress. */
export function HistoryList() {
  const data = useData()
  const units = useUnits()
  const [adding, setAdding] = useState(false)
  const done = useMemo(
    () =>
      data.sessions
        .filter((s) => s.status === 'done')
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [data.sessions],
  )
  const recordsBySession = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of recordHistory(data.sessions, data.index))
      if (r.previous !== undefined) m.set(r.sessionId, (m.get(r.sessionId) ?? 0) + 1)
    return m
  }, [data.sessions, data.index])
  const months = useMemo(() => {
    const groups: { key: string; title: string; items: typeof done }[] = []
    for (const s of done) {
      const d = fromIsoDate(s.date)
      const key = s.date.slice(0, 7)
      let g = groups[groups.length - 1]
      if (!g || g.key !== key) {
        g = { key, title: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, items: [] }
        groups.push(g)
      }
      g.items.push(s)
    }
    return groups
  }, [done])
  const year = new Date().getFullYear()

  return (
    <>
      {done.length > 0 && (
        <Button
          variant="secondary"
          icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />}
          onClick={() => setAdding(true)}
        >
          Log a session
        </Button>
      )}
      {done.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No session logged yet"
          body="Every session you finish lands here, with what was planned next to what you did. Log one done earlier, or start one from Today."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Log a session
            </Button>
          }
        />
      ) : (
        months.map((m) => (
          <ListGroup key={m.key} title={m.title}>
            {m.items.map((s) => {
              const prs = recordsBySession.get(s.id) ?? 0
              return (
                <ListRow
                  key={s.id}
                  leading={<DisciplineDot disciplineId={s.disciplineId} />}
                  title={s.title}
                  subtitle={`${formatDay(s.date, year)} · ${sessionSummary(s, data.index, units)}`}
                  trailing={
                    prs > 0 ? (
                      <span className={styles.pr}>
                        <Trophy size={14} strokeWidth={2} aria-hidden="true" />
                        {prs} {prs === 1 ? 'record' : 'records'}
                      </span>
                    ) : undefined
                  }
                  href={`/progress/sessions/${s.id}`}
                />
              )
            })}
          </ListGroup>
        ))
      )}
      <Sheet open={adding} title="Log a session" onClose={() => setAdding(false)}>
        {adding && <NewSessionForm />}
      </Sheet>
    </>
  )
}

/** A session on any day (one done earlier, or today): its sets are logged next, then it is finished as usual. */
function NewSessionForm() {
  const data = useData()
  const start = useStartSession()
  const [date, setDate] = useState(data.today)
  const [sport, setSport] = useState('')
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        start.free(sport || undefined, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : data.today)
      }}
    >
      <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <SelectField
        label="Discipline"
        value={sport}
        options={[{ value: '', label: 'None' }, ...data.disciplines.map((d) => ({ value: d.id, label: d.name }))]}
        onChange={(e) => setSport(e.target.value)}
      />
      <Button type="submit" variant="primary" size="large" full>
        Log its sets
      </Button>
    </form>
  )
}

/** Downloads every session as CSV (shown with the History view once a session is logged). */
export function ExportCsvButton() {
  const data = useData()
  return (
    <IconButton
      icon={Download}
      label="Export sessions as CSV"
      onClick={() =>
        download(
          `cadence-sessions-${data.today}.csv`,
          sessionsCsv(data.sessions, data.index, data.disciplineIndex),
          'text/csv',
        )
      }
    />
  )
}
