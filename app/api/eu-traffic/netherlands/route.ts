import { NextResponse } from 'next/server';

// NDW (Nationaal Dataportaal Wegverkeer) Camera.json.gz was removed.
// Rijkswaterstaat thumbnail CDN (cameras.rijkswaterstaat.nl) is also unreachable.
// Falling back to Overpass-only for Dutch webcam nodes.
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:50.7,3.3,53.6,7.3];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 200;
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
      id:        `nl-osm-${el.id}`,
      title:     el.tags?.['name'] ?? el.tags?.['description'] ?? `Netherlands cam ${el.id}`,
      lat:       el.lat,
      lon:       el.lon,
      country:   'NL',
      imageUrl:  '',
      sourceUrl: el.tags?.['contact:webcam'] ?? el.tags?.['webcam'] ?? '',
    }));
    return NextResponse.json(cams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
