import { useState, useEffect, useRef, useCallback } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import type { WindyWebcam } from '../types/webcam';

export interface UseWindyWebcamsOptions {
  /** Set to false to skip all fetches and clear the webcam list. */
  enabled?: boolean;
  /** Debounce delay in ms after the map stops moving. Default: 600 */
  debounceMs?: number;
  /** Max cameras per request (Windy free-tier: ≤ 50). Default: 50 */
  limit?: number;
}

export interface UseWindyWebcamsResult {
  webcams:    WindyWebcam[];
  loading:    boolean;
  /** Non-null only for real API / network errors — NOT for a missing API key. */
  error:      string | null;
  /** True when the server indicated no API key is configured. */
  missingKey: boolean;
}

export function useWindyWebcams({
  enabled    = true,
  debounceMs = 600,
  limit      = 50,
}: UseWindyWebcamsOptions = {}): UseWindyWebcamsResult {
  const map = useMap();

  const [webcams,    setWebcams]    = useState<WindyWebcam[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);

  const abortRef   = useRef<AbortController | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  // If the key is missing we only need to discover that once.
  const keyMissing = useRef(false);

  const fetchCams = useCallback(async () => {
    if (!enabled || keyMissing.current) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const bounds = map.getBounds();
    const bbox   = [
      bounds.getNorth(),
      bounds.getEast(),
      bounds.getSouth(),
      bounds.getWest(),
    ].join(',');

    setLoading(true);
    setError(null);

    try {
      const res  = await fetch(
        `/api/windy-webcams?bbox=${encodeURIComponent(bbox)}&limit=${limit}`,
        { signal: ctrl.signal },
      );
      const json = await res.json();

      // Graceful no-key path: server returns 200 + missingKey flag.
      if (json?.missingKey) {
        keyMissing.current = true;
        setMissingKey(true);
        setWebcams([]);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(json?.error ?? `HTTP ${res.status}`);
        setLoading(false);
        return;
      }

      const list: WindyWebcam[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.webcams)
          ? json.webcams
          : [];

      setWebcams(list);
      setError(null);
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') return; // map moved — ignore
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [enabled, limit, map]);

  // Debounced re-fetch on map move/zoom
  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fetchCams, debounceMs);
  }, [fetchCams, debounceMs]);

  useMapEvents({ moveend: schedule, zoomend: schedule });

  // Initial fetch on mount / when enabled toggles on
  useEffect(() => {
    if (enabled && !keyMissing.current) fetchCams();
    if (!enabled) { setWebcams([]); setLoading(false); setError(null); }
  }, [enabled, fetchCams]);

  // Cleanup on unmount
  useEffect(() => () => {
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { webcams, loading, error, missingKey };
}
