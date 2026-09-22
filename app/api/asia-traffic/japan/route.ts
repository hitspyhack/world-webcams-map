import { NextResponse } from 'next/server';

// Japan — MLIT (Ministry of Land, Infrastructure, Transport and Tourism)
// JARTIC publishes camera positions as open data.
// Direct API URL (no key, JSON):
const JARTIC_URL = 'https://api.jartic-open-traffic.org/geoserver/t_pvt_travospd/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=t_pvt_travospd:t_pvt_camera&outputFormat=application%2Fjson&count=500';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:24.0,122.0,45.5,145.8];
(
  node["contact:webcam"];
  node["webcam"];
  node["man_made"="surveillance"]["contact:webcam"];
);
out body 300;
`;

interface GeoJSONFeature {
  type: string;
  geometry: { type: string; coordinates: [number, number] };
  properties?: Record<string, unknown>;
}
interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string,unknown>> = [];

  try {
    const res = await fetch(JARTIC_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'world-webcams-map/1.0' },
      next: { revalidate: 180 },
    });
    if (res.ok) {
      const json = await res.json();
      const features: GeoJSONFeature[] = json?.features ?? [];
      for (const f of features.slice(0, 300)) {
        if (f.geometry?.type !== 'Point') continue;
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties ?? {};
        results.push({
          id: `jp-jartic-${p['camera_id'] ?? Math.random().toString(36).slice(2)}`,
          title: (p['name_jp'] ?? p['name'] ?? 'Japan cam') as string,
          lat, lon,
          country: 'JP',
          imageUrl: (p['image_url'] ?? '') as string,
          sourceUrl: (p['url'] ?? 'https://www.jartic.or.jp') as string,
        });
      }
    }
  } catch { /* fall through to Overpass */ }

  // Overpass covers municipal + expressway cams tagged in OSM
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
          id: `jp-osm-${el.id}`,
          title: el.tags?.name ?? el.tags?.['name:en'] ?? 'JP Webcam',
          lat: el.lat, lon: el.lon,
          country: 'JP',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
