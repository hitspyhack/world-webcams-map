import { NextResponse } from 'next/server';

// Statens vegvesen — NVDB Atlas REST API v3 (open data, no key)
// https://nvdbapiles.atlas.vegvesen.no/
// Object type 91 = Trafikktelling (traffic count cameras)
// Object type 4  = Veg-trafikk-kamera — query cameras via road objects
const NVDB_CAMERAS_URL =
  'https://nvdbapiles.atlas.vegvesen.no/vegobjekter/616' +
  '?srid=wgs84&inkluder=egenskaper,geometri,lokasjon&antall=500';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:57.9,4.5,71.2,31.1];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 200;
`;

interface NvdbGeometry { wkt?: string; }
interface NvdbEgenskap { id: number; navn: string; verdi?: string; }
interface NvdbObject {
  id: number;
  geometri?: NvdbGeometry;
  egenskaper?: NvdbEgenskap[];
  lokasjon?: { stedfestinger?: Array<{ kortform?: string }> };
}
interface NvdbResponse { objekter?: NvdbObject[]; }

function parseWktPoint(wkt?: string): { lat: number; lon: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\s*\(([\d.\-]+)\s+([\d.\-]+)\)/);
  if (!m) return null;
  return { lon: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export async function GET() {
  const results: Array<{
    id: string; title: string; lat: number; lon: number;
    country: string; imageUrl: string; sourceUrl: string;
  }> = [];

  // — NVDB Atlas —
  try {
    const res = await fetch(NVDB_CAMERAS_URL, {
      headers: { 'Accept': 'application/vnd.vegvesen.nvdb-v3-rev1+json' },
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data: NvdbResponse = await res.json();
      for (const obj of data.objekter ?? []) {
        const coords = parseWktPoint(obj.geometri?.wkt);
        if (!coords) continue;
        const navn = obj.egenskaper?.find(e => e.id === 8127)?.verdi
          ?? obj.egenskaper?.find(e => e.navn?.toLowerCase().includes('navn'))?.verdi
          ?? `NO-${obj.id}`;
        results.push({
          id: `no-nvdb-${obj.id}`,
          title: navn,
          lat: coords.lat,
          lon: coords.lon,
          country: 'NO',
          imageUrl: '',
          sourceUrl: `https://vegkart.atlas.vegvesen.no/#kartlag:geodata/@${coords.lon},${coords.lat},15`,
        });
      }
    }
  } catch { /* fall through to Overpass */ }

  // — Overpass fallback / supplement —
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data: { elements?: OsmNode[] } = await res.json();
      const existing = new Set(results.map(r => r.id));
      for (const el of data.elements ?? []) {
        const id = `no-osm-${el.id}`;
        if (existing.has(id)) continue;
        const url = el.tags?.['contact:webcam'] ?? el.tags?.['webcam'] ?? '';
        results.push({
          id,
          title: el.tags?.['name'] ?? el.tags?.['description'] ?? `Norway OSM ${el.id}`,
          lat: el.lat,
          lon: el.lon,
          country: 'NO',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
