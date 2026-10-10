import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { loadWeek, type WeekResult } from './source';
import { localISODate } from './week';

export type PrayerWeekState =
  | { status: 'loading' }
  | { status: 'error' }
  | ({ status: 'ready'; loadedOn: string } & WeekResult);

/** Loads this week's prayers, and reloads when the app comes back to the foreground. */
export function usePrayerWeek() {
  const [state, setState] = useState<PrayerWeekState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (manual = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (manual) setRefreshing(true);
    const now = new Date();
    try {
      const result = await loadWeek(now);
      setState({ status: 'ready', loadedOn: localISODate(now), ...result });
    } catch {
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  return { state, refreshing, refresh: () => load(true) };
}
