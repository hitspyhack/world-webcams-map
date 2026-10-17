'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SkylineItem } from '../types/webcam';

interface UseSkylineWebcamsOptions {
  /**
   * Location name to search Skyline for (passed to the Apify actor).
   * Default: 'World'
   */
  location?: string;
  /** Whether to fetch at all. Default: true */
  enabled?: boolean;
}

interface UseSkylineWebcamsResult {
  webcams: SkylineItem[];
  loading: boolean;
  error: string | null;
  /** Manually trigger a refresh for a new location */
  refetch: (location?: string) => void;
}

/**
 * Hook that fetches SkylineWebcams data from the local proxy
 * `/api/skyline-webcams` (which calls the Apify actor).
 *
 * Note: Apify actor runs are slow (5-30 s). Results are not
 * viewport-bound — the actor returns results for the given location string.
 *
 * Disabling or changing location cancels the previous request.
 */
export function useSkylineWebcams({
  location = 'World',
  enabled = true,
}: UseSkylineWebcamsOptions = {}): UseSkylineWebcamsResult {
  const abortRef = useRef<AbortController | null>(null);
  const [webcams, setWebcams] = useState<SkylineItem[]>([]);
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState<string | null>(null);

  const fetchCams = useCallback(async (loc: string) => {
    if (!enabled) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/skyline-webcams', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const data: unknown = await res.json();
      if (!ctrl.signal.aborted) setWebcams(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abortRef.current === ctrl && !ctrl.signal.aborted) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) void fetchCams(location);
    else { setWebcams([]); setLoading(false); setError(null); }
    return () => { abortRef.current?.abort(); };
  }, [enabled, location, fetchCams]);

  return {
    webcams,
    loading,
    error,
    refetch: (loc) => fetchCams(loc ?? location),
  };
}
