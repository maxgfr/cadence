import { useLocation } from 'wouter'
import { useDraft } from '../../app/drafts.tsx'
import { instantiate, TEMPLATES } from '../../core/library/templates.ts'
import { DisciplineTag } from '../../ui/components/Discipline.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import styles from './Programs.module.css'

export function Templates() {
  const { setDraft } = useDraft()
  const [, navigate] = useLocation()
  return (
    <Screen
      title="Templates"
      subtitle="Ready-made programs. Open one to read it, change anything, then save it."
      back={{ href: '/programs', label: 'Programs' }}
    >
      <ul className={styles.templates}>
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={styles.template}
              onClick={() => {
                setDraft({ program: instantiate(t), newExercises: [], notes: [], origin: 'template' })
                navigate('/programs/draft')
              }}
            >
              <span className={styles.templateName}>{t.name}</span>
              <span className={styles.templateTags}>
                {t.disciplines.map((d) => (
                  <DisciplineTag key={d} discipline={d} />
                ))}
                <span className={styles.level}>{t.level === 'beginner' ? 'Beginner' : 'Intermediate'}</span>
              </span>
              <span className={styles.templateSummary}>{t.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  )
}
