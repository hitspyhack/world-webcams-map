// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { GET } from '../app/api/windy-webcams/route';
import { mergeWindyCameras, normalizeWindyCamera } from '../lib/windy';

const sample = { webcamId: 42, title: 'Harbour', location: { latitude: 0, longitude: 0 }, images: { current: { preview: 'https://example.com/image.jpg' } }, player: { day: 'https://example.com/timelapse', live: 'https://example.com/live' } };
const request = (query: string) => new Request(`https://example.com/api/windy-webcams?${query}`);

describe('Windy v3 normalization', () => {
  it('distinguishes live players, timelapses and snapshots', () => {
    expect(normalizeWindyCamera(sample)).toMatchObject({ webcamId: '42', mediaKind: 'live', urls: { player: 'https://example.com/live' } });
    expect(normalizeWindyCamera({ ...sample, player: { day: { embed: 'https://example.com/day' } } })).toMatchObject({ mediaKind: 'timelapse' });
    expect(normalizeWindyCamera({ ...sample, player: {} })).toMatchObject({ mediaKind: 'snapshot' });
  });
  it('rejects invalid positions and unsafe media URLs', () => {
    expect(normalizeWindyCamera({ ...sample, location: { latitude: 100, longitude: 0 } })).toBeNull();
    expect(normalizeWindyCamera({ ...sample, player: { live: 'javascript:alert(1)' } })?.mediaKind).toBe('snapshot');
  });
  it('deduplicates paged results and replaces older records', () => {
    const first = normalizeWindyCamera(sample)!;
    const next = { ...first, title: 'Updated' };
    expect(mergeWindyCameras([first], [next])).toEqual([next]);
  });
});

describe('Windy paged proxy', () => {
  it.each(['offset=-1', 'offset=9951', 'offset=1.5', 'countries=not-a-country', 'categories=x&bbox=invalid'])('rejects unsafe queries: %s', async query => {
    expect((await GET(request(query))).status).toBe(400);
  });
  it('translates the bounding box and caches normalized pages without exposing credentials', async () => {
    vi.stubEnv('WINDY_WEBCAMS_API_KEY', 'unit-test-v3-paging');
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ webcams: [sample], total: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const query = 'bbox=50,20,30,-10&limit=1&offset=50&countries=PT&categories=traffic';
    const response = await GET(request(query));
    const upstream = new URL(fetchMock.mock.calls[0][0]);
    expect(upstream.searchParams.get('cameraBoundingBox')).toBe('30,-10,50,20');
    expect(upstream.searchParams.has('bbox')).toBe(false);
    expect(upstream.searchParams.get('offset')).toBe('50');
    expect(upstream.searchParams.get('countries')).toBe('PT');
    const data = await response.json();
    expect(data).toMatchObject({ offset: 50, nextOffset: 51, total: 200 });
    expect(JSON.stringify(data)).not.toContain('unit-test-v3-paging');
    const cached = await GET(request(query));
    expect(cached.headers.get('X-Webcam-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('preserves upstream rate limits and does not cache failures', async () => {
    vi.stubEnv('WINDY_WEBCAMS_API_KEY', 'unit-test-quota');
    const fetchMock = vi.fn().mockImplementation(async () => new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await GET(request('offset=0'))).status).toBe(429);
    expect((await GET(request('offset=0'))).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
