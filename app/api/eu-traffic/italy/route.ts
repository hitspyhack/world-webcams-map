import { NextResponse } from 'next/server';

// Italy — CCISS / Autostrade per l'Italia
// The CCISS open data GeoJSON is available at:
// https://cciss.it (no documented REST API for cameras)
// We use OSM Overpass + a curated static list of major Autostrade feeds.
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:36.6,6.6,47.1,18.6];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 400;
`;

const STATIC_CAMS = [
  { id: 'it-s01', title: 'A1 Firenze Nord', lat: 43.8253, lon: 11.0894, country: 'IT', imageUrl: '', sourceUrl: 'https://www.autostrade.it' },
  { id: 'it-s02', title: 'A1 Bologna Casalecchio', lat: 44.4669, lon: 11.2760, country: 'IT', imageUrl: '', sourceUrl: 'https://www.autostrade.it' },
  { id: 'it-s03', title: 'A1 Roma Nord', lat: 41.9729, lon: 12.4289, country: 'IT', imageUrl: '', sourceUrl: 'https://www.autostrade.it' },
  { id: 'it-s04', title: 'A4 Milano Est', lat: 45.4897, lon: 9.2522, country: 'IT', imageUrl: '', sourceUrl: 'https://www.autostrade.it' },
  { id: 'it-s05', title: 'A4 Venezia Mestre', lat: 45.4862, lon: 12.2313, country: 'IT', imageUrl: '', sourceUrl: 'https://www.autostrade.it' },
  { id: 'it-s06', title: 'A10 Genova Aeroporto', lat: 44.4131, lon: 8.8385, country: 'IT', imageUrl: '', sourceUrl: 'https://www.autostrade.it' },
  { id: 'it-s07', title: 'GRA Roma Est', lat: 41.9021, lon: 12.5893, country: 'IT', imageUrl: '', sourceUrl: 'https://www.cciss.it' },
  { id: 'it-s08', title: 'Tangenziale Napoli Est', lat: 40.8518, lon: 14.3013, country: 'IT', imageUrl: '', sourceUrl: 'https://www.cciss.it' },
  { id: 'it-s09', title: 'A2 Reggio Calabria', lat: 38.1113, lon: 15.6617, country: 'IT', imageUrl: '', sourceUrl: 'https://www.cciss.it' },
  { id: 'it-s10', title: 'A14 Bari Palese', lat: 41.1333, lon: 16.7602, country: 'IT', imageUrl: '', sourceUrl: 'https://www.autostrade.it' },
];

interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string,unknown>> = [...STATIC_CAMS];

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
          id: `it-osm-${el.id}`,
          title: el.tags?.name ?? 'IT Webcam',
          lat: el.lat, lon: el.lon,
          country: 'IT',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* return static on failure */ }

  return NextResponse.json(results, { status: 200 });
}
