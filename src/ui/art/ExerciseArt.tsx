import { lazy, Suspense } from 'react'
import { useT } from '../../app/i18n.tsx'
import { presetSlugOf } from '../../core/library/search.ts'
import type { Exercise } from '../../core/model/schemas.ts'
import { PRESET_EXERCISES, type PresetSlug } from '../../core/presets/catalog.ts'
import styles from './ExerciseArt.module.css'

const Drawing = lazy(() => import('./Drawing.tsx'))

export interface ExerciseArtProps {
  /** An exercise of the library, or a preset not added yet. */
  exercise: Pick<Exercise, 'id' | 'name' | 'muscles'> | { slug: PresetSlug; name: string }
  /** A thumbnail beside the name (decoration), or the large illustration (named). */
  size: 'thumb' | 'large'
}

/** Whether an exercise has an illustration: it is a preset, or has a preset's name. */
export const hasArt = (exercise: Pick<Exercise, 'id' | 'name'>): boolean => presetSlugOf(exercise) !== undefined

/** The drawing of a preset exercise: the movement, its equipment and the muscles it trains. Nothing for others. */
export function ExerciseArt({ exercise, size }: ExerciseArtProps) {
  const t = useT()
  const slug = 'slug' in exercise ? exercise.slug : presetSlugOf(exercise)
  if (!slug) return null
  const own = 'muscles' in exercise ? exercise.muscles : undefined
  const muscles = own ?? PRESET_EXERCISES.find((e) => e.slug === slug)?.muscles ?? []
  const className = size === 'thumb' ? styles.thumb : styles.large
  return (
    <Suspense fallback={<span className={className} />}>
      <Drawing
        slug={slug}
        muscles={muscles}
        className={className}
        label={size === 'large' ? t.forms.exercise.illustrationOf(exercise.name) : undefined}
      />
    </Suspense>
  )
}
