import { NextResponse } from 'next/server';

const BASE_URL = 'https://api.windy.com/webcams/api/v3/webcams';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get('bbox') ?? '90,180,-90,-180';
  const include = 'location,images,urls,player,categories';

  const apiKey = process.env.WINDY_WEBCAMS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'WINDY_WEBCAMS_API_KEY not configured — add it to .env.local' },
      { status: 500 }
    );
  }

  const url = `${BASE_URL}?bbox=${encodeURIComponent(bbox)}&include=${include}&limit=100`;

  try {
    const res = await fetch(url, {
      headers: { 'x-windy-api-key': apiKey },
      next: { revalidate: 300 }, // cache 5 minutes
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Windy API error', status: res.status, body: text },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Network error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
