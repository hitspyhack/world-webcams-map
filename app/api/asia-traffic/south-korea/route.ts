import { NextResponse } from 'next/server';

// ITS Korea — Open National Transport Information Service
// API key required — register free at https://www.its.go.kr
// Set SEOUL_ITS_KEY in .env.local
const ITS_KEY = process.env.SEOUL_ITS_KEY ?? '';
const ITS_CCTV_URL = 'https://openapi.its.go.kr:9443/cctvInfo?apiKey={KEY}&type=its&cctvType=1&minX=124.5&maxX=131.9&minY=33.0&maxY=38.7&getType=json';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:25][bbox:33.0,124.5,38.7,131.9];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 200;
`;

interface ItsCctv {
  cctvname?: string;
  coordx?: string;
  coordy?: string;
  cctvurl?: string;
  filecreatetime?: string;
}
interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string,unknown>> = [];

  if (ITS_KEY) {
    try {
      const url = ITS_CCTV_URL.replace('{KEY}', encodeURIComponent(ITS_KEY));
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'world-webcams-map/1.0' },
        next: { revalidate: 60 },
      });
      if (res.ok) {
        const json = await res.json();
        const cams: ItsCctv[] = json?.response?.data ?? json?.data ?? [];
        for (const c of cams) {
          const lon = parseFloat(c.coordx ?? '');
          const lat = parseFloat(c.coordy ?? '');
          if (isNaN(lat) || isNaN(lon)) continue;
          results.push({
            id: `kr-its-${lon}-${lat}`,
            title: c.cctvname ?? 'KR cam',
            lat, lon,
            country: 'KR',
            imageUrl: '',
            sourceUrl: c.cctvurl ?? 'https://www.its.go.kr',
            streamUrl: c.cctvurl ?? '',
          });
        }
      }
    } catch { /* fall through */ }
  }

  // Overpass
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
          id: `kr-osm-${el.id}`,
          title: el.tags?.name ?? el.tags?.['name:en'] ?? 'KR Webcam',
          lat: el.lat, lon: el.lon,
          country: 'KR',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
