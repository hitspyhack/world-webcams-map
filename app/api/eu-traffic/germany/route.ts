import { NextResponse } from 'next/server';

// BASt / Mobilitätsdatenmarktplatz (MDM) — open data, no key
// Autobahn webcam list is published as GeoJSON by the Autobahn GmbH REST API
const AUTOBAHN_CAMS = 'https://verkehr.autobahn.de/o/autobahn/cameras';
// Fallback: Overpass for German OSM webcam nodes
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:47.2,5.8,55.1,15.1];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 300;
`;

interface AutobahnCam {
  identifier?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  point?: { lat: string; long: string };
  imageurl?: string;
  linkurl?: string;
}

interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: ReturnType<typeof normAutobahn>[] = [];

  // 1 — Autobahn GmbH camera list (JSON)
  try {
    const roads = [
      'A1','A2','A3','A4','A5','A6','A7','A8','A9','A10',
      'A11','A12','A13','A14','A15','A20','A24','A25','A27','A28',
      'A29','A30','A31','A33','A38','A39','A40','A42','A43','A44',
      'A45','A46','A48','A49','A52','A57','A59','A60','A61','A63',
      'A64','A65','A66','A67','A70','A71','A72','A73','A81','A92',
      'A93','A94','A95','A96','A99',
    ];
    // Fan out in parallel (each returns its cameras array), cap at 20 roads
    const batch = roads.slice(0, 20);
    const settled = await Promise.allSettled(
      batch.map(r => fetch(`${AUTOBAHN_CAMS}/${r}`, { next: { revalidate: 120 } }))
    );
    for (const s of settled) {
      if (s.status !== 'fulfilled' || !s.value.ok) continue;
      const j: { camera?: AutobahnCam[] } = await s.value.json().catch(() => ({}));
      for (const c of j.camera ?? []) {
        const n = normAutobahn(c);
        if (n) results.push(n);
      }
    }
  } catch { /* continue to Overpass */ }

  // 2 — OSM Overpass fallback (fills gaps for Bundesstraßen / city cams)
  if (results.length < 5) {
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
            id: `de-osm-${el.id}`,
            title: el.tags?.name ?? 'DE Webcam',
            lat: el.lat, lon: el.lon,
            country: 'DE',
            imageUrl: '',
            sourceUrl: url,
          });
        }
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json(results, { status: 200 });
}

function normAutobahn(c: AutobahnCam) {
  if (!c.point?.lat || !c.point?.long) return null;
  return {
    id: `de-${c.identifier ?? Math.random().toString(36).slice(2)}`,
    title: [c.title, c.subtitle].filter(Boolean).join(' — ') || 'Autobahn cam',
    lat: parseFloat(c.point.lat),
    lon: parseFloat(c.point.long),
    country: 'DE',
    imageUrl: c.imageurl ?? '',
    sourceUrl: c.linkurl ?? 'https://autobahn.de',
  };
}
