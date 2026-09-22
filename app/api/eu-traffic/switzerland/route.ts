import { NextResponse } from 'next/server';

// opentransportdata.swiss sstranl-webcam/v1 returns 404.
// Falling back to Overpass for Swiss OSM webcam nodes.
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:25][bbox:45.8,5.9,47.8,10.5];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 150;
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
      id:        `ch-osm-${el.id}`,
      title:     el.tags?.['name'] ?? el.tags?.['description'] ?? `Switzerland cam ${el.id}`,
      lat:       el.lat,
      lon:       el.lon,
      country:   'CH',
      imageUrl:  '',
      sourceUrl: el.tags?.['contact:webcam'] ?? el.tags?.['webcam'] ?? '',
    }));
    return NextResponse.json(cams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
