import { NextResponse } from 'next/server';

const ACTOR_ID = 'conversational_kermis~visionsync-skylinewebcams';
const APIFY_API_BASE = 'https://api.apify.com/v2/actors';

// Default locations to fan out across when no specific URLs are given.
// Keep the list short to stay within free-tier limits; add more as needed.
const DEFAULT_LOCATIONS = [
  'Rome', 'Paris', 'Barcelona', 'London', 'Amsterdam',
  'Tokyo', 'New York', 'Sydney', 'Dubai', 'Bangkok',
];

/** Strip the boilerplate SkylineWebcams injects into every title. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\u300aLIVE\u300b/gi, '')
    .replace(/\[\[?LIVE\]?\]/gi, '')
    .replace(/【LIVE】/g, '')
    .replace(/\| SkylineWebcams$/i, '')
    .replace(/- SkylineWebcams$/i, '')
    .trim();
}

async function runActor(
  token: string,
  input: Record<string, unknown>,
): Promise<SkylineRecord[]> {
  const url = `${APIFY_API_BASE}/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify ${res.status}: ${text.slice(0, 200)}`);
  }
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as SkylineRecord[]) : [];
}

export async function POST(request: Request) {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'APIFY_TOKEN not configured — add it to .env.local' },
      { status: 500 },
    );
  }

  let body: { location?: string; locations?: string[]; startUrls?: Array<{ url: string }> } = {};
  try { body = await request.json(); } catch { body = {}; }

  const startUrls = body.startUrls ?? [];

  // Build the list of locations to query in parallel
  let locations: string[] = [];
  if (startUrls.length > 0) {
    // URL-based run: single actor call, no location fanning
    const items = await runActor(token, {
      startUrls,
      proxyConfiguration: { useApifyProxy: true },
    }).catch(() => []);
    const results = items.map(normalise).filter(Boolean) as SkylineItem[];
    return NextResponse.json(results, { status: 200 });
  }

  if (body.locations && body.locations.length > 0) {
    locations = body.locations;
  } else if (body.location) {
    locations = [body.location];
  } else {
    locations = DEFAULT_LOCATIONS;
  }

  // Fan out all location queries in parallel
  const settled = await Promise.allSettled(
    locations.map(loc =>
      runActor(token, {
        location: loc,
        proxyConfiguration: { useApifyProxy: true },
      }),
    ),
  );

  // Merge and deduplicate by visionSyncId
  const seen = new Set<string>();
  const merged: SkylineItem[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const raw of result.value) {
      const item = normalise(raw);
      if (!item) continue;
      const key = raw.visionSyncId ?? item.url ?? `${item.lat}-${item.lon}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return NextResponse.json(merged, { status: 200 });
}

// ---------------------------------------------------------------------------
// Types that mirror the actual Apify actor output schema
// ---------------------------------------------------------------------------

interface SkylineEnrichmentLocation {
  city?: string;
  country?: string;
  countryCode?: string;
  lat?: number;
  lon?: number;
  coordsSource?: string;
}

interface SkylineRecord {
  visionSyncId?: string;
  url?: string;
  title?: string;
  description?: string;
  snapshotUrl?: string;
  snapshot?: { url?: string; ageSeconds?: number; state?: string };
  tags?: string[];
  enrichment?: {
    location?: SkylineEnrichmentLocation;
    weather?: { temp?: string; condition?: string; wind?: string };
    timezone?: string;
    elevation?: number;
  };
  provider?: string;
}

/** Normalised flat shape sent to the client (matches SkylineItem in types/webcam.ts) */
interface SkylineItem {
  id: string;
  url: string;
  title: string;
  snapshotUrl: string;
  lat: number;
  lon: number;
  city: string;
  country: string;
  countryCode: string;
  tags: string[];
  weather?: { temp?: string; condition?: string; wind?: string };
}

function normalise(raw: SkylineRecord): SkylineItem | null {
  const loc = raw.enrichment?.location;
  if (!loc?.lat || !loc?.lon) return null;            // no coords → skip
  const snap = raw.snapshotUrl ?? raw.snapshot?.url;
  if (!snap) return null;                              // no image → skip
  return {
    id:          raw.visionSyncId ?? raw.url ?? `${loc.lat}-${loc.lon}`,
    url:         raw.url ?? '',
    title:       cleanTitle(raw.title ?? 'Skyline webcam'),
    snapshotUrl: snap,
    lat:         loc.lat,
    lon:         loc.lon,
    city:        loc.city ?? '',
    country:     loc.country ?? '',
    countryCode: loc.countryCode ?? '',
    tags:        raw.tags ?? [],
    weather:     raw.enrichment?.weather,
  };
}
