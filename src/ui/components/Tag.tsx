import styles from './Tag.module.css'

/** A short neutral label beside a name, such as "Optional" on a planned exercise. */
export function Tag({ children }: { children: string }) {
  return <span className={styles.tag}>{children}</span>
}
