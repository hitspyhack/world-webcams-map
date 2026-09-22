import { NextResponse } from 'next/server';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Query OSM nodes tagged with contact:webcam (live stream/image URLs)
const QUERY = `
[out:json][timeout:30];
(
  node["contact:webcam"];
  node["webcam"];
);
out body 200;
`;

export async function GET() {
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(QUERY)}`,
      next: { revalidate: 3600 }, // cache 1 hour — OSM data changes slowly
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Overpass API error', status: res.status, body: text },
        { status: 502 }
      );
    }

    const data = await res.json();
    const elements: OverpassElement[] = data?.elements ?? [];

    // Normalize to a flat webcam object
    const webcams = elements
      .filter((el) => el.lat != null && el.lon != null)
      .map((el) => ({
        id: `osm-${el.id}`,
        title: el.tags?.name ?? el.tags?.['name:en'] ?? 'OSM Webcam',
        lat: el.lat,
        lon: el.lon,
        country: el.tags?.['addr:country'] ?? '',
        city: el.tags?.['addr:city'] ?? el.tags?.['is_in:city'] ?? '',
        webcamUrl: el.tags?.['contact:webcam'] ?? el.tags?.['webcam'] ?? '',
        operator: el.tags?.operator ?? '',
      }))
      .filter((c) => c.webcamUrl);

    return NextResponse.json(webcams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Network error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

interface OverpassElement {
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}
