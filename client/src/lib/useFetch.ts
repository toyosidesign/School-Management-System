import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** Small data-loading hook: every page uses the same loading/error/retry shape. */
export function useFetch<T = any>(path: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setData(await api.get(path));
    } catch (e: any) {
      setError(e.message ?? 'Could not load this page.');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [load, ...deps]);

  return { data, loading, error, reload: load, setData };
}
