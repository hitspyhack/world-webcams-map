import { NextResponse } from 'next/server';

// Trafikverket Open API — free registration required for API key
// https://api.trafikinfo.trafikverket.se/
// Set TRAFIKVERKET_API_KEY in env — without it, returns empty array gracefully.
const API_KEY = process.env.TRAFIKVERKET_API_KEY ?? '';
const ENDPOINT = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

// DATEX2/XML-ish JSON request body — camera locations + latest image
const buildBody = (key: string) => JSON.stringify({
  REQUEST: {
    LOGIN: { attributes: { authenticationkey: key } },
    QUERY: [{
      attributes: { objecttype: 'Camera', schemaversion: '1' },
      FILTER: {},
      INCLUDE: [
        'Id', 'Name', 'Geometry.WGS84', 'PhotoTime',
        'PhotoUrl', 'HasFullSizePhoto', 'Active', 'Type',
        'County', 'Bearing',
      ],
    }],
  },
});

interface TrafikverketCamera {
  Id?: string;
  Name?: string;
  'Geometry.WGS84'?: string;
  PhotoUrl?: string;
  PhotoTime?: string;
  Active?: boolean;
  County?: string;
  Type?: string;
}

function parseWgs84(wkt?: string): { lat: number; lon: number } | null {
  if (!wkt) return null;
  // "POINT (lon lat)"
  const m = wkt.match(/POINT\s*\(([\d.\-]+)\s+([\d.\-]+)\)/);
  if (!m) return null;
  return { lon: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'TRAFIKVERKET_API_KEY not set', cameras: [] },
      { status: 200 }
    );
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: buildBody(API_KEY),
      next: { revalidate: 120 },
    });

    if (!res.ok) return NextResponse.json({ error: 'Trafikverket error', status: res.status }, { status: 502 });

    const json = await res.json();
    const raw: TrafikverketCamera[] = json?.RESPONSE?.RESULT?.[0]?.Camera ?? [];

    const cams = raw
      .filter(c => c.Active !== false)
      .map(c => {
        const geo = parseWgs84(c['Geometry.WGS84']);
        if (!geo) return null;
        return {
          id: `se-${c.Id}`,
          title: c.Name ?? c.Id ?? 'Swedish camera',
          lat: geo.lat, lon: geo.lon,
          country: 'SE',
          county: c.County,
          imageUrl: c.PhotoUrl ?? '',
          photoTime: c.PhotoTime ?? '',
          type: c.Type,
        };
      })
      .filter(Boolean);

    return NextResponse.json(cams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
