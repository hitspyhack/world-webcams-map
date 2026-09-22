import { NextResponse } from 'next/server';

// OSM Overpass — highway/traffic cameras with image URLs in Europe
// Bounding box: Europe roughly 34,-25 to 72,45
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const QUERY = `
[out:json][timeout:40][bbox:34,-25,72,45];
(
  node["man_made"="surveillance"]["surveillance:type"="camera"]["contact:webcam"];
  node["man_made"="surveillance"]["camera:type"="traffic"]["contact:webcam"];
  node["highway"="camera"]["contact:webcam"];
  node["traffic_calming"]["contact:webcam"];
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
      body: `data=${encodeURIComponent(QUERY)}`,
      next: { revalidate: 7200 },
    });

    if (!res.ok) return NextResponse.json({ error: 'Overpass error', status: res.status }, { status: 502 });

    const data = await res.json();
    const elements: OsmNode[] = data?.elements ?? [];

    const cams = elements.map(el => ({
      id: `osm-road-${el.id}`,
      title: el.tags?.name ?? el.tags?.['name:en'] ?? 'Road camera',
      lat: el.lat,
      lon: el.lon,
      country: el.tags?.['addr:country'] ?? '',
      webcamUrl: el.tags?.['contact:webcam'] ?? '',
      operator: el.tags?.operator ?? '',
      surveillanceType: el.tags?.['surveillance:type'] ?? '',
    })).filter(c => c.webcamUrl);

    return NextResponse.json(cams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
