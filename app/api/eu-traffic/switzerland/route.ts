import { NextResponse } from 'next/server';

// ASTRA / Viasuisse — Swiss Federal Roads Office
// Open data portal: opendata.swiss
// REST: https://api.opentransportdata.swiss/sstranl-webcam/v1/ (no key for basic use)
const ASTRA_URL = 'https://api.opentransportdata.swiss/sstranl-webcam/v1/webcams?limit=500';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:25][bbox:45.8,5.9,47.8,10.5];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 150;
`;

interface AstraWebcam {
  id?: string;
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  liveViewUrl?: string;
}
interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string,unknown>> = [];

  try {
    const res = await fetch(ASTRA_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'world-webcams-map/1.0' },
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const json = await res.json();
      const cams: AstraWebcam[] = Array.isArray(json) ? json
        : Array.isArray(json?.webcams) ? json.webcams
        : Array.isArray(json?.data)    ? json.data
        : [];
      for (const c of cams) {
        if (!c.latitude || !c.longitude) continue;
        results.push({
          id: `ch-astra-${c.id}`,
          title: c.name ?? c.description ?? 'CH cam',
          lat: c.latitude, lon: c.longitude,
          country: 'CH',
          imageUrl: c.imageUrl ?? '',
          sourceUrl: c.liveViewUrl ?? 'https://www.viasuisse.ch',
        });
      }
    }
  } catch { /* fall through */ }

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
          id: `ch-osm-${el.id}`,
          title: el.tags?.name ?? 'CH Webcam',
          lat: el.lat, lon: el.lon,
          country: 'CH',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
