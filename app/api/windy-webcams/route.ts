import { NextResponse } from 'next/server';

const BASE_URL = 'https://api.windy.com/webcams/api/v3/webcams';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox    = searchParams.get('bbox') ?? '90,180,-90,-180';
  const include = 'location,images,urls,player,categories';

  const apiKey = process.env.WINDY_WEBCAMS_API_KEY;

  // No key configured — return an empty result set so the map loads cleanly.
  // The client checks `missingKey: true` and shows a muted legend hint instead
  // of a red error badge.
  if (!apiKey) {
    return NextResponse.json(
      { webcams: [], total: 0, missingKey: true },
      { status: 200 },
    );
  }

  const url = `${BASE_URL}?bbox=${encodeURIComponent(bbox)}&include=${include}&limit=50`;
  console.log('[windy] fetching:', url);

  try {
    const res  = await fetch(url, {
      headers: { 'x-windy-api-key': apiKey, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    console.log('[windy] status:', res.status, 'body:', text.slice(0, 300));

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Windy API error', status: res.status, body: text },
        { status: 502 },
      );
    }

    return NextResponse.json(JSON.parse(text), { status: 200 });
  } catch (err: unknown) {
    console.error('[windy] fetch error:', err);
    return NextResponse.json(
      { error: 'Network error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
