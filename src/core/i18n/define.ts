import type { Locale } from './locale.ts'

/**
 * What a translation must provide for a set of English messages: the same keys, a string for every string, and a
 * function with the same parameters for every function (counts, names, values already formatted).
 */
export type Shape<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : T[K] extends string
      ? string
      : Shape<T[K]>
}

/** One namespace of messages in every language; a missing key or a wrong parameter fails the type check. */
export function namespace<const T>(en: T, fr: Shape<T>, de: Shape<T>): Record<Locale, Shape<T>> {
  return { en: en as Shape<T>, fr, de }
}

/** English and German: one for exactly 1. */
export const plural = (n: number, one: string, other: string): string => (n === 1 ? one : other)

/** French: one for 0 and 1. */
export const pluralFr = (n: number, one: string, other: string): string => (Math.abs(n) < 2 ? one : other)
