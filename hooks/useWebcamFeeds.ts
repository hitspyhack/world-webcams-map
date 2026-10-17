'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const FEEDS = {
  earthcam: { label: 'EarthCam', url: '/api/earthcam' },
  deckchair: { label: 'Scenic webcams', url: '/api/deckchair' },
  tourism: { label: 'Asia tourism', url: '/api/asia-tourism' },
  singapore: { label: 'Singapore traffic', url: '/api/asia-traffic/singapore' },
  eu: { label: 'European traffic', url: '/api/eu-traffic' },
  osm: { label: 'OpenStreetMap', url: '/api/overpass-webcams' },
  skyline: { label: 'Community webcams', url: '/api/skyline-webcams', method: 'POST' },
  windy: { label: 'Windy', url: '/api/windy-webcams?bbox=90,180,-90,-180&limit=50' },
} satisfies Record<string, { label: string; url: string; method?: string }>;

export type FeedKey = keyof typeof FEEDS;
export interface FeedState {
  data: unknown[];
  status: 'loading' | 'ready' | 'error' | 'unconfigured';
  error?: string;
  warning?: string;
  updatedAt?: number;
}
export type FeedStates = Record<FeedKey, FeedState>;
const KEYS = Object.keys(FEEDS) as FeedKey[];
export const FEED_TIMEOUT_MS = 35_000;

/** Each feed settles independently so a slow provider never blocks usable data. */
export function useWebcamFeeds() {
  const [feeds, setFeeds] = useState<FeedStates>(() => Object.fromEntries(
    KEYS.map(key => [key, { data: [], status: 'loading' } as FeedState]),
  ) as FeedStates);
  const requests = useRef(new Map<FeedKey, AbortController>());

  const refresh = useCallback((only?: FeedKey) => {
    for (const key of only ? [only] : KEYS) {
      requests.current.get(key)?.abort();
      const controller = new AbortController();
      requests.current.set(key, controller);
      setFeeds(previous => ({ ...previous, [key]: { ...previous[key], status: 'loading', error: undefined, warning: undefined } }));
      void (async () => {
        const timer = setTimeout(() => {
          if (requests.current.get(key) !== controller) return;
          setFeeds(previous => ({ ...previous, [key]: { ...previous[key], status: 'error', error: 'Request timed out. Try again.' } }));
          controller.abort();
        }, FEED_TIMEOUT_MS);
        controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
        try {
          const config: { url: string; method?: string } = FEEDS[key];
          const response = await fetch(config.url, { method: config.method ?? 'GET', signal: controller.signal });
          if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
          const json: unknown = await response.json();
          if (controller.signal.aborted) return;
          const wrapped = json && typeof json === 'object' ? json as Record<string, unknown> : null;
          if (key === 'windy' && wrapped?.missingKey === true) {
            setFeeds(previous => ({ ...previous, [key]: { data: [], status: 'unconfigured' } }));
            return;
          }
          const data = Array.isArray(json) ? json
            : key === 'windy' && Array.isArray(wrapped?.webcams) ? wrapped.webcams
              : key === 'singapore' && Array.isArray(wrapped?.cameras) ? wrapped.cameras : null;
          if (!data) throw new Error('Provider returned an unexpected response');
          const failedCountries = response.headers?.get('X-Webcam-Failed-Countries');
          setFeeds(previous => ({ ...previous, [key]: {
            data, status: 'ready', updatedAt: Date.now(),
            warning: failedCountries ? `Some countries could not be loaded: ${failedCountries}` : undefined,
          } }));
        } catch (error) {
          if (requests.current.get(key) !== controller || controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : 'Unable to load source';
          setFeeds(previous => ({ ...previous, [key]: { ...previous[key], status: 'error', error: message } }));
        } finally {
          clearTimeout(timer);
          if (requests.current.get(key) === controller) requests.current.delete(key);
        }
      })();
    }
  }, []);

  useEffect(() => {
    refresh();
    const active = requests.current;
    return () => { active.forEach(controller => controller.abort()); active.clear(); };
  }, [refresh]);

  return { feeds, refresh, loading: KEYS.some(key => feeds[key].status === 'loading') };
}
