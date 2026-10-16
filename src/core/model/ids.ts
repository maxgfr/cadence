import { ulid } from 'ulid'

/** A new random, time-sortable id. */
export function newId(): string {
  return ulid()
}
