import { Sparkles } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { useDraft } from '../../app/drafts.tsx'
import { describeAiError } from '../../core/ai/client.ts'
import { adjustWeekDraft, generateProgramDraft } from '../../core/ai/features.ts'
import {
  adjustWeekPrompt,
  contextPrompt,
  type ProgramShape,
  type ScratchAnswers,
  scratchPrompt,
  summarizeContext,
} from '../../core/ai/program.ts'
import { addDays } from '../../core/model/dates.ts'
import type { ProgramLayout } from '../../core/model/schemas.ts'
import { Button, buttonClass } from '../../ui/components/Button.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { Segmented } from '../../ui/components/Segmented.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { TextArea } from '../../ui/components/TextArea.tsx'
import { SportsPicker, sportNames } from '../../ui/SportsPicker.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import styles from './Generate.module.css'

type Source = 'scratch' | 'context'

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

export function Generate() {
  const data = useData()
  const ai = useAi()
  const { setDraft } = useDraft()
  const [, navigate] = useLocation()
  const params = new URLSearchParams(useSearch())
  const adjustId = params.get('adjust')
  const adjustWeek = Number.parseInt(params.get('week') ?? '0', 10) || 0
  const adjusting = adjustId ? data.programs.find((p) => p.id === adjustId) : undefined
  const advanced = data.settings.mode === 'advanced'
  const hasHistory = data.sessions.some((s) => s.status === 'done')

  const [source, setSource] = useState<Source>(hasHistory ? 'context' : 'scratch')
  const [picked, setPicked] = useState<string[]>([])
  const [other, setOther] = useState('')
  const sports = sportNames(picked, other, data.disciplineIndex)
  const athlete = { exercises: data.exercises, disciplines: data.disciplines }
  const [level, setLevel] = useState<ScratchAnswers['level']>('beginner')
  const [layout, setLayout] = useState<ProgramLayout>('sessions')
  const [count, setCount] = useState('')
  const [days, setDays] = useState('3')
  const [weeks, setWeeks] = useState('4')
  const shape: ProgramShape =
    layout === 'weeks'
      ? { layout, daysPerWeek: Number(days), weeks: Number(weeks) }
      : { layout, ...(count ? { sessions: Number(count) } : {}) }
  const [goal, setGoal] = useState('')
  const [minutes, setMinutes] = useState('60')
  const [equipment, setEquipment] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [limitations, setLimitations] = useState('')
  const [style, setStyle] = useState<'rpe' | 'pct1rm'>('rpe')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const abort = useRef<AbortController | null>(null)

  const context = useMemo(
    () =>
      summarizeContext({
        sessions: data.sessions,
        goals: data.goals,
        programs: data.programs,
        exercises: data.index,
        disciplines: data.disciplines,
        today: data.today,
        weekStart: data.settings.weekStart,
      }),
    [data.sessions, data.goals, data.programs, data.settings, data.index, data.disciplines, data.today],
  )

  if (!ai.ready) {
    return (
      <Screen title="Design with AI" back={{ href: '/programs', label: 'Programs' }}>
        <EmptyState
          icon={Sparkles}
          title="No AI model set up"
          body="Cadence works fully without AI. To have programs designed for you, add a provider, a model and your own key; requests go straight from this device to that provider."
          action={
            <Link href="/settings/ai" className={buttonClass({ variant: 'primary' })}>
              Set up AI
            </Link>
          }
        />
      </Screen>
    )
  }

  async function run() {
    setError(undefined)
    if (!adjusting && source === 'scratch' && sports.length === 0) {
      setError('Pick or type at least one sport.')
      return
    }
    setBusy(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const model = await ai.model()
      if (adjusting) {
        const pair = adjustWeekPrompt(adjusting, adjustWeek, context, athlete, data.index)
        const d = await adjustWeekDraft(model, pair, adjusting, adjustWeek, athlete, ctrl.signal)
        setDraft({ ...d, origin: 'adjust' })
      } else {
        const pair =
          source === 'scratch'
            ? scratchPrompt(
                {
                  sports,
                  level,
                  shape,
                  goal,
                  ...(advanced
                    ? {
                        sessionMinutes: Number(minutes) || 60,
                        equipment,
                        ...(targetDate ? { targetDate } : {}),
                        limitations,
                        intensityStyle: style,
                        notes,
                      }
                    : {}),
                },
                athlete,
                data.today,
              )
            : contextPrompt({ shape, focus: goal, sports }, context, athlete)
        const d = await generateProgramDraft(model, pair, athlete, ctrl.signal, layout)
        setDraft({ ...d, origin: 'ai' })
      }
      navigate('/programs/draft')
    } catch (e) {
      setError(describeAiError(e))
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  return (
    <Screen
      title={adjusting ? 'Adjust a week' : 'Design with AI'}
      subtitle={`${ai.config.modelId ?? ''} · the result is a draft you edit before saving`}
      back={
        adjusting
          ? { href: `/programs/${adjusting.id}`, label: adjusting.name }
          : { href: '/programs', label: 'Programs' }
      }
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          run()
        }}
      >
        {adjusting ? (
          <p className={styles.lead}>
            Rewrites {adjusting.weeks[adjustWeek]?.name ?? `week ${adjustWeek + 1}`} of {adjusting.name} from what you
            actually logged: missed sets and high effort ease it off, easy sessions progress it.
          </p>
        ) : (
          <>
            <Segmented
              label="Start from"
              hideLabel
              options={[
                { value: 'scratch', label: 'A few questions' },
                { value: 'context', label: 'My history' },
              ]}
              value={source}
              onChange={setSource}
            />
            {source === 'context' && !hasHistory && (
              <p className={styles.warn}>No session is logged yet, so there is little history to plan from.</p>
            )}
            <SportsPicker
              value={picked}
              onChange={setPicked}
              other={other}
              onOther={setOther}
              hint="A sport you do not have yet becomes a new discipline when you save the program."
            />
            {source === 'scratch' && (
              <Segmented
                label="Level"
                options={[
                  { value: 'beginner', label: 'Beginner' },
                  { value: 'intermediate', label: 'Intermediate' },
                  { value: 'advanced', label: 'Advanced' },
                ]}
                value={level}
                onChange={setLevel}
              />
            )}
            <Segmented
              label="Program"
              options={[
                { value: 'sessions', label: 'Set of sessions' },
                { value: 'weeks', label: 'Week by week' },
              ]}
              value={layout}
              onChange={setLayout}
            />
            {layout === 'sessions' ? (
              <SelectField
                label="Sessions"
                value={count}
                hint="Sessions you do in any order, again and again: no days or weeks to plan."
                options={[
                  { value: '', label: 'Let the model choose' },
                  ...range(1, 7).map((n) => ({ value: String(n), label: String(n) })),
                ]}
                onChange={(e) => setCount(e.target.value)}
              />
            ) : (
              <div className={styles.pair}>
                <SelectField
                  label="Days a week"
                  value={days}
                  options={range(1, 7).map((n) => ({ value: String(n), label: String(n) }))}
                  onChange={(e) => setDays(e.target.value)}
                />
                <SelectField
                  label="Weeks"
                  value={weeks}
                  options={range(1, 12).map((n) => ({ value: String(n), label: String(n) }))}
                  onChange={(e) => setWeeks(e.target.value)}
                />
              </div>
            )}
            <TextArea
              label={source === 'scratch' ? 'Goal' : 'Focus'}
              placeholder={
                source === 'scratch'
                  ? 'Squat 100 kg, swim 1500 m without stopping, run 100 m under 13 s…'
                  : 'Keep my squat climbing, add a swim day…'
              }
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={300}
            />
            {advanced && source === 'scratch' && (
              <>
                <div className={styles.pair}>
                  <Field
                    label="Minutes per session"
                    inputMode="numeric"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                  <Field
                    label="Target date"
                    type="date"
                    min={addDays(data.today, 7)}
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                  />
                </div>
                <Field
                  label="Equipment and facilities"
                  placeholder="Full gym, 25 m pool, 400 m track"
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                />
                <Field
                  label="Injuries or limitations"
                  value={limitations}
                  onChange={(e) => setLimitations(e.target.value)}
                />
                <Segmented
                  label="Strength intensity as"
                  options={[
                    { value: 'rpe', label: 'RPE' },
                    { value: 'pct1rm', label: '% of 1RM' },
                  ]}
                  value={style}
                  onChange={setStyle}
                />
                <TextArea
                  label="Anything else"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                />
              </>
            )}
          </>
        )}
        {(adjusting || source === 'context') && (
          <details className={styles.sent}>
            <summary>What is sent to the model</summary>
            <pre>{context}</pre>
          </details>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="large"
          full
          loading={busy}
          icon={<Sparkles size={20} strokeWidth={1.75} aria-hidden="true" />}
        >
          {busy ? 'Writing the program…' : adjusting ? 'Rewrite the week' : 'Design my program'}
        </Button>
        {busy && (
          <>
            <p className={styles.lead} role="status">
              A whole program takes a while to write: often under a minute, several minutes with a model running on this
              computer.
            </p>
            <Button variant="plain" full onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          </>
        )}
      </form>
    </Screen>
  )
}
