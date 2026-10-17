import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { validBbox } from '../../../lib/viewport';
import { normalizeWindyCamera } from '../../../lib/windy';

const BASE_URL = 'https://api.windy.com/webcams/api/v3/webcams';
const CACHE_MS = 120_000; // Refresh frequently; media-token lifetime is provider-controlled.
const cache = new Map<string, { expires: number; body: unknown }>();
const pending = new Map<string, Promise<{ body: unknown; status: number }>>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get('bbox') ?? '90,180,-90,-180';
  const requestedLimit = Number(searchParams.get('limit') ?? '50');
  const offset = Number(searchParams.get('offset') ?? '0');
  const countries = searchParams.get('countries')?.toUpperCase();
  const categories = searchParams.get('categories') ?? undefined;
  if (!validBbox(bbox)) return NextResponse.json({ error: 'Invalid bbox. Expected north,east,south,west within geographic bounds.' }, { status: 400 });
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) return NextResponse.json({ error: 'Limit must be a positive integer.' }, { status: 400 });
  if (!Number.isInteger(offset) || offset < 0 || offset > 9950) return NextResponse.json({ error: 'Offset must be an integer between 0 and 9950.' }, { status: 400 });
  if (countries !== undefined && !/^[A-Z]{2}(,[A-Z]{2}){0,9}$/.test(countries)) return NextResponse.json({ error: 'Countries must be comma-separated ISO alpha-2 codes.' }, { status: 400 });
  if (categories !== undefined && !/^[a-zA-Z0-9_-]+(,[a-zA-Z0-9_-]+){0,9}$/.test(categories)) return NextResponse.json({ error: 'Invalid categories.' }, { status: 400 });
  const limit = Math.min(requestedLimit, 50);
  const apiKey = process.env.WINDY_WEBCAMS_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ webcams: [], total: 0, missingKey: true, offset, nextOffset: null });

  // Our public API uses N,E,S,W; Windy v3 expects S,W,N,E and cameraBoundingBox.
  const [north, east, south, west] = bbox.split(',').map(Number);
  const url = new URL(BASE_URL);
  url.searchParams.set('cameraBoundingBox', [south, west, north, east].join(','));
  url.searchParams.set('include', 'location,images,player,categories');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  if (countries) url.searchParams.set('countries', countries);
  if (categories) url.searchParams.set('categories', categories);
  const key = createHash('sha256').update(`${apiKey}:${url}`).digest('hex');
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.body, { headers: { 'X-Webcam-Cache': 'HIT' } });

  let work = pending.get(key);
  if (!work) {
    // Bounded in-process cache and concurrency; no unbounded global crawl.
    if (pending.size >= 8) return NextResponse.json({ error: 'Too many Windy requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': '5' } });
    work = (async () => {
      try {
        const response = await fetch(url.toString(), {
          headers: { 'x-windy-api-key': apiKey }, signal: AbortSignal.timeout(15_000), cache: 'no-store',
        });
        if (!response.ok) return { body: { error: 'Windy API error', status: response.status }, status: response.status === 429 ? 429 : 502 };
        const json = await response.json();
        if (!Array.isArray(json?.webcams)) throw new Error('Invalid upstream schema');
        const webcams = json.webcams.flatMap((value: unknown) => { const camera = normalizeWindyCamera(value); return camera ? [camera] : []; });
        const total = typeof json.total === 'number' && Number.isFinite(json.total) ? json.total : null;
        const next = offset + json.webcams.length;
        const body = { webcams, total, offset, limit, nextOffset: json.webcams.length === limit && next <= 9950 && (total === null || next < total) ? next : null, fetchedAt: new Date().toISOString(), attribution: 'Webcams provided by windy.com' };
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(key, { expires: Date.now() + CACHE_MS, body });
        return { body, status: 200 };
      } catch { return { body: { error: 'Windy is unavailable or returned an invalid response. Try again later.' }, status: 502 }; }
    })();
    pending.set(key, work);
  }
  try { const result = await work; return NextResponse.json(result.body, { status: result.status, headers: { 'X-Webcam-Cache': 'MISS' } }); }
  finally { if (pending.get(key) === work) pending.delete(key); }
}
