import { NextResponse } from 'next/server';

// DIRIF / Sytadin — Île-de-France traffic cameras
// Open data published by DRIEAT (Direction Régionale et Interdépartementale)
// The GeoJSON endpoint is public and unauthenticated.
const SYTADIN_URL = 'https://www.sytadin.fr/sys/live/getCameraList.jsp';
// Overpass fallback — French OSM webcam nodes
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:41.3,-5.2,51.1,9.7];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 300;
`;

interface SytadinCamera {
  id?: string | number;
  libelle?: string;
  codeAxe?: string;
  latitude?: number;
  longitude?: number;
  urlImage?: string;
  urlFlux?: string;
}

interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string,string>; }

export async function GET() {
  const results: Array<Record<string, unknown>> = [];

  // 1 — Sytadin live camera list
  try {
    const res = await fetch(SYTADIN_URL, {
      headers: { Accept: 'application/json, */*' },
      next: { revalidate: 60 },
    });
    if (res.ok) {
      let json: unknown;
      const text = await res.text();
      try { json = JSON.parse(text); } catch { json = null; }
      const cams: SytadinCamera[] = Array.isArray(json) ? json
        : Array.isArray((json as Record<string,unknown>)?.cameras) ? (json as Record<string,unknown[]>).cameras as SytadinCamera[]
        : [];
      for (const c of cams) {
        if (!c.latitude || !c.longitude) continue;
        results.push({
          id: `fr-sytadin-${c.id}`,
          title: c.libelle ?? c.codeAxe ?? 'France cam',
          lat: c.latitude, lon: c.longitude,
          country: 'FR',
          imageUrl: c.urlImage ?? '',
          sourceUrl: c.urlFlux ?? 'https://www.sytadin.fr',
        });
      }
    }
  } catch { /* fall through */ }

  // 2 — OSM Overpass (France-wide)
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
          id: `fr-osm-${el.id}`,
          title: el.tags?.name ?? 'FR Webcam',
          lat: el.lat, lon: el.lon,
          country: 'FR',
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results, { status: 200 });
}
