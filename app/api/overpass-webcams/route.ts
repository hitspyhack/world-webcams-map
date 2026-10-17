import { NextResponse } from 'next/server';
import { validBbox } from '../../../lib/viewport';
import { hasCoordinates, isPublicWebUrl } from '../../../lib/cameras';

// Four public mirrors — tried in order, first success wins.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// Regional bounding boxes cover inhabited areas while keeping each query small.
// Running them in parallel keeps each query small and fast.
const REGIONS: Array<{ name: string; bbox: string }> = [
  { name: 'Antarctica', bbox: '-90,-180,-60,180' },
  { name: 'Alaska + W. Pacific', bbox: '45,-180,75,-130' },
  { name: 'Caribbean + C. America', bbox: '5,-100,25,-55' },
  { name: 'Europe',       bbox: '35,-10,70,40'    },
  { name: 'N. Atlantic',  bbox: '60,-25,85,60'    },
  { name: 'N. America',   bbox: '15,-170,75,-50'  },
  { name: 'S. America',   bbox: '-60,-85,15,-30'  },
  { name: 'Asia-E',       bbox: '-10,60,60,145'   },
  { name: 'Central Asia', bbox: '5,35,60,100'     },
  { name: 'N. Pacific',   bbox: '-10,145,60,180'  },
  { name: 'Africa+ME',    bbox: '-40,-20,40,60'   },
  { name: 'Oceania',      bbox: '-50,110,0,180'   },
  { name: 'S. Oceania',   bbox: '-60,110,-50,180' },
];

function buildQuery(bbox: string, limit = 250): string {
  return (
    `[out:json][timeout:25][bbox:${bbox}];` +
    `(nwr["contact:webcam"];nwr["webcam"];);` +
    `out body center ${limit};`
  );
}

async function fetchRegion(query: string): Promise<OverpassElement[]> {
  const body = `data=${encodeURIComponent(query)}`;
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        signal: AbortSignal.timeout(7_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        // Next.js fetch cache — revalidate every hour (OSM data changes slowly)
        next: { revalidate: 3600 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data?.elements)) continue;
      return data.elements;
    } catch {
      // try next mirror
    }
  }
  throw new Error('All Overpass mirrors are unavailable');
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const bbox = params.get('bbox');
  const limit = Number(params.get('limit') ?? '250');
  if (bbox !== null && !validBbox(bbox)) return NextResponse.json({ error: 'Invalid bbox. Expected north,east,south,west.' }, { status: 400 });
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return NextResponse.json({ error: 'Limit must be an integer between 1 and 500.' }, { status: 400 });
  const regions = bbox ? (() => {
    const [n, e, s, w] = bbox.split(',').map(Number);
    return [{ name: 'Requested area', bbox: [s, w, n, e].join(',') }];
  })() : REGIONS;
  try {
    // Fan out all regions in parallel
    const settled = await Promise.allSettled(
      regions.map(r => fetchRegion(buildQuery(r.bbox, limit)))
    );

    if (settled.every(result => result.status === 'rejected')) {
      return NextResponse.json({ error: 'OpenStreetMap providers are unavailable. Try again later.' }, { status: 502 });
    }

    // Merge and deduplicate by OSM node id
    const seen = new Set<string>();
    const webcams: NormWebcam[] = [];

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        const el = { ...item, lat: item.lat ?? item.center?.lat, lon: item.lon ?? item.center?.lon };
        if (!hasCoordinates(el)) continue;
        const key = `${el.type ?? 'node'}-${el.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const webcamUrl =
          el.tags?.['contact:webcam'] ??
          el.tags?.['webcam'] ??
          '';
        if (!isPublicWebUrl(webcamUrl)) continue;

        webcams.push({
          id:         `osm-${key}`,
          title:      el.tags?.name ?? el.tags?.['name:en'] ?? 'OSM Webcam',
          lat:        el.lat,
          lon:        el.lon,
          country:    el.tags?.['addr:country'] ?? '',
          city:       el.tags?.['addr:city'] ?? el.tags?.['is_in:city'] ?? '',
          webcamUrl,
          positionPrecision: 'approximate',
          description: el.type === 'way' || el.type === 'relation' ? 'Location is the center of a mapped OSM feature, not a surveyed camera position.' : 'Community-mapped location; accuracy and live availability are not verified.',
          // If the URL looks like a direct image/stream, use it as preview too
          thumbnailUrl: looksLikeImage(webcamUrl) ? webcamUrl : '',
          operator:   el.tags?.operator ?? '',
        });
      }
    }

    return NextResponse.json(webcams, { status: 200, headers: {
      'X-Webcam-Discovery': 'Listed public URLs; live availability not verified',
      ...(settled.some(result => result.status === 'rejected') ? { 'X-Webcam-Failed-Regions': regions.filter((_region, index) => settled[index].status === 'rejected').map(region => region.name).join(',') } : {}),
    } });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Network error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** Returns true if the URL is likely a directly embeddable image/MJPEG snapshot. */
function looksLikeImage(url: string): boolean {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    return (
      p.endsWith('.jpg') ||
      p.endsWith('.jpeg') ||
      p.endsWith('.png') ||
      p.endsWith('.gif') ||
      p.includes('snapshot') ||
      p.includes('image') ||
      p.includes('cam.jpg') ||
      p.includes('webcam.jpg') ||
      u.searchParams.has('snapshot') ||
      u.searchParams.has('image')
    );
  } catch {
    return false;
  }
}

interface OverpassElement {
  type?: string;
  center?: { lat: number; lon: number };
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

interface NormWebcam {
  positionPrecision: 'approximate';
  description: string;
  id: string;
  title: string;
  lat: number;
  lon: number;
  country: string;
  city: string;
  webcamUrl: string;
  thumbnailUrl: string;
  operator: string;
}
