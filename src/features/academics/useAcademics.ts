import { useCallback, useEffect, useState } from 'react';
import { cached } from '../../lib/offline';
import { ensureDefaultBands, fetchAcademics, type AcademicsData } from './api';

export function useAcademics() {
  const [data, setData] = useState<AcademicsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<() => void> => {
    try {
      let d = await cached('academics', fetchAcademics);
      if (d.bands.length === 0) {
        await ensureDefaultBands();
        d = await cached('academics', fetchAcademics);
      }
      const next = d;
      return () => {
        setData(next);
        setError(null);
      };
    } catch (err) {
      return () => setError(err instanceof Error ? err.message : 'Could not load academics.');
    }
  }, []);

  const reload = useCallback(async () => (await load())(), [load]);

  useEffect(() => {
    let active = true;
    load().then((apply) => {
      if (active) apply();
    });
    return () => {
      active = false;
    };
  }, [load]);

  return { data, error, reload };
}
