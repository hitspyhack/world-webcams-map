// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { GET as windy } from '../app/api/windy-webcams/route';
import { POST as community } from '../app/api/skyline-webcams/route';
import { aggregateCameras } from '../lib/aggregateCameras';

const request = (query = '') => new Request(`https://webcams.example/api/windy-webcams${query}`);

describe('Windy input validation', () => {
  it.each(['?bbox=90,200,-90,-180', '?bbox=0,1,5,0', '?limit=NaN', '?limit=-1', '?limit=1.5'])('rejects malformed input: %s', async query => {
    expect((await windy(request(query))).status).toBe(400);
  });
  it('treats an absent API key as configuration, not a network failure', async () => {
    vi.stubEnv('WINDY_WEBCAMS_API_KEY', '');
    expect(await (await windy(request())).json()).toMatchObject({ missingKey: true, webcams: [] });
  });
  it('caps requests at the free-tier limit and keeps upstream error bodies private', async () => {
    vi.stubEnv('WINDY_WEBCAMS_API_KEY', 'test-only-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response('private upstream details', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await windy(request('?limit=100'));
    expect(fetchMock.mock.calls[0][0]).toContain('limit=50');
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Windy API error', status: 403 });
  });
});

describe('public community cameras', () => {
  it('only returns public webcam links, not generic surveillance locations', async () => {
    const elements = [
      { id: 1, lat: 0, lon: 0, tags: { name: 'Equator webcam', 'contact:webcam': 'https://example.com/cam.jpg' } },
      { id: 2, lat: 10, lon: 10, tags: { name: 'Private surveillance' } },
      { id: 3, lat: 10, lon: 10, tags: { name: 'Unsafe URL', webcam: 'javascript:alert(1)' } },
      { id: 4, lat: 10, lon: 10, tags: { name: 'Public website', webcam: 'https://example.com/live' } },
    ];
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ elements }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await community();
    const data = await response.json();
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ title: 'Equator webcam', lat: 0, snapshotUrl: 'https://example.com/cam.jpg' });
    expect(data[1]).toMatchObject({ title: 'Public website', snapshotUrl: '' });
    expect(decodeURIComponent(fetchMock.mock.calls[0][1].body)).not.toContain('man_made');
  });
  it('reports upstream failure instead of an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('', { status: 503 })));
    expect((await community()).status).toBe(502);
  });
});

describe('traffic aggregation', () => {
  it('deduplicates country codes and calls handlers without public self-fetches', async () => {
    const PT = vi.fn().mockImplementation(async () => Response.json([{ id: 'one' }]));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await aggregateCameras(request('?countries=pt,PT,unknown'), { PT });
    expect(PT).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await response.json()).toEqual([{ id: 'one', sourceCountry: 'PT' }]);
  });
  it('retains partial results and identifies countries that failed', async () => {
    const response = await aggregateCameras(request(), {
      PT: async () => Response.json([{ id: 'one' }]),
      FR: async () => new Response('', { status: 502 }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Webcam-Failed-Countries')).toBe('FR');
    expect(await response.json()).toHaveLength(1);
  });
  it('returns a real error when every provider fails or no country is supported', async () => {
    const providers = { PT: async () => { throw new Error('Offline'); } };
    expect((await aggregateCameras(request(), providers)).status).toBe(502);
    expect((await aggregateCameras(request('?countries=XX'), providers)).status).toBe(400);
  });
});
