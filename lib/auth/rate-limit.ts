export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 10 * 60 * 1000;

interface Entry {
  count: number;
  lockedUntil: number;
}

const store = new Map<string, Entry>();

export function isLocked(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  if (entry.lockedUntil > Date.now()) return true;
  if (entry.lockedUntil !== 0 && entry.lockedUntil <= Date.now()) store.delete(key);
  return false;
}

export function remainingLockSeconds(key: string): number {
  const entry = store.get(key);
  if (!entry || entry.lockedUntil <= Date.now()) return 0;
  return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
}

export function recordFailure(key: string): void {
  const entry = store.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    entry.count = 0;
  }
  store.set(key, entry);
}

export function resetFailures(key: string): void {
  store.delete(key);
}
