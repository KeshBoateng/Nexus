import { useState } from 'react';

export type Run = (fn: () => Promise<void>) => Promise<boolean>;

/** Runs a mutation, then reloads; exposes busy + a readable error. Returns true on success. */
export function useRunner(reload: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run: Run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, error, busy };
}
