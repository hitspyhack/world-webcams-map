import { NextResponse } from 'next/server';

// NordAPI — free, keyless
// Tallinn traffic cameras: 255 cams
// Estonian road cameras: 182 cams (Transpordiamet TarkTee)
const TALLINN_URL = 'https://nordapi.ee/api/v1/tallinn/cameras';
const ROADS_URL   = 'https://nordapi.ee/api/v1/estonian-roads/cameras';

interface TallinnCamera {
  id: string | number;
  name?: string;
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  image_url?: string;
  district?: string;
}
interface RoadCamera {
  id: string | number;
  name?: string;
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  image_url?: string;
  road_condition?: string;
  air_temperature?: number;
}

export async function GET() {
  try {
    const [r1, r2] = await Promise.all([
      fetch(TALLINN_URL, { next: { revalidate: 30 } }),
      fetch(ROADS_URL,   { next: { revalidate: 30 } }),
    ]);

    const tallinnData = r1.ok ? await r1.json() : { cameras: [] };
    const roadsData   = r2.ok ? await r2.json() : { cameras: [] };

    const tallinnCams: TallinnCamera[] = Array.isArray(tallinnData) ? tallinnData : (tallinnData.cameras ?? tallinnData.data ?? []);
    const roadCams:    RoadCamera[]    = Array.isArray(roadsData)   ? roadsData   : (roadsData.cameras   ?? roadsData.data   ?? []);

    const normalize = (cam: TallinnCamera | RoadCamera, prefix: string, extra?: Record<string, unknown>) => ({
      id: `${prefix}-${cam.id}`,
      title: cam.name ?? `${prefix} cam ${cam.id}`,
      lat: cam.lat ?? cam.latitude ?? 0,
      lon: cam.lon ?? cam.longitude ?? 0,
      country: 'EE',
      imageUrl: cam.imageUrl ?? cam.image_url ?? '',
      ...extra,
    });

    const results = [
      ...tallinnCams.filter(c => (c.lat ?? c.latitude) && (c.lon ?? c.longitude))
        .map(c => normalize(c, 'ee-tallinn', { city: 'Tallinn', district: (c as TallinnCamera).district })),
      ...roadCams.filter(c => (c.lat ?? c.latitude) && (c.lon ?? c.longitude))
        .map(c => normalize(c, 'ee-road', { roadCondition: (c as RoadCamera).road_condition, airTemp: (c as RoadCamera).air_temperature })),
    ];

    return NextResponse.json(results, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
