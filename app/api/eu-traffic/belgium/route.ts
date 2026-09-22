import { NextResponse } from 'next/server';

// Belgium — SPW (Service Public de Wallonie) + Bruxelles Mobilité
// No single central REST API for all Belgium cameras.
// Strategy:
//   1. Brussels Mobilité open data (GeoJSON cameras)
//   2. Overpass for Belgium
const BRUSSELS_CAM_URL = 'https://data.mobility.brussels/geoserver/bm_traffic/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=bm_traffic:vms_camera&outputFormat=application%2Fjson&srsName=EPSG%3A4326';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:25][bbox:49.5,2.5,51.5,6.4];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 200;
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
    const res = await fetch(BRUSSELS_CAM_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const json = await res.json();
      const features: GeoJSONFeature[] = json?.features ?? [];
      for (const f of features) {
        if (f.geometry?.type !== 'Point' || !f.geometry.coordinates?.length) continue;
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties ?? {};
        results.push({
          id: `be-bxl-${p['id'] ?? Math.random().toString(36).slice(2)}`,
          title: (p['name'] ?? p['caption'] ?? 'Brussels cam') as string,
          lat, lon,
          country: 'BE',
          city: 'Brussels',
          imageUrl: (p['image_url'] ?? '') as string,
          sourceUrl: (p['url'] ?? 'https://data.mobility.brussels') as string,
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
          id: `be-osm-${el.id}`,
          title: el.tags?.name ?? 'BE Webcam',
          lat: el.lat, lon: el.lon,
          country: 'BE',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
