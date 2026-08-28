/**
 * useWorkedBefore Hook
 *
 * Cross-references spots against the operator's logged QSOs so panels can
 * flag stations already in the log ("worked" / "dupe"). Zero-config: it
 * polls the two QSO feeds the app already ingests and simply comes up empty
 * when neither source is active, so the feature stays invisible.
 *
 * Sources (either may be disabled/unavailable — errors are treated as empty):
 *   - N3FJP bridge:     GET /api/n3fjp/qsos
 *   - N1MM/DXLog:       GET /api/contest/qsos
 *
 * All consumers (DX cluster panel + the four activation panels) share one
 * module-level fetch loop; the interval starts with the first subscriber and
 * stops with the last.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { buildWorkedIndex, lookupWorked } from '../utils/workedBefore.js';

// Logging happens live during contests — refresh often enough that a QSO
// made a minute ago already flags as a dupe.
const REFRESH_MS = 60 * 1000;

const store = {
  index: new Map(),
  subscribers: new Set(),
  timer: null,
};

const fetchJsonSafe = async (url) => {
  try {
    const res = await apiFetch(url, { cache: 'no-store' });
    if (!res?.ok) return null; // 404 / disabled / backoff → no data
    return await res.json();
  } catch {
    return null; // network error → no data
  }
};

const refresh = async () => {
  const [n3fjp, contest] = await Promise.all([
    fetchJsonSafe('/api/n3fjp/qsos'),
    fetchJsonSafe('/api/contest/qsos?limit=500'),
  ]);
  store.index = buildWorkedIndex({
    n3fjpQsos: Array.isArray(n3fjp?.qsos) ? n3fjp.qsos : [],
    contestQsos: Array.isArray(contest?.qsos) ? contest.qsos : [],
  });
  store.subscribers.forEach((cb) => cb(store.index));
};

const subscribe = (cb) => {
  store.subscribers.add(cb);
  if (!store.timer) {
    refresh();
    store.timer = setInterval(refresh, REFRESH_MS);
  }
  return () => {
    store.subscribers.delete(cb);
    if (store.subscribers.size === 0 && store.timer) {
      clearInterval(store.timer);
      store.timer = null;
    }
  };
};

export const useWorkedBefore = () => {
  const [index, setIndex] = useState(store.index);

  useEffect(() => subscribe(setIndex), []);

  /**
   * getStatus(call, freq?, mode?) → 'dupe' | 'worked' | null
   * freq may be MHz, kHz, or Hz; omit freq/mode for call-level matching.
   */
  const getStatus = useCallback((call, freq, mode) => lookupWorked(index, call, freq, mode), [index]);

  return { index, hasData: index.size > 0, getStatus };
};

export default useWorkedBefore;
