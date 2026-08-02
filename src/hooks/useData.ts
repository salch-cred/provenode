import { useState, useEffect, useCallback } from 'react';
import { get } from '../lib/api';

export function useData<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try { setData(await get<T>(path)); }
    catch { /* noop, page shows empty state */ }
    finally { setLoading(false); }
  }, [path]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, refetch: load };
}