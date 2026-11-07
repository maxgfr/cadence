import { namespace } from '../define.ts'

/** First run: how much detail, which units, a demo or nothing. */
export const welcome = namespace(
  {
    lead: 'Plan and log your training, whatever the sport, and see what it does. Everything stays on this device.',
    detailQuestion: 'How much detail do you want?',
    normalTitle: 'Normal',
    normalBody: 'Sets, reps, loads and times. Session effort, records and the main charts. The quickest way to log.',
    advancedTitle: 'Advanced',
    advancedBody:
      'Adds effort per set, %1RM, RPE and pace targets, rest and tempo in plans, tonnage per muscle and adherence.',
    metres: 'metres',
    yards: 'yards',
    note: 'Both can be changed any time in Settings. Switching mode never loses data.',
    startDemo: 'Start with the demo',
    startEmpty: 'Start empty',
    syncInstead: 'Already use Cadence on another device? Sync from it',
  },
  {
    lead: 'Planifiez et notez vos entraînements, quel que soit le sport, et voyez ce qu’ils donnent. Tout reste sur cet appareil.',
    detailQuestion: 'Quel niveau de détail voulez-vous ?',
    normalTitle: 'Normal',
    normalBody:
      'Séries, répétitions, charges et temps. Effort de la séance, records et graphiques principaux. Le plus rapide pour noter.',
    advancedTitle: 'Avancé',
    advancedBody:
      'Ajoute l’effort par série, les cibles en %1RM, RPE et allure, la récup et le tempo dans les plans, le tonnage par muscle et l’assiduité.',
    metres: 'mètres',
    yards: 'yards',
    note: 'Les deux se changent à tout moment dans les Réglages. Changer de mode ne perd jamais de données.',
    startDemo: 'Commencer avec la démo',
    startEmpty: 'Commencer à vide',
    syncInstead: 'Vous utilisez déjà Cadence sur un autre appareil ? Synchronisez-le',
  },
  {
    lead: 'Plane und protokolliere dein Training, egal welcher Sport, und sieh, was es bringt. Alles bleibt auf diesem Gerät.',
    detailQuestion: 'Wie detailliert soll es sein?',
    normalTitle: 'Normal',
    normalBody:
      'Sätze, Wiederholungen, Gewichte und Zeiten. Belastung pro Einheit, Rekorde und die wichtigsten Diagramme. Am schnellsten erfasst.',
    advancedTitle: 'Erweitert',
    advancedBody:
      'Ergänzt Belastung pro Satz, Ziele in %1RM, RPE und Pace, Pausen und Tempo in Plänen, Tonnage pro Muskel und Plantreue.',
    metres: 'Meter',
    yards: 'Yards',
    note: 'Beides lässt sich jederzeit in den Einstellungen ändern. Ein Moduswechsel löscht nie Daten.',
    startDemo: 'Mit der Demo starten',
    startEmpty: 'Leer starten',
    syncInstead: 'Nutzt du Cadence schon auf einem anderen Gerät? Synchronisiere von dort',
  },
)
