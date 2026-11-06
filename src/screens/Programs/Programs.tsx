import { CalendarRange, Repeat, Sparkles } from 'lucide-react'
import { useLocation } from 'wouter'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { useDraft } from '../../app/drafts.tsx'
import { useT } from '../../app/i18n.tsx'
import type { Messages } from '../../core/i18n/index.ts'
import { newId } from '../../core/model/ids.ts'
import { isSessionSet, programDisciplines } from '../../core/model/program.ts'
import type { Program, ProgramLayout } from '../../core/model/schemas.ts'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'

export function programLine(p: Program, name: (id: string) => string | undefined, t: Messages): string {
  const days = Math.max(...p.weeks.map((w) => w.days.length))
  const disciplines = programDisciplines(p)
    .map(name)
    .filter((n): n is string => n !== undefined)
  return [
    ...(isSessionSet(p)
      ? [t.programs.sessionsAnyOrder(days)]
      : [t.programs.weeks(p.weeks.length), t.programs.daysAWeek(days)]),
    ...(disciplines.length > 0 ? [disciplines.join(', ')] : []),
  ].join(' · ')
}

export function blankProgram(layout: ProgramLayout, t: Messages): Program {
  const at = new Date().toISOString()
  const sessions = layout === 'sessions'
  return {
    id: newId(),
    name: sessions ? t.programs.mySessions : t.programs.newProgram,
    goal: '',
    ...(sessions ? { layout } : {}),
    weeks: [
      {
        id: newId(),
        name: t.programs.weekN(1),
        days: [{ id: newId(), name: sessions ? t.programs.sessionN(1) : t.programs.dayN(1), blocks: [] }],
      },
    ],
    source: 'manual',
    createdAt: at,
    updatedAt: at,
  }
}

export function Programs() {
  const data = useData()
  const ai = useAi()
  const t = useT()
  const { setDraft } = useDraft()
  const [, navigate] = useLocation()
  // Every program, the latest edited first.
  const all = [...data.programs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const dname = (id: string) => data.disciplineIndex.get(id)?.name
  const write = (layout: ProgramLayout) => {
    setDraft({ program: blankProgram(layout, t), newExercises: [], newDisciplines: [], notes: [], origin: 'new' })
    navigate('/programs/draft')
  }

  return (
    <Screen title={t.programs.title}>
      {all.length > 0 && (
        <ListGroup title={t.programs.yourPrograms(all.length)}>
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
              subtitle={`${programLine(p, dname, t)} · ${t.programs.source[p.source]}`}
              href={`/programs/${p.id}`}
            />
          ))}
        </ListGroup>
      )}

      <ListGroup title={t.programs.newProgram}>
        {ai.ready ? (
          <ListRow
            leading={<Sparkles size={20} strokeWidth={1.75} />}
            title={t.programs.designWithAi}
            subtitle={t.programs.designWithAiSub}
            href="/programs/generate"
          />
        ) : (
          <ListRow
            leading={<Sparkles size={20} strokeWidth={1.75} />}
            title={t.programs.designWithAiOptional}
            subtitle={t.programs.designWithAiSetup}
            href="/settings/ai"
          />
        )}
        <ListRow
          leading={<Repeat size={20} strokeWidth={1.75} />}
          title={t.programs.setOfSessionsTitle}
          subtitle={t.programs.setOfSessionsSub}
          onClick={() => write('sessions')}
          chevron
        />
        <ListRow
          leading={<CalendarRange size={20} strokeWidth={1.75} />}
          title={t.programs.weekPlanTitle}
          subtitle={t.programs.weekPlanSub}
          onClick={() => write('weeks')}
          chevron
        />
      </ListGroup>
    </Screen>
  )
}
