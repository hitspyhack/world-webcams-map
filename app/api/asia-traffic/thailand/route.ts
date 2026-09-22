import { NextResponse } from 'next/server';

// Thailand DOH (Department of Highways) — no central public REST API
// Strategy:
//   1. DOH CCTV open list (JSON, unauthenticated)
//   2. Static list of known expressway / DOH cameras
//   3. Overpass fallback
const DOH_URL = 'https://www.doh.go.th/doh/cctv/json_cctv/getCCTVList.php';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:25][bbox:5.5,97.5,20.5,105.7];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 150;
`;

const STATIC_CAMS = [
  { id: 'th-s01', title: 'Bangkok Expressway Rama IX', lat: 13.7311, lon: 100.5666, country: 'TH', imageUrl: '', sourceUrl: 'https://www.exat.co.th' },
  { id: 'th-s02', title: 'Sukhumvit Rd Bangkok', lat: 13.7400, lon: 100.5700, country: 'TH', imageUrl: '', sourceUrl: 'https://www.traffy.in.th' },
  { id: 'th-s03', title: 'Don Mueang Tollway', lat: 13.9136, lon: 100.6067, country: 'TH', imageUrl: '', sourceUrl: 'https://www.doh.go.th' },
  { id: 'th-s04', title: 'Chiang Mai Ring Road', lat: 18.7883, lon: 98.9853, country: 'TH', imageUrl: '', sourceUrl: 'https://www.doh.go.th' },
  { id: 'th-s05', title: 'Pattaya Beach Rd', lat: 12.9236, lon: 100.8825, country: 'TH', imageUrl: '', sourceUrl: 'https://www.doh.go.th' },
  { id: 'th-s06', title: 'Phuket Airport Rd', lat: 8.1121, lon: 98.3009, country: 'TH', imageUrl: '', sourceUrl: 'https://www.doh.go.th' },
];

interface DohCam { id?: string|number; name?: string; lat?: number; lon?: number; img_url?: string; stream_url?: string; }
interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string,unknown>> = [...STATIC_CAMS];

  try {
    const res = await fetch(DOH_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'world-webcams-map/1.0' },
      next: { revalidate: 180 },
    });
    if (res.ok) {
      const json = await res.json();
      const cams: DohCam[] = Array.isArray(json) ? json : (json?.cameras ?? json?.data ?? []);
      for (const c of cams) {
        if (!c.lat || !c.lon) continue;
        results.push({
          id: `th-doh-${c.id}`,
          title: c.name ?? `TH cam ${c.id}`,
          lat: c.lat, lon: c.lon,
          country: 'TH',
          imageUrl: c.img_url ?? '',
          sourceUrl: c.stream_url ?? 'https://www.doh.go.th',
        });
      }
    }
  } catch { /* use static */ }

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
          id: `th-osm-${el.id}`,
          title: el.tags?.name ?? el.tags?.['name:en'] ?? 'TH Webcam',
          lat: el.lat, lon: el.lon,
          country: 'TH',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
