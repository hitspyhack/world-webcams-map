import { NextResponse } from 'next/server';

// GDDKiA (Polish road authority) — open REST API, no key needed
// https://www.gddkia.gov.pl/pl/2551/systemy-automatyki-drogowej
// Open endpoint for camera list:
const GDDKIA_URL = 'https://mzkodm.gddkia.gov.pl/services/public/map/cameras';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:49.0,14.1,54.8,24.2];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 300;
`;

interface GddkiaCamera {
  id?: string | number;
  name?: string;
  label?: string;
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  thumbnailUrl?: string;
}
interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string,unknown>> = [];

  try {
    const res = await fetch(GDDKIA_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'world-webcams-map/1.0' },
      next: { revalidate: 120 },
    });
    if (res.ok) {
      const json = await res.json();
      const cams: GddkiaCamera[] = Array.isArray(json) ? json
        : Array.isArray(json?.data)    ? json.data
        : Array.isArray(json?.cameras) ? json.cameras
        : [];
      for (const c of cams) {
        const lat = c.lat ?? c.latitude;
        const lon = c.lon ?? c.longitude;
        if (!lat || !lon) continue;
        results.push({
          id: `pl-${c.id}`,
          title: c.name ?? c.label ?? `PL cam ${c.id}`,
          lat, lon,
          country: 'PL',
          imageUrl: c.thumbnailUrl ?? c.imageUrl ?? '',
          sourceUrl: 'https://www.gddkia.gov.pl',
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
          id: `pl-osm-${el.id}`,
          title: el.tags?.name ?? 'PL Webcam',
          lat: el.lat, lon: el.lon,
          country: 'PL',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
