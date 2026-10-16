import { TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearch } from 'wouter'
import { useData } from '../../app/data.tsx'
import { addDays, formatDay, formatShortDay } from '../../core/model/dates.ts'
import type { Muscle } from '../../core/model/schemas.ts'
import { formatDistance, formatTonnage } from '../../core/model/units.ts'
import { exerciseSeries, lowerIsBetter, measureOf, trainedExercises } from '../../core/stats/metrics.ts'
import { currentRecords, recordHistory } from '../../core/stats/records.ts'
import { consistency, programAdherence, weeklyVolume, weekStreak } from '../../core/stats/trends.ts'
import { BarChart } from '../../ui/charts/BarChart.tsx'
import { Heatmap } from '../../ui/charts/Heatmap.tsx'
import { LineChart } from '../../ui/charts/LineChart.tsx'
import { buttonClass } from '../../ui/components/Button.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { Segmented } from '../../ui/components/Segmented.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { formatMeasure, MEASURE_LABEL, useUnits } from '../../ui/units.ts'
import { GoalsSection } from './Goals.tsx'
import styles from './Progress.module.css'

type VolumeKind = 'strength' | 'swim' | 'run'

const MUSCLE_LABEL: Record<Muscle, string> = {
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  core: 'Core',
  full_body: 'Full body',
}

