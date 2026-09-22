import { NextResponse } from 'next/server';

const ACTOR_ID = 'conversational_kermis~visionsync-skylinewebcams';
const APIFY_API_BASE = 'https://api.apify.com/v2/actors';

export async function POST(request: Request) {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'APIFY_TOKEN not configured — add it to .env.local' },
      { status: 500 }
    );
  }

  let body: { location?: string; startUrls?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const location = body.location ?? 'Rome';
  const startUrls = body.startUrls ?? [];

  const input = {
    location,
    startUrls,
    proxyConfiguration: { useApifyProxy: true },
  };

  const url = `${APIFY_API_BASE}/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Apify Skyline Actor error', status: res.status, body: text },
        { status: 502 }
      );
    }

    const items: unknown = await res.json();
    // Always return an array — never let a non-array reach the client
    const safeItems = Array.isArray(items) ? items : [];
    return NextResponse.json(safeItems, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Network error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
