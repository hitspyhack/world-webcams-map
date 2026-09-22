import { NextResponse } from 'next/server';

// Statens vegvesen (Norwegian Public Roads Administration)
// Open data, no API key required
// https://nvdbapiles-v3.atlas.vegvesen.no/
const CAMERA_URL = 'https://www.vegvesen.no/ws/no/vegvesen/veg/trafikkbilde/listTrafikkbilde/v1?antall=1000';

interface VegvesenCamera {
  id?: string | number;
  navn?: string;
  wkt?: string;
  urlMedium?: string;
  urlLiten?: string;
  urlStor?: string;
}

function parseWkt(wkt?: string): { lat: number; lon: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\s*\(([\d.\-]+)\s+([\d.\-]+)\)/);
  if (!m) return null;
  return { lon: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

export async function GET() {
  try {
    const res = await fetch(CAMERA_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 120 },
    });

    if (!res.ok) return NextResponse.json({ error: 'Vegvesen error', status: res.status }, { status: 502 });

    const json = await res.json();
    const cameras: VegvesenCamera[] = json?.trafikkbildeResultat?.trafikkbilde ?? json?.trafikkbilde ?? [];

    const cams = cameras.map(c => {
      const geo = parseWkt(c.wkt);
      if (!geo) return null;
      return {
        id: `no-${c.id}`,
        title: c.navn ?? `Norway cam ${c.id}`,
        lat: geo.lat, lon: geo.lon,
        country: 'NO',
        imageUrl: c.urlMedium ?? c.urlLiten ?? c.urlStor ?? '',
      };
    }).filter(Boolean);

    return NextResponse.json(cams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
