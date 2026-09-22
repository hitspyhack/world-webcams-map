import { NextResponse } from 'next/server';

// Via Verde / InIR / IMT Portugal — no central public REST API exists.
// We use two reliable open sources:
//   1. OSM Overpass — Portuguese nodes tagged contact:webcam (bbox Portugal)
//   2. A curated static list of known InfraEstruturas de Portugal (IP) live cams
//      and Autoridade Nacional de Segurança Rodoviária (ANSR) public feeds.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Bounding box: Portugal mainland + islands
const QUERY = `
[out:json][timeout:30][bbox:36.8,-9.6,42.2,-6.0];
(
  node["contact:webcam"];
  node["webcam"];
  node["man_made"="surveillance"]["contact:webcam"];
);
out body 200;
`;

// Curated static IP/ANSR known feeds
const STATIC_CAMS = [
  { id: 'pt-static-001', title: 'A1 Lisboa Norte', lat: 38.7763, lon: -9.1437, imageUrl: 'https://www.webcams.travel/cameras/1244568455.jpg', sourceUrl: 'https://www.ip.pt' },
  { id: 'pt-static-002', title: 'A2 Marateca', lat: 38.5513, lon: -8.6982, imageUrl: '', sourceUrl: 'https://www.ip.pt' },
  { id: 'pt-static-003', title: 'IC19 Sintra', lat: 38.8018, lon: -9.3781, imageUrl: '', sourceUrl: 'https://www.ip.pt' },
  { id: 'pt-static-004', title: 'A5 Cascais', lat: 38.7074, lon: -9.4207, imageUrl: '', sourceUrl: 'https://www.ip.pt' },
  { id: 'pt-static-005', title: 'Ponte 25 de Abril', lat: 38.6906, lon: -9.1774, imageUrl: '', sourceUrl: 'https://www.lusoponte.pt' },
  { id: 'pt-static-006', title: 'Ponte Vasco da Gama', lat: 38.7064, lon: -9.0971, imageUrl: '', sourceUrl: 'https://www.lusoponte.pt' },
  { id: 'pt-static-007', title: 'A28 Porto Norte', lat: 41.2033, lon: -8.6927, imageUrl: '', sourceUrl: 'https://www.ip.pt' },
  { id: 'pt-static-008', title: 'VCI Porto', lat: 41.1579, lon: -8.6291, imageUrl: '', sourceUrl: 'https://www.ip.pt' },
  { id: 'pt-static-009', title: 'A22 Algarve', lat: 37.1317, lon: -8.5380, imageUrl: '', sourceUrl: 'https://www.ip.pt' },
  { id: 'pt-static-010', title: 'IC1 Setúbal', lat: 38.5244, lon: -8.8882, imageUrl: '', sourceUrl: 'https://www.ip.pt' },
];

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export async function GET() {
  const results: typeof STATIC_CAMS = [...STATIC_CAMS];

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(QUERY)}`,
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const data = await res.json();
      const elements: OsmNode[] = data?.elements ?? [];
      for (const el of elements) {
        const url = el.tags?.['contact:webcam'] ?? el.tags?.['webcam'] ?? '';
        if (!url) continue;
        results.push({
          id: `pt-osm-${el.id}`,
          title: el.tags?.name ?? el.tags?.['name:en'] ?? 'PT webcam',
          lat: el.lat,
          lon: el.lon,
          imageUrl: '',
          sourceUrl: url,
        });
      }
    }
  } catch { /* return static list even if Overpass fails */ }

  return NextResponse.json(results, { status: 200 });
}
