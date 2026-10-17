import type { GlobeCam } from '../components/GlobeView';

/** Zero is a valid coordinate; NaN, strings and out-of-range positions are not. */
export function hasCoordinates(value: unknown): value is { lat: number; lon: number } {
  if (!value || typeof value !== 'object') return false;
  const { lat, lon } = value as Record<string, unknown>;
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lon === 'number' && Number.isFinite(lon) && Math.abs(lon) <= 180;
}

export function cameraKey(camera: Pick<GlobeCam, 'source' | 'lat' | 'lon' | 'title'>): string {
  return JSON.stringify([camera.source ?? '', camera.lat, camera.lon, camera.title]);
}

export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function isPublicWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}

/** Treat local storage as untrusted input, including URLs that will be embedded. */
export function readSavedCameras(raw: string | null): GlobeCam[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.slice(0, 500).flatMap(value => {
      if (!hasCoordinates(value)) return [];
      const item = value as Record<string, unknown> & { lat: number; lon: number };
      if (typeof item.title !== 'string' || !item.title.trim()) return [];
      const camera: GlobeCam = {
        lat: item.lat, lon: item.lon, title: item.title.slice(0, 200),
        source: typeof item.source === 'string' ? item.source.slice(0, 30) : undefined,
        color: typeof item.color === 'string' && /^#[a-f\d]{6}$/i.test(item.color) ? item.color : '#79c0ff',
        imageUrl: isPublicWebUrl(item.imageUrl) ? item.imageUrl : undefined,
        embedUrl: isPublicWebUrl(item.embedUrl) ? item.embedUrl : undefined,
        linkUrl: isPublicWebUrl(item.linkUrl) ? item.linkUrl : undefined,
      };
      const key = cameraKey(camera);
      if (seen.has(key)) return [];
      seen.add(key);
      return [camera];
    });
  } catch { return []; }
}
