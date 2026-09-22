import { NextResponse } from 'next/server';

// Fintraffic / Digitraffic — CC BY 4.0 — no API key required
// https://www.digitraffic.fi/en/road-traffic/#camera-data
const STATIONS_URL = 'https://tie.digitraffic.fi/api/weathercam/v1/stations';
const IMAGE_BASE = 'https://weathercam.digitraffic.fi';

interface DigitrafficPreset {
  id: string;
  inCollection: boolean;
  presentationName?: string;
  imageUrl?: string;
}
interface DigitrafficStation {
  id: string;
  type: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    name: string;
    roadAddress?: { road?: number; roadSection?: number };
    presets?: DigitrafficPreset[];
  };
}

export async function GET() {
  try {
    const res = await fetch(STATIONS_URL, {
      headers: {
        'Accept-Encoding': 'gzip',
        'Digitraffic-User': 'world-webcams-map/1.0',
      },
      next: { revalidate: 600 },
    });

    if (!res.ok) return NextResponse.json({ error: 'Digitraffic error', status: res.status }, { status: 502 });

    const data = await res.json();
    const stations: DigitrafficStation[] = data?.features ?? [];

    const cams = stations
      .filter(s => s.geometry?.coordinates?.length === 2)
      .flatMap(s => {
        const [lon, lat] = s.geometry.coordinates;
        const presets: DigitrafficPreset[] = s.properties?.presets ?? [];
        const activePresets = presets.filter(p => p.inCollection);
        if (activePresets.length === 0) return [];
        const preset = activePresets[0];
        const imageUrl = preset.imageUrl
          ? `${IMAGE_BASE}${preset.imageUrl}`
          : `${IMAGE_BASE}/${preset.id}/latest`;
        return [{
          id: `fi-${s.id}`,
          title: s.properties?.name ?? s.id,
          lat, lon,
          country: 'FI',
          imageUrl,
          sourceUrl: `https://traffic.digitraffic.fi/camera/${s.id}`,
        }];
      });

    return NextResponse.json(cams, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
