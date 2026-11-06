import { namespace, plural, pluralFr } from '../define.ts'

/** What the charts say for themselves: accessible names, tooltips, legends. */
export const charts = namespace(
  {
    weekOf: (week: string) => `Week of ${week}`,
    weekOfSoFar: (week: string) => `Week of ${week} (so far)`,
    lineLabel: (label: string, n: number, from: string, to: string) => `${label}: ${n} values from ${from} to ${to}`,
    record: 'record',
    trainingDays: (days: number, weeks: number) => `${days} training days in the last ${weeks} weeks`,
    dayTitle: (day: string, what: string) => `${day}: ${what}`,
    rest: 'rest',
    day: (sessions: number, minutes: string) =>
      `${sessions} ${sessions === 1 ? 'session' : 'sessions'}, ${minutes} min`,
    legendRest: 'Rest',
    legendLong: 'Long day',
  },
  {
    weekOf: (week: string) => `Semaine du ${week}`,
    weekOfSoFar: (week: string) => `Semaine du ${week} (en cours)`,
    lineLabel: (label: string, n: number, from: string, to: string) =>
      `${label} : ${n} ${pluralFr(n, 'valeur', 'valeurs')} de ${from} à ${to}`,
    record: 'record',
    trainingDays: (days: number, weeks: number) =>
      `${days} ${pluralFr(days, 'jour', 'jours')} d’entraînement sur les ${weeks} dernières semaines`,
    dayTitle: (day: string, what: string) => `${day} : ${what}`,
    rest: 'repos',
    day: (sessions: number, minutes: string) =>
      `${sessions} ${pluralFr(sessions, 'séance', 'séances')}, ${minutes} min`,
    legendRest: 'Repos',
    legendLong: 'Longue journée',
  },
  {
    weekOf: (week: string) => `Woche ab ${week}`,
    weekOfSoFar: (week: string) => `Woche ab ${week} (bisher)`,
    lineLabel: (label: string, n: number, from: string, to: string) =>
      `${label}: ${n} ${plural(n, 'Wert', 'Werte')} von ${from} bis ${to}`,
    record: 'Rekord',
    trainingDays: (days: number, weeks: number) =>
      `${days} ${plural(days, 'Trainingstag', 'Trainingstage')} in den letzten ${weeks} Wochen`,
    dayTitle: (day: string, what: string) => `${day}: ${what}`,
    rest: 'Ruhetag',
    day: (sessions: number, minutes: string) =>
      `${sessions} ${plural(sessions, 'Einheit', 'Einheiten')}, ${minutes} Min.`,
    legendRest: 'Ruhe',
    legendLong: 'Langer Tag',
  },
)
