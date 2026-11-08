import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useCoachScreen } from '../../app/coach.tsx'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import { formatShortDay, todayIso } from '../../core/model/dates.ts'
import { newId } from '../../core/model/ids.ts'
import type { Note } from '../../core/model/schemas.ts'
import { Button } from '../../ui/components/Button.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { TextArea } from '../../ui/components/TextArea.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import styles from './Notes.module.css'

const MAX = 5000
const changedAt = (n: Note) => n.updatedAt ?? n.createdAt

/** Free notes, the latest changed first. Each is its own record, so notes written on two devices all stay. */
export function Notes() {
  const data = useData()
  const t = useT()
  const m = t.notes
  useCoachScreen({ where: 'their free notes' })
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<Note | null>(null)
  const notes = [...data.notes].sort((a, b) => changedAt(b).localeCompare(changedAt(a)))

  return (
    <Screen title={m.title}>
      <form
        className={styles.compose}
        onSubmit={async (e) => {
          e.preventDefault()
          const value = text.trim()
          if (!value) return
          await data.put('notes', { id: newId(), text: value, createdAt: new Date().toISOString() })
          setText('')
        }}
      >
        <TextArea
          label={m.newNote}
          placeholder={m.placeholder}
          rows={3}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={!text.trim()}>
          {m.add}
        </Button>
      </form>

      {notes.length === 0 ? (
        <p className={styles.empty}>{m.empty}</p>
      ) : (
        <ol className={styles.list}>
          {notes.map((n) => (
            <li key={n.id}>
              <button type="button" className={styles.note} onClick={() => setEditing(n)}>
                <span className={styles.text}>{n.text}</span>
                <span className={styles.date}>{m.updatedOn(formatShortDay(todayIso(new Date(changedAt(n)))))}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <Sheet open={editing !== null} title={m.edit} onClose={() => setEditing(null)}>
        {editing && <EditNote key={editing.id} note={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </Screen>
  )
}

function EditNote({ note, onDone }: { note: Note; onDone: () => void }) {
  const data = useData()
  const t = useT()
  const toast = useToast()
  const [text, setText] = useState(note.text)
  return (
    <form
      className={styles.compose}
      onSubmit={async (e) => {
        e.preventDefault()
        const value = text.trim()
        if (!value) return
        await data.put('notes', { ...note, text: value })
        toast(t.notes.saved)
        onDone()
      }}
    >
      <TextArea label={t.notes.text} rows={8} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} />
      <Button type="submit" variant="primary" size="large" full disabled={!text.trim()}>
        {t.common.save}
      </Button>
      <Button
        variant="danger"
        full
        icon={<Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />}
        onClick={async () => {
          await data.remove('notes', note.id)
          toast(t.notes.deleted, [{ label: t.forms.undo, onClick: () => data.put('notes', note) }])
          onDone()
        }}
      >
        {t.common.delete}
      </Button>
    </form>
  )
}
