const blockers = new Set<string>();

export function setReloadBlocker(key: string, blocked: boolean) {
  if (blocked) blockers.add(key);
  else blockers.delete(key);
}

export function clearReloadBlocker(key: string) {
  blockers.delete(key);
}

export function hasReloadBlockers() {
  return blockers.size > 0;
}
