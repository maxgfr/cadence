import { namespace, plural, pluralFr } from '../define.ts'

/** The exercise library and the AI that proposes exercises. */
export const exercises = namespace(
  {
    summary: (exercises: number, disciplines: number) =>
      `${exercises} ${plural(exercises, 'exercise', 'exercises')} · ${disciplines} ${plural(disciplines, 'discipline', 'disciplines')}`,
    newExercise: 'New exercise',
    newDiscipline: 'New discipline',
    editExercise: 'Edit exercise',
    editDiscipline: 'Edit discipline',
    emptyTitle: 'Your library is empty',
    emptyBody:
      'Create the disciplines you train (Gym, Swimming, Climbing…) and their exercises, have them proposed with AI, or load a demo sport as a starting point.',
    loadDemo: 'Load a demo sport',
    disciplines: 'Disciplines',
    inDiscipline: (n: number) => `${n} exercises`,
    search: 'Search exercises',
    logged: 'logged',
    noMatch: (query: string) => `No exercise called “${query}”.`,
    createIt: 'Create it',
    ai: {
      pacePer: (unit: string) => `pace per ${unit}`,
      added: (n: number) => `${n} ${plural(n, 'exercise', 'exercises')} added`,
      proposed: 'Proposed exercises',
      reviewLead:
        'Untick what you do not want; open one to rename it or change how it is measured. Nothing is in your library until you add it.',
      skipped: (names: string) => `Already in your library, so left out: ${names}.`,
      newDiscipline: (name: string) => `${name} (new discipline)`,
      editOne: (name: string) => `Edit ${name}`,
      addOne: (name: string) => `Add ${name}`,
      nothingTicked: 'Nothing ticked',
      addN: (n: number) => `Add ${n} ${plural(n, 'exercise', 'exercises')}`,
      proposedSubtitle: (n: number) => `${n} from the coach · pick and edit before adding`,
      discard: 'Discard them',
    },
  },
  {
    summary: (exercises: number, disciplines: number) =>
      `${exercises} ${pluralFr(exercises, 'exercice', 'exercices')} · ${disciplines} ${pluralFr(disciplines, 'discipline', 'disciplines')}`,
    newExercise: 'Nouvel exercice',
    newDiscipline: 'Nouvelle discipline',
    editExercise: 'Modifier l’exercice',
    editDiscipline: 'Modifier la discipline',
    emptyTitle: 'Votre bibliothèque est vide',
    emptyBody:
      'Créez les disciplines que vous pratiquez (musculation, natation, escalade…) et leurs exercices, faites-les proposer par l’IA, ou chargez un sport de démo pour démarrer.',
    loadDemo: 'Charger un sport de démo',
    disciplines: 'Disciplines',
    inDiscipline: (n: number) => `${n} ${pluralFr(n, 'exercice', 'exercices')}`,
    search: 'Rechercher un exercice',
    logged: 'déjà noté',
    noMatch: (query: string) => `Aucun exercice nommé « ${query} ».`,
    createIt: 'Le créer',
    ai: {
      pacePer: (unit: string) => `allure au ${unit}`,
      added: (n: number) => `${n} ${pluralFr(n, 'exercice ajouté', 'exercices ajoutés')}`,
      proposed: 'Exercices proposés',
      reviewLead:
        'Décochez ce que vous ne voulez pas ; ouvrez un exercice pour le renommer ou changer sa mesure. Rien n’entre dans votre bibliothèque avant que vous l’ajoutiez.',
      skipped: (names: string) => `Déjà dans votre bibliothèque, donc écartés : ${names}.`,
      newDiscipline: (name: string) => `${name} (nouvelle discipline)`,
      editOne: (name: string) => `Modifier ${name}`,
      addOne: (name: string) => `Ajouter ${name}`,
      nothingTicked: 'Rien de coché',
      addN: (n: number) => `Ajouter ${n} ${pluralFr(n, 'exercice', 'exercices')}`,
      proposedSubtitle: (n: number) => `${n} proposés par le coach · choisissez et modifiez avant d’ajouter`,
      discard: 'Les écarter',
    },
  },
  {
    summary: (exercises: number, disciplines: number) =>
      `${exercises} ${plural(exercises, 'Übung', 'Übungen')} · ${disciplines} ${plural(disciplines, 'Disziplin', 'Disziplinen')}`,
    newExercise: 'Neue Übung',
    newDiscipline: 'Neue Disziplin',
    editExercise: 'Übung bearbeiten',
    editDiscipline: 'Disziplin bearbeiten',
    emptyTitle: 'Deine Bibliothek ist leer',
    emptyBody:
      'Lege die Disziplinen an, die du trainierst (Krafttraining, Schwimmen, Klettern…), und ihre Übungen, lass sie dir von der KI vorschlagen oder lade eine Demo-Sportart als Start.',
    loadDemo: 'Demo-Sportart laden',
    disciplines: 'Disziplinen',
    inDiscipline: (n: number) => `${n} ${plural(n, 'Übung', 'Übungen')}`,
    search: 'Übungen suchen',
    logged: 'erfasst',
    noMatch: (query: string) => `Keine Übung namens „${query}“.`,
    createIt: 'Anlegen',
    ai: {
      pacePer: (unit: string) => `Tempo pro ${unit}`,
      added: (n: number) => `${n} ${plural(n, 'Übung', 'Übungen')} hinzugefügt`,
      proposed: 'Vorgeschlagene Übungen',
      reviewLead:
        'Entferne den Haken bei allem, was du nicht willst; öffne eine Übung, um sie umzubenennen oder ihre Messart zu ändern. Erst beim Hinzufügen landet etwas in deiner Bibliothek.',
      skipped: (names: string) => `Schon in deiner Bibliothek, daher ausgelassen: ${names}.`,
      newDiscipline: (name: string) => `${name} (neue Disziplin)`,
      editOne: (name: string) => `${name} bearbeiten`,
      addOne: (name: string) => `${name} hinzufügen`,
      nothingTicked: 'Nichts ausgewählt',
      addN: (n: number) => `${n} ${plural(n, 'Übung', 'Übungen')} hinzufügen`,
      proposedSubtitle: (n: number) => `${n} vom Coach · vor dem Hinzufügen auswählen und bearbeiten`,
      discard: 'Verwerfen',
    },
  },
)
