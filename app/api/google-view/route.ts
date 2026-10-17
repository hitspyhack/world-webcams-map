import { NextResponse } from 'next/server';
import { hasCoordinates } from '../../../lib/cameras';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = params.get('lat'); const lon = params.get('lon');
  const mode = params.get('mode') ?? 'satellite';
  if (lat === null || lon === null || !lat.trim() || !lon.trim() || !hasCoordinates({ lat: Number(lat), lon: Number(lon) }) || !['satellite', 'streetview'].includes(mode)) {
    return NextResponse.json({ error: 'Valid latitude, longitude, and map mode are required.' }, { status: 400 });
  }
  // Intentionally a public browser key. Restrict referrers and Maps Embed API
  // in Google Cloud; never use an unrestricted server/service-account secret.
  const key = process.env.GOOGLE_MAPS_EMBED_BROWSER_KEY?.trim();
  if (!key) return NextResponse.json({ configured: false });
  const query = new URLSearchParams({ key });
  if (mode === 'satellite') { query.set('center', `${Number(lat)},${Number(lon)}`); query.set('zoom', '16'); query.set('maptype', 'satellite'); }
  else query.set('location', `${Number(lat)},${Number(lon)}`);
  return NextResponse.json({ configured: true, url: `https://www.google.com/maps/embed/v1/${mode === 'satellite' ? 'view' : 'streetview'}?${query}` });
}
