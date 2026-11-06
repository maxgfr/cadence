import { namespace, plural, pluralFr } from '../define.ts'

/** Text the core writes: block descriptions, default session titles, backup errors. */
export const core = namespace(
  {
    reps: (n: number) => plural(n, `${n} rep`, `${n} reps`),
    rest: (time: string) => `rest ${time}`,
    tempo: (tempo: string) => `tempo ${tempo}`,
    pctMax: (pct: string) => `${pct}% max`,
    week: (n: number) => `Week ${n}`,
    disciplineSession: (discipline: string) => `${discipline} session`,
    session: 'Session',
    backup: {
      notJson: 'This file is not JSON.',
      notCadence: 'This file is not a Cadence backup.',
      version: (version: string) =>
        `This backup uses format version ${version}, which this version of Cadence cannot read.`,
      damagedV1: 'The backup is damaged (its version 1 records could not be read).',
      damaged: (detail: string) => `The backup is damaged${detail ? ` (${detail})` : ''}.`,
    },
    secretNotStored: 'This secret could not be stored on this device.',
  },
  {
    reps: (n: number) => pluralFr(n, `${n} rép.`, `${n} rép.`),
    rest: (time: string) => `récup ${time}`,
    tempo: (tempo: string) => `tempo ${tempo}`,
    pctMax: (pct: string) => `${pct} % max`,
    week: (n: number) => `Semaine ${n}`,
    disciplineSession: (discipline: string) => `Séance ${discipline}`,
    session: 'Séance',
    backup: {
      notJson: 'Ce fichier n’est pas du JSON.',
      notCadence: 'Ce fichier n’est pas une sauvegarde Cadence.',
      version: (version: string) =>
        `Cette sauvegarde utilise le format ${version}, que cette version de Cadence ne sait pas lire.`,
      damagedV1: 'La sauvegarde est endommagée (ses données de version 1 sont illisibles).',
      damaged: (detail: string) => `La sauvegarde est endommagée${detail ? ` (${detail})` : ''}.`,
    },
    secretNotStored: 'Ce secret n’a pas pu être enregistré sur cet appareil.',
  },
  {
    reps: (n: number) => plural(n, `${n} Wdh.`, `${n} Wdh.`),
    rest: (time: string) => `Pause ${time}`,
    tempo: (tempo: string) => `Tempo ${tempo}`,
    pctMax: (pct: string) => `${pct} % max.`,
    week: (n: number) => `Woche ${n}`,
    disciplineSession: (discipline: string) => `${discipline}-Einheit`,
    session: 'Einheit',
    backup: {
      notJson: 'Diese Datei ist kein JSON.',
      notCadence: 'Diese Datei ist keine Cadence-Sicherung.',
      version: (version: string) =>
        `Diese Sicherung hat das Format ${version}, das diese Cadence-Version nicht lesen kann.`,
      damagedV1: 'Die Sicherung ist beschädigt (ihre Daten der Version 1 sind unlesbar).',
      damaged: (detail: string) => `Die Sicherung ist beschädigt${detail ? ` (${detail})` : ''}.`,
    },
    secretNotStored: 'Dieses Geheimnis konnte auf diesem Gerät nicht gespeichert werden.',
  },
)
