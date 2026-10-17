import type { WindyWebcam } from '../types/webcam';
import { isPublicWebUrl } from './cameras';

export const WINDY_REGIONS = {
  world: { label: 'Worldwide', bbox: '90,180,-90,-180' },
  europe: { label: 'Europe', bbox: '72,45,34,-25' },
  africa: { label: 'Africa', bbox: '38,55,-35,-20' },
  asia: { label: 'Asia', bbox: '80,180,-10,25' },
  northAmerica: { label: 'North America & Caribbean', bbox: '85,-20,5,-180' },
  southAmerica: { label: 'South America', bbox: '15,-30,-60,-90' },
  oceania: { label: 'Oceania', bbox: '5,180,-55,110' },
  antarctica: { label: 'Antarctica', bbox: '-60,180,-90,-180' },
} as const;

function playerLink(value: unknown): string | undefined {
  if (isPublicWebUrl(value)) return value;
  if (value && typeof value === 'object') {
    const embed = (value as Record<string, unknown>).embed;
    if (isPublicWebUrl(embed)) return embed;
  }
}

/** Normalize v3 media without mistaking a daily timelapse for a live stream. */
export function normalizeWindyCamera(value: unknown): WindyWebcam | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const camera = raw as unknown as WindyWebcam;
  const id = raw.webcamId ?? raw.id;
  if ((typeof id !== 'string' && typeof id !== 'number') || !camera.location
    || !Number.isFinite(camera.location.latitude) || Math.abs(camera.location.latitude) > 90
    || !Number.isFinite(camera.location.longitude) || Math.abs(camera.location.longitude) > 180) return null;
  const players = raw.player && typeof raw.player === 'object' ? raw.player as Record<string, unknown> : {};
  const live = playerLink(players.live);
  const player = live ?? playerLink(players.day) ?? playerLink(players.lifetime);
  const image = camera.images ?? camera.image;
  return {
    webcamId: String(id), id: String(id),
    title: typeof raw.title === 'string' ? raw.title : 'Windy webcam',
    location: camera.location, images: image, image,
    categories: Array.isArray(camera.categories) ? camera.categories : [],
    status: typeof raw.status === 'string' ? raw.status : undefined,
    lastUpdatedOn: typeof raw.lastUpdatedOn === 'string' ? raw.lastUpdatedOn : undefined,
    mediaKind: live ? 'live' : player ? 'timelapse' : image?.current?.preview ? 'snapshot' : 'provider',
    urls: { webcam: `https://www.windy.com/webcams/${encodeURIComponent(String(id))}`, player },
  };
}

export function mergeWindyCameras(previous: WindyWebcam[], incoming: WindyWebcam[]): WindyWebcam[] {
  const unique = new Map(previous.map(camera => [String(camera.webcamId ?? camera.id), camera]));
  for (const camera of incoming) unique.set(String(camera.webcamId ?? camera.id), camera);
  return [...unique.values()].slice(-5000);
}
