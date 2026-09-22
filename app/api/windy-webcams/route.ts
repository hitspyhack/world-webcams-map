import { NextResponse } from 'next/server';

const BASE_URL = 'https://api.windy.com/webcams/api/v3/webcams';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get('bbox') ?? '90,180,-90,-180';
  const include = 'location,images,urls,player,categories';

  const apiKey = process.env.WINDY_WEBCAMS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'WINDY_WEBCAMS_API_KEY not configured' },
      { status: 500 }
    );
  }

  const url = `${BASE_URL}?bbox=${bbox}&include=${include}`;

  try {
    const res = await fetch(url, {
      headers: {
        'x-windy-api-key': apiKey,
      },
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
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Network or fetch error', message: err?.message },
      { status: 500 }
    );
  }
}
