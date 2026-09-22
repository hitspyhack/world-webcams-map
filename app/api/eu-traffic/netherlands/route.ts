import { NextResponse } from 'next/server';

// NDW (Nationaal Dataportaal Wegverkeer) — CC0 open data, no key
// Camera positions: https://opendata.ndw.nu/Camera.json.gz (daily snapshot)
// Live image: https://cameras.rijkswaterstaat.nl/thumbnails/{id}.jpg
const NDW_CAMERAS_URL = 'https://opendata.ndw.nu/Camera.json.gz';
const RWS_THUMB = 'https://cameras.rijkswaterstaat.nl/thumbnails';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:50.7,3.3,53.6,7.3];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 200;
`;

interface NdwCamera {
  Id?: string;
  Naam?: string;
  Latitude?: number;
  Longitude?: number;
}
interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string,unknown>> = [];

  // 1 — NDW Camera.json.gz — fetch and parse (gzip is decompressed by fetch automatically)
  try {
    const res = await fetch(NDW_CAMERAS_URL, {
      headers: { 'Accept-Encoding': 'gzip', Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const json = await res.json();
      const cams: NdwCamera[] = Array.isArray(json) ? json : [];
      for (const c of cams.slice(0, 500)) { // cap at 500
        if (!c.Latitude || !c.Longitude) continue;
        results.push({
          id: `nl-ndw-${c.Id}`,
          title: c.Naam ?? `NL cam ${c.Id}`,
          lat: c.Latitude, lon: c.Longitude,
          country: 'NL',
          imageUrl: c.Id ? `${RWS_THUMB}/${c.Id}.jpg` : '',
          sourceUrl: 'https://www.rijkswaterstaat.nl',
        });
      }
    }
  } catch { /* fall through */ }

  // 2 — OSM Overpass
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
          id: `nl-osm-${el.id}`,
          title: el.tags?.name ?? 'NL Webcam',
          lat: el.lat, lon: el.lon,
          country: 'NL',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
