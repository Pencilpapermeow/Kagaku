// Three-way merge of one synced item, the way git thinks about it:
//   base   = what both sides agreed on at the last sync (from syncBase),
//   local  = this device now, remote = the repo now.
// Whoever changed since the base wins; if only one side deleted, the delete wins only when
// the other side didn't change the item meanwhile (an edit is never lost to a delete).

export interface BaseState {
  local: string
  remote: string
}

export type Action =
  | 'none'
  | 'push' // send this device's version
  | 'pull' // take the repo's version
  | 'delete-remote'
  | 'delete-local'
  | 'forget' // both sides gone: drop the base
  | 'resolve' // both sides changed (or both new): the item's kind decides

export function plan(base: BaseState | undefined, local: string | undefined, remote: string | undefined): Action {
  if (!base) {
    if (local !== undefined && remote === undefined) return 'push'
    if (local === undefined && remote !== undefined) return 'pull'
    if (local !== undefined && remote !== undefined) return 'resolve'
    return 'none'
  }
  const lChanged = local !== base.local
  const rChanged = remote !== base.remote
  if (!lChanged && !rChanged) return 'none'
  if (lChanged && !rChanged) return local === undefined ? 'delete-remote' : 'push'
  if (!lChanged && rChanged) return remote === undefined ? 'delete-local' : 'pull'
  if (local === undefined && remote === undefined) return 'forget'
  if (local === undefined) return 'pull'
  if (remote === undefined) return 'push'
  return 'resolve'
}
