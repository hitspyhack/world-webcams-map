import { NextResponse } from 'next/server';

// DIRIF / Sytadin getCameraList.jsp is unreachable (DRIEAT datacenter block).
// Falling back to Overpass for French OSM webcam nodes.
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:41.3,-5.2,51.1,9.7];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 300;
`;

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export async function GET() {
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json([], { status: 200 });

    const data: { elements?: OsmNode[] } = await res.json();
    const cams = (data.elements ?? []).map(el => ({
      id:        `fr-osm-${el.id}`,
      title:     el.tags?.['name'] ?? el.tags?.['description'] ?? `France cam ${el.id}`,
      lat:       el.lat,
      lon:       el.lon,
      country:   'FR',
      imageUrl:  '',
      sourceUrl: el.tags?.['contact:webcam'] ?? el.tags?.['webcam'] ?? '',
    }));
    return NextResponse.json(cams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
