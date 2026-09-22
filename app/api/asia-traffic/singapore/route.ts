import { NextResponse } from 'next/server';

// LTA DataMall Traffic-Imagesv2 — Singapore official open data
// Register free at: https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html
// Returns ~90 expressway + checkpoint camera images, updated every 20s
const ACCOUNT_KEY = process.env.LTA_ACCOUNT_KEY ?? '';
const LTA_URL = 'https://datamall2.mytransport.sg/ltaodataservice/Traffic-Imagesv2';

interface LtaTrafficImage {
  CameraID: string;
  Latitude: number;
  Longitude: number;
  ImageLink: string;
}

export async function GET() {
  if (!ACCOUNT_KEY) {
    return NextResponse.json(
      { error: 'LTA_ACCOUNT_KEY not set — register free at datamall.lta.gov.sg', cameras: [] },
      { status: 200 }
    );
  }

  try {
    const res = await fetch(LTA_URL, {
      headers: {
        AccountKey: ACCOUNT_KEY,
        accept: 'application/json',
      },
      next: { revalidate: 20 }, // LTA updates every 20 seconds
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'LTA DataMall error', status: res.status },
        { status: 502 }
      );
    }

    const json = await res.json();
    const items: LtaTrafficImage[] = json?.value ?? [];

    const cameras = items
      .filter(cam => cam.Latitude && cam.Longitude)
      .map(cam => ({
        id: `sg-${cam.CameraID}`,
        title: `SG Traffic Cam ${cam.CameraID}`,
        lat: cam.Latitude,
        lon: cam.Longitude,
        country: 'SG',
        city: 'Singapore',
        imageUrl: cam.ImageLink,
        sourceUrl: 'https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html',
        sourceCountry: 'SG',
      }));

    return NextResponse.json(cameras, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
