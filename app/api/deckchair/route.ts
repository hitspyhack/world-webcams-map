import { NextResponse } from 'next/server';

// Deckchair.com has a public (unauthenticated) REST API
// returning hundreds of webcams globally with coordinates.
const BASE_URL = 'https://api.deckchair.com/v1/cameras?limit=200&fields=_id,label,location,thumbnailUrl,embedUrl';

export async function GET() {
  try {
    const res = await fetch(BASE_URL, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 600 }, // cache 10 minutes
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Deckchair API error', status: res.status, body: text },
        { status: 502 }
      );
    }

    const json = await res.json();
    const items: DeckchairCamera[] = Array.isArray(json?.data) ? json.data : [];

    const webcams = items
      .filter((c) => c.location?.coordinates?.length === 2)
      .map((c) => ({
        id: `deckchair-${c._id}`,
        title: c.label ?? 'Deckchair Webcam',
        // GeoJSON: [lon, lat]
        lon: c.location.coordinates[0],
        lat: c.location.coordinates[1],
        thumbnailUrl: c.thumbnailUrl ?? '',
        embedUrl: c.embedUrl ?? '',
      }));

    return NextResponse.json(webcams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Network error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

interface DeckchairCamera {
  _id: string;
  label?: string;
  location: { type: string; coordinates: [number, number] };
  thumbnailUrl?: string;
  embedUrl?: string;
}
