import { namespace } from '../define.ts'

/** Free notes, about anything. */
export const notes = namespace(
  {
    title: 'Notes',
    todayHint: 'Write down anything, it follows you on your devices.',
    newNote: 'New note',
    placeholder: 'A thought, a setting on a machine, what to try next…',
    add: 'Add note',
    empty: 'No notes yet.',
    edit: 'Edit note',
    text: 'Note',
    saved: 'Note saved',
    deleted: 'Note deleted',
    updatedOn: (date: string) => `Updated ${date}`,
  },
  {
    title: 'Notes',
    todayHint: 'Notez ce que vous voulez, ça vous suit sur vos appareils.',
    newNote: 'Nouvelle note',
    placeholder: 'Une idée, un réglage de machine, ce qu’il faut essayer…',
    add: 'Ajouter la note',
    empty: 'Aucune note pour l’instant.',
    edit: 'Modifier la note',
    text: 'Note',
    saved: 'Note enregistrée',
    deleted: 'Note supprimée',
    updatedOn: (date) => `Modifiée le ${date}`,
  },
  {
    title: 'Notizen',
    todayHint: 'Schreib auf, was du willst, es folgt dir auf deine Geräte.',
    newNote: 'Neue Notiz',
    placeholder: 'Ein Gedanke, eine Geräteeinstellung, was du probieren willst…',
    add: 'Notiz hinzufügen',
    empty: 'Noch keine Notizen.',
    edit: 'Notiz bearbeiten',
    text: 'Notiz',
    saved: 'Notiz gespeichert',
    deleted: 'Notiz gelöscht',
    updatedOn: (date) => `Geändert am ${date}`,
  },
)
