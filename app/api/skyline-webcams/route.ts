import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Free replacement for the previous Apify-based SkylineWebcams scraper.
// Uses the OpenStreetMap Overpass API — completely free, no API key required.
// Queries webcam nodes worldwide that have a name or description tag,
// returning the same SkylineItem shape the client already expects.
// ---------------------------------------------------------------------------

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// We fan out across several bounding boxes so we get global coverage without
// hitting Overpass timeout limits. Each box is [south, west, north, east].
const REGIONS: Array<[number, number, number, number]> = [
  // Europe
  [35, -10, 72, 40],
  // North America
  [15, -130, 60, -60],
  // East Asia
  [10, 100, 55, 145],
  // South / SE Asia
  [-10, 60, 35, 110],
  // Oceania
  [-50, 110, 0, 180],
  // South America
  [-60, -85, 15, -30],
  // Africa & Middle East
  [-40, -20, 40, 60],
];

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface OverpassResult {
  elements: OverpassNode[];
}

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
}

function buildQuery(s: number, w: number, n: number, e: number): string {
  const bbox = `${s},${w},${n},${e}`;
  return [
    '[out:json][timeout:25];',
    `node["man_made"="surveillance"]["surveillance:type"="camera"](${bbox});`,
    'out body 300;',
  ].join('');
}

function toItem(node: OverpassNode): SkylineItem | null {
  const t = node.tags;
  // Must have a name or description to be useful
  const title = t.name || t.description || t['camera:type'] || '';
  if (!title) return null;

  // Optional snapshot — some nodes link to a live image
  const snapshotUrl =
    t['contact:webcam'] ||
    t.url ||
    t.website ||
    t['image'] ||
    '';

  // Derive a stable URL for the camera
  const url = t['contact:webcam'] || t.url || t.website || `https://www.openstreetmap.org/node/${node.id}`;

  return {
    id: `osm-surv-${node.id}`,
    url,
    title: title.slice(0, 120),
    snapshotUrl,
    lat: node.lat,
    lon: node.lon,
    city: t['addr:city'] || t.city || '',
    country: t['addr:country'] || '',
    countryCode: (t['addr:country'] || '').toUpperCase().slice(0, 2),
    tags: [
      t['surveillance:type'],
      t['camera:type'],
      t['surveillance'],
    ].filter(Boolean) as string[],
  };
}

export async function POST() {
  try {
    // Fire all region queries in parallel
    const settled = await Promise.allSettled(
      REGIONS.map(([s, w, n, e]) =>
        fetch(OVERPASS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(buildQuery(s, w, n, e))}`,
          signal: AbortSignal.timeout(30_000),
        }).then(r => r.json() as Promise<OverpassResult>)
      )
    );

    const seen = new Set<string>();
    const items: SkylineItem[] = [];

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const node of result.value.elements ?? []) {
        const item = toItem(node);
        if (!item) continue;
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
    }

    return NextResponse.json(items, { status: 200 });
  } catch (err: unknown) {
    console.error('[skyline-overpass] error:', err);
    return NextResponse.json(
      { error: 'Overpass query failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
