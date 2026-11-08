import { useCallback, useEffect, useRef, useState } from 'react';
import { desktop } from './bridge';
import { emptyData, type AppData } from './model';
import { loadLocal, saveLocal, validateData } from './storage';
export function useStore() {
  const [data, setData] = useState<AppData>(emptyData);
  const dataRef = useRef(data);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [loadError, setLoadError] = useState('');
  const loaded = useRef(false);
  const revision = useRef(0);
  const lastError = useRef<Error | null>(null);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const bridge = desktop();
        const raw = bridge ? await bridge.loadData() : loadLocal();
        const next = raw ? validateData(raw) : emptyData();
        if (alive) { dataRef.current = next; setData(next); loaded.current = true; setReady(true); }
      } catch (error) { if (alive) { setLoadError((error as Error).message); setReady(true); } }
    })();
    return () => { alive = false; };
  }, []);
  const commit = useCallback((fn: (current: AppData) => AppData) => {
    if (!loaded.current) return;
    const next = validateData({ ...fn(dataRef.current), updatedAt: new Date().toISOString() });
    dataRef.current = next;
    setData(next);
    setLoadError('');
    const rev = ++revision.current;
    lastError.current = null;
    setSaveState('saving');
    queue.current = queue.current.catch(() => undefined).then(async () => {
      const bridge = desktop();
      if (bridge) await bridge.saveData(next); else saveLocal(next);
      if (rev === revision.current) setSaveState('saved');
    }).catch(error => {
      lastError.current = error instanceof Error ? error : new Error(String(error));
      if (rev === revision.current) setSaveState('error');
    });
  }, []);
  const update = useCallback((fn: (current: AppData) => AppData) => { if (!loaded.current) throw new Error('Данные ещё не загружены'); commit(fn); }, [commit]);
  const replace = useCallback((next: AppData) => { validateData(next); loaded.current = true; commit(() => next); }, [commit]);
  const flush = useCallback(async () => { await queue.current; if (lastError.current) throw new Error('Не удалось сохранить данные. Экспортируйте резервную копию перед обновлением.'); }, []);
  return { data, update, replace, ready, saveState, loadError, flush };
}
