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

  // Use a smaller bounding box for initial load to stay within free tier limits
  const url = `${BASE_URL}?bbox=${encodeURIComponent(bbox)}&include=${include}&limit=50`;

  console.log('[windy] fetching:', url);

  try {
    const res = await fetch(url, {
      headers: {
        'x-windy-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const text = await res.text();
    console.log('[windy] status:', res.status, 'body:', text.slice(0, 300));

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Windy API error', status: res.status, body: text },
        { status: 502 }
      );
    }

    const data = JSON.parse(text);
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    console.error('[windy] fetch error:', err);
    return NextResponse.json(
      { error: 'Network error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
