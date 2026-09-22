import { NextResponse } from 'next/server';

// DGT (Dirección General de Tráfico) — open data, no key
// https://datos.gob.es/es/catalogo/e00125901-catalogo-de-datos-de-trafico
// The live camera feed is available as open JSON from the DGT open-data portal.
const DGT_CAMERAS = 'https://infocar.dgt.es/etraffic/BuscarElementos?latNE=43.8&lonNE=3.3&latSW=35.9&lonSW=-9.3&zoom=6&accion=getRadares&datos_query=true&minLat=35.9&minLon=-9.3&maxLat=43.8&maxLon=3.3';
const CCTV_URL     = 'https://infocar.dgt.es/etraffic/BuscarElementos?latNE=43.8&lonNE=3.3&latSW=35.9&lonSW=-9.3&zoom=6&accion=getCamaras&datos_query=true&minLat=35.9&minLon=-9.3&maxLat=43.8&maxLon=3.3';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:35.9,-9.3,43.8,3.4];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 300;
`;

interface DgtCam { id?: string | number; descripcion?: string; latitud?: number; longitud?: number; urlImagen?: string; }
interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string, unknown>> = [];

  // 1 — DGT CCTV cameras
  try {
    const res = await fetch(CCTV_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 120 },
    });
    if (res.ok) {
      const json = await res.json();
      const cams: DgtCam[] = Array.isArray(json) ? json : (json?.camaras ?? json?.elements ?? []);
      for (const c of cams) {
        if (!c.latitud || !c.longitud) continue;
        results.push({
          id: `es-dgt-${c.id}`,
          title: c.descripcion ?? `DGT cam ${c.id}`,
          lat: c.latitud, lon: c.longitud,
          country: 'ES',
          imageUrl: c.urlImagen ?? '',
          sourceUrl: 'https://infocar.dgt.es',
        });
      }
    }
  } catch { /* continue */ }

  // 2 — Overpass
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
          id: `es-osm-${el.id}`,
          title: el.tags?.name ?? 'ES Webcam',
          lat: el.lat, lon: el.lon,
          country: 'ES',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
