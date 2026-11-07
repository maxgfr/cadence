import { Target, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { useCoachScreen } from '../../app/coach.tsx'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { formatDecimal } from '../../core/i18n/locale.ts'
import { addDays, formatDay, formatShortDay, startOfWeek } from '../../core/model/dates.ts'
import { programsUnderWay } from '../../core/model/program.ts'
import { MUSCLES } from '../../core/model/schemas.ts'
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
import { formatMeasure, useUnits } from '../../ui/units.ts'
import { ExportCsvButton, HistoryList } from '../History/History.tsx'
import { GoalsSection } from './Goals.tsx'
import styles from './Progress.module.css'

type View = 'overview' | 'history'

/** Progress: the charts, records and goals (Overview), and every session logged (History). */
export function Progress() {
  const data = useData()
  const t = useT()
  useCoachScreen({
    where: 'Progress: their goals, records and history',
    starters: [t.coach.starters.goals, t.coach.starters.howAmIDoing],
  })
  const [, navigate] = useLocation()
  const view: View = new URLSearchParams(useSearch()).get('view') === 'history' ? 'history' : 'overview'
  const done = data.sessions.filter((s) => s.status === 'done').length
  return (
    <Screen
      title={t.progress.title}
      subtitle={done > 0 ? t.progress.sessionsLogged(done) : undefined}
      trailing={view === 'history' && done > 0 ? <ExportCsvButton /> : undefined}
    >
      <Segmented
        label={t.progress.view}
        hideLabel
        options={[
          { value: 'overview', label: t.progress.overview },
          { value: 'history', label: t.progress.history },
        ]}
        value={view}
        onChange={(v) => navigate(v === 'history' ? '/progress?view=history' : '/progress', { replace: true })}
      />
      {view === 'history' ? <HistoryList /> : <Overview />}
    </Screen>
  )
}

function Overview() {
  const data = useData()
  const t = useT()
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
  // One series per discipline and measure that has data: kilograms lifted, distance covered.
  const volumeSeries = useMemo(() => {
    const out: {
      key: string
      label: string
      measure: 'tonnage' | 'distance'
      value: (w: (typeof volume)[number]) => number
    }[] = []
    const scopes = [
      ...data.disciplines.map((d) => ({ id: d.id, name: d.name })),
      { id: '', name: t.common.noDiscipline },
    ]
    for (const sc of scopes) {
      const kg = (w: (typeof volume)[number]) => w.byDiscipline[sc.id]?.tonnage ?? 0
      const m = (w: (typeof volume)[number]) => w.byDiscipline[sc.id]?.meters ?? 0
      const hasT = volume.some((w) => kg(w) > 0)
      const hasM = volume.some((w) => m(w) > 0)
      if (hasT)
        out.push({
          key: `${sc.id}|t`,
          label: hasM ? t.progress.seriesKg(sc.name) : sc.name,
          measure: 'tonnage',
          value: kg,
        })
      if (hasM)
        out.push({
          key: `${sc.id}|m`,
          label: hasT ? t.progress.seriesDistance(sc.name) : sc.name,
          measure: 'distance',
          value: m,
        })
    }
    return out
  }, [volume, data.disciplines, t])
  const [volumeKey, setVolumeKey] = useState('')
  const vs = volumeSeries.find((x) => x.key === volumeKey) ?? volumeSeries[0]

  if (done.length === 0) {
    return (
      <>
        <EmptyState
          icon={TrendingUp}
          title={t.progress.emptyTitle}
          body={t.progress.emptyBody}
          action={
            <Link href="/" className={buttonClass({ variant: 'primary' })}>
              {t.progress.goToToday}
            </Link>
          }
        />
        <GoalsSection />
      </>
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
  const adherence = programsUnderWay(data.programs, data.sessions, startOfWeek(data.today, data.settings.weekStart))
    .map(({ program }) => ({ program, value: programAdherence(data.sessions, program.id) }))
    .filter((a): a is { program: typeof a.program; value: number } => a.value !== undefined)
  const thisWeek = volume[volume.length - 1]
  const prior = volume.slice(-5, -1)
  const muscles = MUSCLES.map((m) => ({
    m,
    now: thisWeek?.setsByMuscle[m] ?? 0,
    avg: prior.reduce((n, w) => n + (w.setsByMuscle[m] ?? 0), 0) / Math.max(1, prior.length),
  })).filter((r) => r.now > 0 || r.avg > 0)

  return (
    <>
      <section className={styles.section} aria-labelledby="calendar-title">
        <div className={styles.sectionHead}>
          <h2 id="calendar-title" className={styles.sectionTitle}>
            {t.progress.calendar}
          </h2>
          <p className={styles.sectionMeta}>
            {streak > 0 ? t.progress.weeksInRow(streak) : t.progress.noSessionThisWeek}
          </p>
        </div>
        <div className={styles.panel}>
          <Heatmap days={heat} weekStart={data.settings.weekStart} />
        </div>
      </section>

      <GoalsSection />

      {exercise && (
        <section className={styles.section} aria-labelledby="exercise-title">
          <h2 id="exercise-title" className={styles.sectionTitle}>
            {t.progress.byExercise}
          </h2>
          <div className={styles.panel}>
            <SelectField
              label={t.common.exercise}
              hideLabel
              value={exercise.id}
              options={trained.map((e) => ({ value: e.id, label: e.name }))}
              onChange={(e) => setExerciseId({ id: e.target.value, search })}
            />
            <dl className={styles.figures}>
              <div>
                <dt>{t.labels.measure[kind]}</dt>
                <dd>{bestV !== undefined ? fmt(bestV) : '–'}</dd>
              </div>
              <div>
                <dt>{t.progress.latest}</dt>
                <dd>{lastV !== undefined ? fmt(lastV) : '–'}</dd>
              </div>
              <div>
                <dt>{t.progress.sessions}</dt>
                <dd>{series.length}</dd>
              </div>
            </dl>
            {series.length > 1 ? (
              <LineChart
                label={t.progress.exerciseChart(exercise.name, t.labels.measure[kind])}
                points={series.map((p) => ({ ...p, record: recordSessions.has(p.sessionId) }))}
                format={fmt}
              />
            ) : (
              <p className={styles.hint}>{t.progress.oneMore(exercise.name)}</p>
            )}
            {series.length > 1 && firstV !== undefined && lastV !== undefined && (
              <p className={styles.hint}>
                {t.progress.fromTo(fmt(firstV), formatShortDay(series[0]?.date ?? ''), fmt(lastV))}
              </p>
            )}
            <Link href={`/progress?goal=new&exercise=${exercise.id}`} className={buttonClass({ variant: 'secondary' })}>
              <Target size={18} strokeWidth={1.75} aria-hidden="true" />
              {t.progress.setGoalOn(exercise.name)}
            </Link>
            <details className={styles.table}>
              <summary>{t.progress.showValues}</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t.common.date}</th>
                    <th scope="col">{t.labels.measure[kind]}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((p) => (
                    <tr key={p.sessionId}>
                      <td>
                        <Link href={`/progress/sessions/${p.sessionId}`}>
                          {formatDay(p.date, new Date().getFullYear())}
                        </Link>
                      </td>
                      <td>
                        {fmt(p.value)}
                        {recordSessions.has(p.sessionId) ? ` · ${t.progress.record}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </section>
      )}

      {vs && (
        <section className={styles.section} aria-labelledby="volume-title">
          <h2 id="volume-title" className={styles.sectionTitle}>
            {t.progress.weeklyVolume}
          </h2>
          <div className={styles.panel}>
            {volumeSeries.length > 1 && volumeSeries.length <= 3 && (
              <Segmented
                label={t.progress.volumeOf}
                hideLabel
                options={volumeSeries.map((x) => ({ value: x.key, label: x.label }))}
                value={vs.key}
                onChange={setVolumeKey}
              />
            )}
            {volumeSeries.length > 3 && (
              <SelectField
                label={t.progress.volumeOf}
                hideLabel
                value={vs.key}
                options={volumeSeries.map((x) => ({ value: x.key, label: x.label }))}
                onChange={(e) => setVolumeKey(e.target.value)}
              />
            )}
            <BarChart
              label={vs.measure === 'tonnage' ? t.progress.tonnageChart(vs.label) : t.progress.distanceChart(vs.label)}
              bars={volume.map((w, i) => ({
                key: w.week,
                label: formatShortDay(w.week),
                value: vs.value(w),
                partial: i === volume.length - 1,
              }))}
              format={(v) =>
                vs.measure === 'tonnage' ? formatTonnage(v, units.weightUnit) : formatDistance(v, units.distanceUnit)
              }
            />
            <p className={styles.hint}>
              {vs.measure === 'tonnage' ? t.progress.tonnageHint : t.progress.distanceHint} {t.progress.lastBarHint}
            </p>
          </div>
        </section>
      )}

      {advanced && (muscles.length > 0 || adherence.length > 0) && (
        <section className={styles.section} aria-labelledby="load-title">
          <h2 id="load-title" className={styles.sectionTitle}>
            {t.progress.trainingLoad}
          </h2>
          <div className={styles.panel}>
            {adherence.map((a) => (
              <p key={a.program.id} className={styles.adherence}>
                <strong>{t.progress.percent(Math.round(a.value * 100))}</strong> {t.progress.adherence(a.program.name)}
              </p>
            ))}
            {muscles.length > 0 && (
              <table className={styles.muscles}>
                <caption>{t.progress.hardSets}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.progress.muscle}</th>
                    <th scope="col">{t.progress.thisWeek}</th>
                    <th scope="col">{t.progress.fourWeekAverage}</th>
                  </tr>
                </thead>
                <tbody>
                  {muscles.map((r) => (
                    <tr key={r.m}>
                      <th scope="row">{t.labels.muscle[r.m]}</th>
                      <td>{r.now}</td>
                      <td>{formatDecimal(r.avg, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      <ListGroup title={t.progress.records}>
        {best.slice(0, 12).map((r) => {
          const ex = data.index.get(r.exerciseId)
          const fresh = r.date >= addDays(data.today, -7)
          return (
            <ListRow
              key={r.exerciseId}
              title={ex?.name ?? r.exerciseId}
              subtitle={`${t.labels.measure[r.kind]} · ${formatDay(r.date, new Date().getFullYear())}${fresh ? ` · ${t.progress.newThisWeek}` : ''}`}
              trailing={<span className={styles.recordValue}>{formatMeasure(r.kind, r.value, units, ex)}</span>}
              onClick={() => setExerciseId({ id: r.exerciseId, search })}
              chevron={false}
            />
          )
        })}
      </ListGroup>
    </>
  )
}