export function Progress() {
  const data = useData()
  const units = useUnits()
  const search = useSearch()
  const params = new URLSearchParams(search)
  const advanced = data.settings.mode === 'advanced'
  const done = data.sessions.filter((s) => s.status === 'done')
  const trained = useMemo(() => trainedExercises(data.sessions, data.index), [data.sessions, data.index])
  // A link (a record, an exercise) picks the exercise; the select then takes over until the next link.
  const [picked, setExerciseId] = useState<{ id: string; search: string }>()
  const exerciseId = picked?.search === search ? picked.id : (params.get('exercise') ?? '')
  const exercise = data.index.get(exerciseId) ?? trained[0]
  const records = useMemo(() => recordHistory(data.sessions, data.index), [data.sessions, data.index])
  const best = useMemo(() => currentRecords(data.sessions, data.index), [data.sessions, data.index])
  const volume = useMemo(
    () => weeklyVolume(data.sessions, data.index, data.today, data.settings.weekStart, 12),
    [data.sessions, data.index, data.today, data.settings.weekStart],
  )
  const kinds: VolumeKind[] = (['strength', 'swim', 'run'] as const).filter((k) =>
    volume.some((w) => (k === 'strength' ? w.tonnage : k === 'swim' ? w.swimMeters : w.runMeters) > 0),
  )
  const [volumeKind, setVolumeKind] = useState<VolumeKind>('strength')
  const vk = kinds.includes(volumeKind) ? volumeKind : (kinds[0] ?? 'strength')
  const startGoal = params.get('goal') === 'new'

  if (done.length === 0) {
    return (
      <Screen title="Progress">
        <EmptyState
          icon={TrendingUp}
          title="Nothing to chart yet"
          body="Records, charts and your training calendar appear here after your first logged session."
          action={
            <Link href="/" className={buttonClass({ variant: 'primary' })}>
              Go to Today
            </Link>
          }
        />
        <GoalsSection startOpen={startGoal} />
      </Screen>
    )
  }

  const series = exercise ? exerciseSeries(data.sessions, exercise) : []
  const recordSessions = new Set(records.filter((r) => r.exerciseId === exercise?.id).map((r) => r.sessionId))
  const kind = exercise ? measureOf(exercise) : 'e1rm'
  const fmt = (v: number) => formatMeasure(kind, v, units, exercise)
  const firstV = series[0]?.value
  const lastV = series[series.length - 1]?.value
  const bestV =
    series.length > 0
      ? lowerIsBetter(kind)
        ? Math.min(...series.map((p) => p.value))
        : Math.max(...series.map((p) => p.value))
      : undefined
  const heat = consistency(data.sessions, data.today, data.settings.weekStart, 16)
  const streak = weekStreak(data.sessions, data.today, data.settings.weekStart)
  const activeProgram = data.programs.find((p) => p.id === data.settings.activeProgramId)
  const adherence = activeProgram ? programAdherence(data.sessions, activeProgram.id) : undefined
  const thisWeek = volume[volume.length - 1]
  const prior = volume.slice(-5, -1)
  const muscles = (Object.keys(MUSCLE_LABEL) as Muscle[])
    .map((m) => ({
      m,
      now: thisWeek?.setsByMuscle[m] ?? 0,
      avg: prior.reduce((n, w) => n + (w.setsByMuscle[m] ?? 0), 0) / Math.max(1, prior.length),
    }))
    .filter((r) => r.now > 0 || r.avg > 0)

  return (
    <Screen title="Progress" subtitle={`${done.length} ${done.length === 1 ? 'session' : 'sessions'} logged`}>
      <section className={styles.section} aria-labelledby="calendar-title">
        <div className={styles.sectionHead}>
          <h2 id="calendar-title" className={styles.sectionTitle}>
            Training calendar
          </h2>
          <p className={styles.sectionMeta}>
            {streak > 0 ? `${streak} ${streak === 1 ? 'week' : 'weeks'} in a row` : 'No session this week yet'}
          </p>
        </div>
        <div className={styles.panel}>
          <Heatmap days={heat} weekStart={data.settings.weekStart} />
        </div>
      </section>

      {exercise && (
        <section className={styles.section} aria-labelledby="exercise-title">
          <h2 id="exercise-title" className={styles.sectionTitle}>
            By exercise
          </h2>
          <div className={styles.panel}>
            <SelectField
              label="Exercise"
              hideLabel
              value={exercise.id}
              options={trained.map((e) => ({ value: e.id, label: e.name }))}
              onChange={(e) => setExerciseId({ id: e.target.value, search })}
            />
            <dl className={styles.figures}>
              <div>
                <dt>{MEASURE_LABEL[kind]}</dt>
                <dd>{bestV !== undefined ? fmt(bestV) : '–'}</dd>
              </div>
              <div>
                <dt>Latest</dt>
                <dd>{lastV !== undefined ? fmt(lastV) : '–'}</dd>
              </div>
              <div>
                <dt>Sessions</dt>
                <dd>{series.length}</dd>
              </div>
            </dl>
            {series.length > 1 ? (
              <LineChart
                label={`${exercise.name}, ${MEASURE_LABEL[kind].toLowerCase()} per session`}
                points={series.map((p) => ({ ...p, record: recordSessions.has(p.sessionId) }))}
                format={fmt}
              />
            ) : (
              <p className={styles.hint}>One more session of {exercise.name} and the trend appears here.</p>
            )}
            {series.length > 1 && firstV !== undefined && lastV !== undefined && (
              <p className={styles.hint}>
                From {fmt(firstV)} on {formatShortDay(series[0]?.date ?? '')} to {fmt(lastV)}. Orange points set a
                record.
              </p>
            )}
            <details className={styles.table}>
              <summary>Show values</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">{MEASURE_LABEL[kind]}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((p) => (
                    <tr key={p.sessionId}>
                      <td>
                        <Link href={`/history/${p.sessionId}`}>{formatDay(p.date, new Date().getFullYear())}</Link>
                      </td>
                      <td>
                        {fmt(p.value)}
                        {recordSessions.has(p.sessionId) ? ' · record' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </section>
      )}

      {kinds.length > 0 && (
        <section className={styles.section} aria-labelledby="volume-title">
          <h2 id="volume-title" className={styles.sectionTitle}>
            Weekly volume
          </h2>
          <div className={styles.panel}>
            {kinds.length > 1 && (
              <Segmented
                label="Volume of"
                hideLabel
                options={kinds.map((k) => ({
                  value: k,
                  label: k === 'strength' ? 'Gym' : k === 'swim' ? 'Swim' : 'Track',
                }))}
                value={vk}
                onChange={setVolumeKind}
              />
            )}
            <BarChart
              label={`Weekly ${vk === 'strength' ? 'tonnage' : vk === 'swim' ? 'swim distance' : 'run distance'}, last 12 weeks`}
              bars={volume.map((w, i) => ({
                key: w.week,
                label: formatShortDay(w.week),
                value: vk === 'strength' ? w.tonnage : vk === 'swim' ? w.swimMeters : w.runMeters,
                partial: i === volume.length - 1,
              }))}
              format={(v) =>
                vk === 'strength' ? formatTonnage(v, units.weightUnit) : formatDistance(v, units.distanceUnit)
              }
            />
            <p className={styles.hint}>
              {vk === 'strength'
                ? 'Weight × reps of every ticked set on loaded lifts.'
                : 'Distance of every ticked set.'}{' '}
              The last bar is this week so far.
            </p>
          </div>
        </section>
      )}

      {advanced && (muscles.length > 0 || adherence !== undefined) && (
        <section className={styles.section} aria-labelledby="load-title">
          <h2 id="load-title" className={styles.sectionTitle}>
            Training load
          </h2>
          <div className={styles.panel}>
            {adherence !== undefined && activeProgram && (
              <p className={styles.adherence}>
                <strong>{Math.round(adherence * 100)}%</strong> of planned sets done in {activeProgram.name}
              </p>
            )}
            {muscles.length > 0 && (
              <table className={styles.muscles}>
                <caption>Hard sets per muscle group</caption>
                <thead>
                  <tr>
                    <th scope="col">Muscle</th>
                    <th scope="col">This week</th>
                    <th scope="col">4-week average</th>
                  </tr>
                </thead>
                <tbody>
                  {muscles.map((r) => (
                    <tr key={r.m}>
                      <th scope="row">{MUSCLE_LABEL[r.m]}</th>
                      <td>{r.now}</td>
                      <td>{Math.round(r.avg * 10) / 10}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      <ListGroup title="Records">
        {best.slice(0, 12).map((r) => {
          const ex = data.index.get(r.exerciseId)
          const fresh = r.date >= addDays(data.today, -7)
          return (
            <ListRow
              key={r.exerciseId}
              title={ex?.name ?? r.exerciseId}
              subtitle={`${MEASURE_LABEL[r.kind]} · ${formatDay(r.date, new Date().getFullYear())}${fresh ? ' · new this week' : ''}`}
              trailing={<span className={styles.recordValue}>{formatMeasure(r.kind, r.value, units, ex)}</span>}
              onClick={() => setExerciseId({ id: r.exerciseId, search })}
              chevron={false}
            />
          )
        })}
      </ListGroup>

      <GoalsSection startOpen={startGoal} />
    </Screen>
  )
}
