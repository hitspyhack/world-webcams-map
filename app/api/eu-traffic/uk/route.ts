import { NextResponse } from 'next/server';

// TfL JamCams — TfL Open Data, no key required (optional TFL_APP_KEY raises rate limit)
// https://api.tfl.gov.uk/Place/Type/JamCam
const APP_KEY = process.env.TFL_APP_KEY ?? '';
const BASE_URL = `https://api.tfl.gov.uk/Place/Type/JamCam${APP_KEY ? `?app_key=${APP_KEY}` : ''}`;

interface TflPlace {
  id: string;
  commonName?: string;
  lat: number;
  lon: number;
  additionalProperties?: Array<{ key: string; value: string }>;
}

export async function GET() {
  try {
    const res = await fetch(BASE_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });

    if (!res.ok) return NextResponse.json({ error: 'TfL API error', status: res.status }, { status: 502 });

    const places: TflPlace[] = await res.json();

    const cams = (Array.isArray(places) ? places : []).map(p => {
      const props: Record<string, string> = {};
      for (const ap of p.additionalProperties ?? []) props[ap.key] = ap.value;
      return {
        id: `tfl-${p.id}`,
        title: p.commonName ?? p.id,
        lat: p.lat,
        lon: p.lon,
        country: 'GB',
        city: 'London',
        imageUrl: props['imageUrl'] ?? props['url'] ?? '',
        sourceUrl: `https://api.tfl.gov.uk/Place/${p.id}`,
        available: props['available'] === 'true',
      };
    }).filter(c => c.available);

    return NextResponse.json(cams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
