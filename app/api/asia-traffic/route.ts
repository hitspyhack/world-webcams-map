import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Aggregator — calls all Asia traffic sub-routes and merges results
// ?countries=SG,JP,KR,TW,TH  (default: all)

const SUB_ROUTES: Record<string, string> = {
  SG: '/api/asia-traffic/singapore',
  JP: '/api/asia-traffic/japan',
  KR: '/api/asia-traffic/south-korea',
  TW: '/api/asia-traffic/taiwan',
  TH: '/api/asia-traffic/thailand',
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
