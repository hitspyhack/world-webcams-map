import { NextResponse } from 'next/server';

// Vejdirektoratet (Danish Road Directorate) — open data, no key
// https://www.vejdirektoratet.dk/api/traffic
// Camera list endpoint:
const VEJDIR_URL = 'https://www.vejdirektoratet.dk/api/traffic?types=camera&limit=500&format=json';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:25][bbox:54.5,8.0,57.9,15.2];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 100;
`;

interface VejdirCamera {
  id?: string | number;
  description?: string;
  title?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
  cameraImageUrl?: string;
  imageUrl?: string;
  extras?: { imageUrl?: string };
}
interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string,unknown>> = [];

  try {
    const res = await fetch(VEJDIR_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'world-webcams-map/1.0' },
      next: { revalidate: 120 },
    });
    if (res.ok) {
      const json = await res.json();
      const cams: VejdirCamera[] = Array.isArray(json) ? json
        : Array.isArray(json?.data)     ? json.data
        : Array.isArray(json?.features) ? json.features
        : [];
      for (const c of cams) {
        const lat = c.lat ?? c.latitude;
        const lon = c.lon ?? c.longitude;
        if (!lat || !lon) continue;
        results.push({
          id: `dk-${c.id}`,
          title: c.title ?? c.description ?? 'DK cam',
          lat, lon,
          country: 'DK',
          imageUrl: c.cameraImageUrl ?? c.imageUrl ?? c.extras?.imageUrl ?? '',
          sourceUrl: 'https://www.vejdirektoratet.dk',
        });
      }
    }
  } catch { /* fall through */ }

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      for (const el of (data?.elements ?? []) as OsmNode[]) {
        const url = el.tags?.['contact:webcam'] ?? el.tags?.['webcam'] ?? '';
        if (!url) continue;
        results.push({
          id: `dk-osm-${el.id}`,
          title: el.tags?.name ?? 'DK Webcam',
          lat: el.lat, lon: el.lon,
          country: 'DK',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
