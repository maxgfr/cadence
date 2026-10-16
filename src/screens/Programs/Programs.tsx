import { CalendarRange, Repeat, Sparkles } from 'lucide-react'
import { useLocation } from 'wouter'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { useDraft } from '../../app/drafts.tsx'
import { newId } from '../../core/model/ids.ts'
import { isSessionSet, programDisciplines } from '../../core/model/program.ts'
import type { Program, ProgramLayout } from '../../core/model/schemas.ts'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'

const SOURCE: Record<Program['source'], string> = {
  manual: 'Your own',
  template: 'Template',
  ai: 'AI draft, edited by you',
}

export function programLine(p: Program, name: (id: string) => string | undefined): string {
  const days = Math.max(...p.weeks.map((w) => w.days.length))
  const disciplines = programDisciplines(p)
    .map(name)
    .filter((n): n is string => n !== undefined)
  return [
    ...(isSessionSet(p)
      ? [`${days} ${days === 1 ? 'session' : 'sessions'}, in any order`]
      : [
          `${p.weeks.length} ${p.weeks.length === 1 ? 'week' : 'weeks'}`,
          `${days} ${days === 1 ? 'day' : 'days'} a week`,
        ]),
    ...(disciplines.length > 0 ? [disciplines.join(', ')] : []),
  ].join(' · ')
}

export function blankProgram(layout: ProgramLayout): Program {
  const at = new Date().toISOString()
  const sessions = layout === 'sessions'
  return {
    id: newId(),
    name: sessions ? 'My sessions' : 'New program',
    goal: '',
    ...(sessions ? { layout } : {}),
    weeks: [
      { id: newId(), name: 'Week 1', days: [{ id: newId(), name: sessions ? 'Session 1' : 'Day 1', blocks: [] }] },
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
  // Every program, the latest edited first.
  const all = [...data.programs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const dname = (id: string) => data.disciplineIndex.get(id)?.name
  const write = (layout: ProgramLayout) => {
    setDraft({ program: blankProgram(layout), newExercises: [], newDisciplines: [], notes: [], origin: 'new' })
    navigate('/programs/draft')
  }

  return (
    <Screen title="Programs">
      {all.length > 0 && (
        <ListGroup title={`Your programs (${all.length})`}>
          {all.map((p) => (
            <ListRow
              key={p.id}
              leading={
                isSessionSet(p) ? (
                  <Repeat size={20} strokeWidth={1.75} />
                ) : (
                  <CalendarRange size={20} strokeWidth={1.75} />
                )
              }
              title={p.name}
              subtitle={`${programLine(p, dname)} · ${SOURCE[p.source]}`}
              href={`/programs/${p.id}`}
            />
          ))}
        </ListGroup>
      )}

      <ListGroup title="New program">
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
          leading={<Repeat size={20} strokeWidth={1.75} />}
          title="A set of sessions"
          subtitle="Leg day, Upper body, Bodyweight… done in any order, again and again"
          onClick={() => write('sessions')}
          chevron
        />
        <ListRow
          leading={<CalendarRange size={20} strokeWidth={1.75} />}
          title="A week-by-week plan"
          subtitle="Weeks of days that progress to an end, all editable"
          onClick={() => write('weeks')}
          chevron
        />
      </ListGroup>
    </Screen>
  )
}
