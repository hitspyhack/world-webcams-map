import { NextResponse } from 'next/server';

// ASFINAG — Autobahn und Schnellstraßen Finanzierungs AG
// Open REST API, no key required
// https://www.asfinag.at/verkehr-sicherheit/verkehrsinfo/
const ASFINAG_URL = 'https://verkehrsauskunft.asfinag.at/map/json/getCameras';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:25][bbox:46.3,9.5,48.8,17.2];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 150;
`;

interface AsfinagCamera {
  id?: string | number;
  name?: string;
  title?: string;
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  img?: string;
  url?: string;
  x?: number;
  y?: number;
}
interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string,unknown>> = [];

  try {
    const res = await fetch(ASFINAG_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'world-webcams-map/1.0' },
      next: { revalidate: 120 },
    });
    if (res.ok) {
      const json = await res.json();
      const cams: AsfinagCamera[] = Array.isArray(json) ? json
        : Array.isArray(json?.cameras) ? json.cameras
        : Array.isArray(json?.data)    ? json.data
        : [];
      for (const c of cams) {
        const lat = c.lat ?? c.latitude ?? c.y;
        const lon = c.lon ?? c.longitude ?? c.x;
        if (!lat || !lon) continue;
        results.push({
          id: `at-asfinag-${c.id}`,
          title: c.name ?? c.title ?? 'ASFINAG cam',
          lat, lon,
          country: 'AT',
          imageUrl: c.imageUrl ?? c.img ?? '',
          sourceUrl: c.url ?? 'https://www.asfinag.at',
        });
      }
    }
  } catch { /* fall through to Overpass */ }

  // Overpass fallback
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
          id: `at-osm-${el.id}`,
          title: el.tags?.name ?? 'AT Webcam',
          lat: el.lat, lon: el.lon,
          country: 'AT',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
