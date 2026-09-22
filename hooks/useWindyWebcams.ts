'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import type { WindyWebcam } from '../types/webcam';

interface UseWindyWebcamsOptions {
  /** Debounce delay in ms after map stops moving before fetching. Default: 600 */
  debounceMs?: number;
  /** Max webcams to request per fetch (free tier recommends ≤ 50). Default: 50 */
  limit?: number;
  /** Whether the layer is currently visible (skips fetch when false). Default: true */
  enabled?: boolean;
}

interface UseWindyWebcamsResult {
  webcams: WindyWebcam[];
  loading: boolean;
  error: string | null;
}

function toArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

/**
 * Viewport-aware hook that fetches Windy webcams from the local proxy
 * `/api/windy-webcams` whenever the map viewport changes.
 *
 * Must be used inside a react-leaflet <MapContainer>.
 *
 * @example
 * function WindyLayer({ enabled }: { enabled: boolean }) {
 *   const { webcams, loading, error } = useWindyWebcams({ enabled });
 *   // render <Marker> for each webcam …
 * }
 */
export function useWindyWebcams({
  debounceMs = 600,
  limit = 50,
  enabled = true,
}: UseWindyWebcamsOptions = {}): UseWindyWebcamsResult {
  const map = useMap();
  const [webcams, setWebcams] = useState<WindyWebcam[]>([]);
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState<string | null>(null);

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef   = useRef<AbortController | null>(null);

  const fetchViewport = useCallback(async () => {
    if (!enabled) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const bounds = map.getBounds();
    const bbox = [
      bounds.getNorth().toFixed(6),
      bounds.getEast().toFixed(6),
      bounds.getSouth().toFixed(6),
      bounds.getWest().toFixed(6),
    ].join(',');

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/windy-webcams?bbox=${encodeURIComponent(bbox)}&limit=${limit}`,
        { signal: controller.signal }
      );

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const list = toArray<WindyWebcam>(data.webcams ?? data.result?.webcams);
      setWebcams(list);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return; // ignore cancelled
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [map, enabled, limit]);

  // Debounce on map move/zoom
  useMapEvents({
    moveend: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fetchViewport, debounceMs);
    },
    zoomend: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fetchViewport, debounceMs);
    },
  });

  // Initial fetch on mount
  useEffect(() => {
    fetchViewport();
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchViewport]);

  return { webcams, loading, error };
}
