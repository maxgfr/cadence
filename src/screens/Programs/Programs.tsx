import { ClipboardList, LayoutTemplate, PencilLine, Sparkles } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { useDraft } from '../../app/drafts.tsx'
import { newId } from '../../core/model/ids.ts'
import { completedDays, totalDays } from '../../core/model/program.ts'
import type { Program } from '../../core/model/schemas.ts'
import { programAdherence } from '../../core/stats/trends.ts'
import { Meter } from '../../ui/charts/Meter.tsx'
import { DISCIPLINE_LABEL } from '../../ui/components/Discipline.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import styles from './Programs.module.css'

const SOURCE: Record<Program['source'], string> = {
  manual: 'Your own',
  template: 'Template',
  ai: 'AI draft, edited by you',
}

export function programLine(p: Program): string {
  const days = Math.max(...p.weeks.map((w) => w.days.length))
  return `${p.weeks.length} ${p.weeks.length === 1 ? 'week' : 'weeks'} · ${days} days a week · ${p.disciplines.map((d) => DISCIPLINE_LABEL[d]).join(', ')}`
}

export function blankProgram(): Program {
  const at = new Date().toISOString()
  return {
    id: newId(),
    name: 'New program',
    goal: '',
    disciplines: ['strength'],
    weeks: [
      { id: newId(), name: 'Week 1', days: [{ id: newId(), name: 'Day 1', discipline: 'strength', blocks: [] }] },
    ],
    source: 'manual',
    createdAt: at,
    updatedAt: at,
  }
}

export function Programs() {
  const data = useData()
  const ai = useAi()
  const { setDraft } = useDraft()
  const [, navigate] = useLocation()
  const active = data.programs.find((p) => p.id === data.settings.activeProgramId)
  const others = data.programs.filter((p) => p.id !== active?.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const adherence = active ? programAdherence(data.sessions, active.id) : undefined

  return (
    <Screen title="Programs">
      {active && (
        <Link href={`/programs/${active.id}`} className={styles.current}>
          <span className={styles.currentName}>{active.name}</span>
          <span className={styles.currentLine}>
            <span className={styles.currentLabel}>Current program</span> · {programLine(active)}
          </span>
          <Meter
            fraction={completedDays(active, data.sessions) / Math.max(1, totalDays(active))}
            label={`${completedDays(active, data.sessions)} of ${totalDays(active)} sessions done`}
          />
          <span className={styles.currentLine}>
            {completedDays(active, data.sessions)} of {totalDays(active)} sessions done
            {data.settings.mode === 'advanced' &&
              adherence !== undefined &&
              ` · ${Math.round(adherence * 100)}% of planned sets`}
          </span>
        </Link>
      )}

      <ListGroup title="New program">
        <ListRow
          leading={<LayoutTemplate size={20} strokeWidth={1.75} />}
          title="Start from a template"
          subtitle="Full body, 5/3/1-style strength, 100 m sprint, 1500 m swim"
          href="/programs/templates"
        />
        {ai.ready ? (
          <ListRow
            leading={<Sparkles size={20} strokeWidth={1.75} />}
            title="Design with AI"
            subtitle="From a few questions, or from your own history"
            href="/programs/generate"
          />
        ) : (
          <ListRow
            leading={<Sparkles size={20} strokeWidth={1.75} />}
            title="Design with AI (optional)"
            subtitle="Add your own model and key in Settings first"
            href="/settings/ai"
          />
        )}
        <ListRow
          leading={<PencilLine size={20} strokeWidth={1.75} />}
          title="Write your own"
          subtitle="Weeks, days and exercises, all editable"
          onClick={() => {
            setDraft({ program: blankProgram(), newExercises: [], notes: [], origin: 'new' })
            navigate('/programs/draft')
          }}
          chevron
        />
      </ListGroup>

      {others.length > 0 && (
        <ListGroup title={active ? 'Other programs' : 'Your programs'}>
          {others.map((p) => (
            <ListRow
              key={p.id}
              leading={<ClipboardList size={20} strokeWidth={1.75} />}
              title={p.name}
              subtitle={`${programLine(p)} · ${SOURCE[p.source]}`}
              href={`/programs/${p.id}`}
            />
          ))}
        </ListGroup>
      )}
    </Screen>
  )
}
