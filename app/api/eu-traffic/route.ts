import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Aggregator — calls all EU sub-routes and merges results
// ?countries=FI,EE,GB,NO,SE,PT,EU  (default: all)

const SUB_ROUTES: Record<string, string> = {
  FI: '/api/eu-traffic/finland',
  EE: '/api/eu-traffic/estonia',
  GB: '/api/eu-traffic/uk',
  SE: '/api/eu-traffic/sweden',
  NO: '/api/eu-traffic/norway',
  PT: '/api/eu-traffic/portugal',
  EU: '/api/eu-traffic/overpass-roads',
};

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const wantedRaw = searchParams.get('countries');
  const wanted = wantedRaw ? wantedRaw.toUpperCase().split(',') : Object.keys(SUB_ROUTES);

  const fetches = wanted
    .filter(k => SUB_ROUTES[k])
    .map(async (k) => {
      try {
        const r = await fetch(`${origin}${SUB_ROUTES[k]}`);
        const j = await r.json();
        const items = Array.isArray(j) ? j : [];
        return items.map((c: Record<string, unknown>) => ({ ...c, sourceCountry: k }));
      } catch {
        return [];
      }
    });

  const all = (await Promise.all(fetches)).flat();
  return NextResponse.json(all, { status: 200 });
}
