import { useEffect } from 'react'
import type { Settings } from '../core/model/schemas.ts'

/** Forces light or dark on <html>, or leaves the system preference in charge. */
export function useTheme(theme: Settings['theme']): void {
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])
}
