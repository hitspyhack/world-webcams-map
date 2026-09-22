import { NextResponse } from 'next/server';

// Two public mirrors — tried in order, first success wins.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// 6 regional bounding boxes covering the inhabited world.
// Running them in parallel keeps each query small and fast.
const REGIONS: Array<{ name: string; bbox: string }> = [
  { name: 'Europe',       bbox: '35,-10,70,40'    },
  { name: 'N. America',   bbox: '15,-170,75,-50'  },
  { name: 'S. America',   bbox: '-60,-85,15,-30'  },
  { name: 'Asia-E',       bbox: '-10,60,60,145'   },
  { name: 'Africa+ME',    bbox: '-40,-20,40,60'   },
  { name: 'Oceania',      bbox: '-50,110,0,180'   },
];

function buildQuery(bbox: string): string {
  return (
    `[out:json][timeout:25][bbox:${bbox}];` +
    `(node["contact:webcam"];node["webcam"];);` +
    `out body 150;`
  );
}

async function fetchRegion(query: string): Promise<OverpassElement[]> {
  const body = `data=${encodeURIComponent(query)}`;
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        // Next.js fetch cache — revalidate every hour (OSM data changes slowly)
        next: { revalidate: 3600 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      return Array.isArray(data?.elements) ? data.elements : [];
    } catch {
      // try next mirror
    }
  }
  return [];
}

export async function GET() {
  try {
    // Fan out all regions in parallel
    const settled = await Promise.allSettled(
      REGIONS.map(r => fetchRegion(buildQuery(r.bbox)))
    );

    // Merge and deduplicate by OSM node id
    const seen = new Set<number>();
    const webcams: NormWebcam[] = [];

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const el of result.value) {
        if (!el.lat || !el.lon) continue;
        if (seen.has(el.id)) continue;
        seen.add(el.id);

        const webcamUrl =
          el.tags?.['contact:webcam'] ??
          el.tags?.['webcam'] ??
          '';
        if (!webcamUrl) continue;

        webcams.push({
          id:         `osm-${el.id}`,
          title:      el.tags?.name ?? el.tags?.['name:en'] ?? 'OSM Webcam',
          lat:        el.lat,
          lon:        el.lon,
          country:    el.tags?.['addr:country'] ?? '',
          city:       el.tags?.['addr:city'] ?? el.tags?.['is_in:city'] ?? '',
          webcamUrl,
          // If the URL looks like a direct image/stream, use it as preview too
          thumbnailUrl: looksLikeImage(webcamUrl) ? webcamUrl : '',
          operator:   el.tags?.operator ?? '',
        });
      }
    }

    return NextResponse.json(webcams, { status: 200 });
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
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

interface NormWebcam {
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
