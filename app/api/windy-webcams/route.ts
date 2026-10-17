import { NextResponse } from 'next/server';
import { validBbox } from '../../../lib/viewport';

// ---------------------------------------------------------------------------
// Windy Webcams API v3
// Requires WINDY_WEBCAMS_API_KEY in .env.local (free tier available at
// https://api.windy.com). When the key is absent the route returns an empty
// result with missingKey:true so the client shows a muted hint rather than
// a red error badge — the map still loads cleanly without a key.
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.windy.com/webcams/api/v3/webcams';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox    = searchParams.get('bbox') ?? '90,180,-90,-180';
  const requestedLimit = Number(searchParams.get('limit') ?? '50');
  if (!validBbox(bbox)) return NextResponse.json({ error: 'Invalid bbox. Expected north,east,south,west within geographic bounds.' }, { status: 400 });
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) return NextResponse.json({ error: 'Limit must be a positive integer.' }, { status: 400 });
  const limit = Math.min(requestedLimit, 50);
  const include = 'location,images,urls,player,categories';

  const apiKey = process.env.WINDY_WEBCAMS_API_KEY;

  // No key — return an empty result set so the map loads cleanly.
  // The client checks `missingKey: true` and skips silently.
  if (!apiKey) {
    return NextResponse.json(
      { webcams: [], total: 0, missingKey: true },
      { status: 200 }
    );
  }

  const url = `${BASE_URL}?bbox=${encodeURIComponent(bbox)}&include=${include}&limit=${limit}`;

  try {
    const res  = await fetch(url, {
      headers: { 'x-windy-api-key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Windy API error', status: res.status },
        { status: 502 }
      );
    }

    return NextResponse.json(JSON.parse(text), { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Network error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
