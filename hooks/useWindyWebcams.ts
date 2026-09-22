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
  /**
   * When set, overrides the live map-viewport bbox with a fixed
   * "north,east,south,west" string. Used when a country filter is active
   * so all cams for that country are loaded regardless of what's visible.
   * The hook still re-fetches when this value changes.
   */
  forceBbox?: string | null;
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
  forceBbox  = null,
}: UseWindyWebcamsOptions = {}): UseWindyWebcamsResult {
  const map = useMap();

  const [webcams,    setWebcams]    = useState<WindyWebcam[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);

  const abortRef   = useRef<AbortController | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyMissing = useRef(false);

  const fetchCams = useCallback(async (overrideBbox?: string) => {
    if (!enabled || keyMissing.current) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Use forceBbox (or caller-supplied override) first, fall back to map viewport
    const bbox = overrideBbox ?? forceBbox ?? (() => {
      const b = map.getBounds();
      return [b.getNorth(), b.getEast(), b.getSouth(), b.getWest()].join(',');
    })();

    setLoading(true);
    setError(null);

    try {
      const res  = await fetch(
        `/api/windy-webcams?bbox=${encodeURIComponent(bbox)}&limit=${limit}`,
        { signal: ctrl.signal },
      );
      const json = await res.json();

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
      if ((e as Error)?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [enabled, limit, forceBbox, map]);

  // Debounced re-fetch on map move/zoom — only when NOT overriding with forceBbox
  const schedule = useCallback(() => {
    if (forceBbox) return; // country filter active — don't override with viewport
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchCams(), debounceMs);
  }, [fetchCams, debounceMs, forceBbox]);

  useMapEvents({ moveend: schedule, zoomend: schedule });

  // Re-fetch whenever enabled toggles or forceBbox changes
  useEffect(() => {
    if (enabled && !keyMissing.current) fetchCams();
    if (!enabled) { setWebcams([]); setLoading(false); setError(null); }
  // fetchCams already captures forceBbox via closure — this triggers on forceBbox change too
  }, [enabled, fetchCams]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { webcams, loading, error, missingKey };
}
