import { NextResponse } from 'next/server';

// GDDKiA mzkodm endpoint returns 000 (connection refused).
// Falling back to Overpass for Polish OSM webcam nodes.
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30][bbox:49.0,14.1,54.8,24.2];
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
      id:        `pl-osm-${el.id}`,
      title:     el.tags?.['name'] ?? el.tags?.['description'] ?? `Poland cam ${el.id}`,
      lat:       el.lat,
      lon:       el.lon,
      country:   'PL',
      imageUrl:  '',
      sourceUrl: el.tags?.['contact:webcam'] ?? el.tags?.['webcam'] ?? '',
    }));
    return NextResponse.json(cams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
