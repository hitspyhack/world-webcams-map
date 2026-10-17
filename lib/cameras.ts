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

export function distanceKm(latA: number, lonA: number, latB: number, lonB: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(latB - latA);
  const deltaLon = radians(lonB - lonA);
  const arc = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(Math.max(0, 1 - arc)));
}

export function cameraContextUrls(lat: number, lon: number) {
  const point = `${lat},${lon}`;
  return {
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`,
    googleEarth: `https://earth.google.com/web/@${lat},${lon},100a,2000d,35y,0h,0t,0r`,
    streetView: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(point)}`,
  };
}

export function timestampedCaptureFilename(camera: Pick<GlobeCam, 'source' | 'title'>, capturedAt: Date, contentType: string): string {
  const slug = `${camera.source ?? 'webcam'}-${camera.title}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'webcam';
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const timestamp = capturedAt.toISOString().replace(/[:.]/g, '-');
  return `${slug}-${timestamp}.${extension}`;
}

export function exportCameras(cameras: GlobeCam[], format: 'csv' | 'geojson', exportedAt = new Date().toISOString()): string {
  const records = cameras.map(camera => {
    const context = cameraContextUrls(camera.lat, camera.lon);
    return {
      title: camera.title,
      source: camera.source ?? 'unknown',
      sourceUrl: camera.linkUrl ?? '',
      latitude: camera.lat,
      longitude: camera.lon,
      city: camera.city ?? '',
      country: camera.country ?? '',
      categories: (camera.categories ?? []).join('; '),
      media: camera.mediaKind ?? (camera.embedUrl ? 'player-link' : camera.imageUrl ? 'snapshot' : 'link-only'),
      positionPrecision: camera.positionPrecision ?? 'unspecified',
      continent: camera.continent ?? '',
      capturedAt: camera.captureAt ?? '',
      checkedAt: camera.checkedAt ? new Date(camera.checkedAt).toISOString() : '',
      googleMapsUrl: context.googleMaps,
      streetViewUrl: context.streetView,
      attribution: `Source: ${camera.source ?? 'unknown'}${camera.linkUrl ? ` (${camera.linkUrl})` : ''}`,
    };
  });

  if (format === 'geojson') {
    return JSON.stringify({
      type: 'FeatureCollection',
      exportedAt,
      features: records.map(record => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [record.longitude, record.latitude] },
        properties: { ...record },
      })),
    }, null, 2);
  }

  const columns = Object.keys(records[0] ?? {
    title: '', source: '', sourceUrl: '', latitude: '', longitude: '', city: '', country: '', categories: '',
    media: '', positionPrecision: '', continent: '', capturedAt: '', checkedAt: '', googleMapsUrl: '', streetViewUrl: '', attribution: '',
  });
  const escape = (value: unknown) => {
    const text = String(value);
    // Quoting alone does not prevent spreadsheet formula execution.
    const safe = /^[\s]*[=+@-]/.test(text) && typeof value !== 'number' ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [columns.map(escape).join(','), ...records.map(record => columns.map(key => escape(record[key as keyof typeof record])).join(','))].join('\r\n');
}

export function readCameraCollections(raw: string | null): string[] {
  if (!raw) return ['Favorites'];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ['Favorites'];
    const names = parsed.flatMap(value => typeof value === 'string' && value.trim() ? [value.trim().slice(0, 60)] : []);
    return ['Favorites', ...new Set(names.filter(name => name !== 'Favorites'))].slice(0, 100);
  } catch { return ['Favorites']; }
}

export function isPublicWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || /\.(?:localhost|local|internal)$/.test(host) || !host.includes('.')) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b] = host.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
        || (a === 100 && b >= 64 && b <= 127)) return false;
    }
    return !host.startsWith('['); // Do not ingest literal IPv6/intranet endpoints.
  } catch { return false; }
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
        city: typeof item.city === 'string' ? item.city.slice(0, 100) : undefined,
        country: typeof item.country === 'string' ? item.country.slice(0, 100) : undefined,
        categories: Array.isArray(item.categories) ? item.categories.flatMap(value => typeof value === 'string' ? [value.slice(0, 60)] : []).slice(0, 30) : undefined,
        captureAt: typeof item.captureAt === 'string' && Number.isFinite(Date.parse(item.captureAt)) ? item.captureAt.slice(0, 40) : undefined,
        checkedAt: typeof item.checkedAt === 'number' && Number.isFinite(new Date(item.checkedAt).getTime()) ? item.checkedAt : undefined,
        id: typeof item.id === 'string' ? item.id.slice(0, 100) : undefined,
        continent: typeof item.continent === 'string' ? item.continent.slice(0, 40) : undefined,
        description: typeof item.description === 'string' ? item.description.slice(0, 500) : undefined,
        videoUrl: isPublicWebUrl(item.videoUrl) ? item.videoUrl : undefined,
        mediaKind: ['live', 'timelapse', 'snapshot', 'player', 'provider', 'directory'].includes(String(item.mediaKind)) ? item.mediaKind as GlobeCam['mediaKind'] : undefined,
        positionPrecision: ['regional', 'approximate', 'provider'].includes(String(item.positionPrecision)) ? item.positionPrecision as GlobeCam['positionPrecision'] : undefined,
        collection: typeof item.collection === 'string' && item.collection.trim() ? item.collection.trim().slice(0, 60) : undefined,
      };
      const key = cameraKey(camera);
      if (seen.has(key)) return [];
      seen.add(key);
      return [camera];
    });
  } catch { return []; }
}
