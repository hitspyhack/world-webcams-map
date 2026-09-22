import { NextResponse } from 'next/server';

// MOTC (Ministry of Transportation and Communications) Taiwan
// Open Data API — no key required
// https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV?$top=1000&$format=JSON
const MOTC_URL = 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV?%24top=1000&%24format=JSON';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:25][bbox:21.8,119.9,25.3,122.0];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 150;
`;

interface MotcCctv {
  CCTVId?: string;
  AuthorityId?: string;
  CCTVName?: string;
  PositionLat?: number;
  PositionLon?: number;
  VideoStreamURL?: string;
}
interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string,unknown>> = [];

  try {
    const res = await fetch(MOTC_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'world-webcams-map/1.0' },
      next: { revalidate: 120 },
    });
    if (res.ok) {
      const json = await res.json();
      const cams: MotcCctv[] = Array.isArray(json) ? json : (json?.CCTVs ?? []);
      for (const c of cams.slice(0, 300)) {
        if (!c.PositionLat || !c.PositionLon) continue;
        results.push({
          id: `tw-motc-${c.CCTVId}`,
          title: c.CCTVName ?? `TW cam ${c.CCTVId}`,
          lat: c.PositionLat,
          lon: c.PositionLon,
          country: 'TW',
          imageUrl: '',
          sourceUrl: c.VideoStreamURL ?? 'https://www.motc.gov.tw',
          streamUrl: c.VideoStreamURL ?? '',
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
          id: `tw-osm-${el.id}`,
          title: el.tags?.name ?? el.tags?.['name:en'] ?? 'TW Webcam',
          lat: el.lat, lon: el.lon,
          country: 'TW',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
