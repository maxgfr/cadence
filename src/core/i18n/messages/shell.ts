import { namespace } from '../define.ts'

/** The frame around every screen: navigation, back links, not found, load failures, storage warnings. */
export const shell = namespace(
  {
    nav: {
      today: 'Today',
      programs: 'Programs',
      progress: 'Progress',
      exercises: 'Exercises',
      settings: 'Settings',
    },
    mainNav: 'Main',
    skipToContent: 'Skip to content',
    goToToday: 'Go to Today',
    notFoundTitle: 'Not found',
    nothingHere: 'Nothing here',
    notFoundBody: 'This page does not exist, or what it showed was deleted.',
    storageFull: 'Storage for this site is full: this change will be lost on reload. Export a backup.',
    loadFailedTitle: 'This screen could not load',
    loadFailedBody:
      'Cadence may have just been updated, or the network dropped while it loaded. Your data is safe on this device.',
    reload: 'Reload',
  },
  {
    nav: {
      today: 'Accueil',
      programs: 'Plans',
      progress: 'Progrès',
      exercises: 'Exercices',
      settings: 'Réglages',
    },
    mainNav: 'Principale',
    skipToContent: 'Aller au contenu',
    goToToday: 'Aller à l’accueil',
    notFoundTitle: 'Introuvable',
    nothingHere: 'Rien ici',
    notFoundBody: 'Cette page n’existe pas, ou son contenu a été supprimé.',
    storageFull:
      'Le stockage de ce site est plein : cette modification sera perdue au rechargement. Exportez une sauvegarde.',
    loadFailedTitle: 'Impossible de charger cet écran',
    loadFailedBody:
      'Cadence vient peut-être d’être mis à jour, ou le réseau a coupé pendant le chargement. Vos données sont en sécurité sur cet appareil.',
    reload: 'Recharger',
  },
  {
    nav: {
      today: 'Heute',
      programs: 'Pläne',
      progress: 'Statistik',
      exercises: 'Übungen',
      settings: 'Optionen',
    },
    mainNav: 'Hauptmenü',
    skipToContent: 'Zum Inhalt springen',
    goToToday: 'Zu Heute',
    notFoundTitle: 'Nicht gefunden',
    nothingHere: 'Hier ist nichts',
    notFoundBody: 'Diese Seite gibt es nicht, oder ihr Inhalt wurde gelöscht.',
    storageFull:
      'Der Speicher dieser Seite ist voll: Diese Änderung geht beim Neuladen verloren. Exportiere ein Backup.',
    loadFailedTitle: 'Dieser Bildschirm konnte nicht geladen werden',
    loadFailedBody:
      'Cadence wurde vielleicht gerade aktualisiert, oder das Netz ist beim Laden abgebrochen. Deine Daten sind auf diesem Gerät sicher.',
    reload: 'Neu laden',
  },
)
