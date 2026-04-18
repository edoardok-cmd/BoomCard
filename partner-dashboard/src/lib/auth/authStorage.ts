/**
 * Auth storage router: picks between localStorage (persistent, survives
 * browser restart) and sessionStorage (tab-lifetime) based on whether the
 * user checked "remember me".
 *
 * Read order: sessionStorage first, then localStorage. This lets ephemeral
 * sessions shadow stale persisted state from a prior remembered session
 * on the same machine.
 *
 * When writing with an explicit `persistent` flag (from login), we wipe
 * the other storage to avoid the token living in both places with
 * conflicting lifetimes. When `persistent` is omitted (token rotations
 * from switchAccount / refresh / impersonate), we inherit whichever
 * storage the key currently lives in — the original login decision wins.
 */

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function getItem(key: string): string | null {
  if (!hasWindow()) return null;
  const s = sessionStorage.getItem(key);
  if (s !== null) return s;
  return localStorage.getItem(key);
}

export function isPersistent(key: string): boolean {
  if (!hasWindow()) return true;
  if (sessionStorage.getItem(key) !== null) return false;
  if (localStorage.getItem(key) !== null) return true;
  return true;
}

export function setItem(key: string, value: string, persistent?: boolean): void {
  if (!hasWindow()) return;
  const shouldPersist = persistent === undefined ? isPersistent(key) : persistent;
  if (shouldPersist) {
    localStorage.setItem(key, value);
    sessionStorage.removeItem(key);
  } else {
    sessionStorage.setItem(key, value);
    localStorage.removeItem(key);
  }
}

export function removeItem(key: string): void {
  if (!hasWindow()) return;
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}
