// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { GET as google } from '../app/api/google-view/route';
import { GET as globalCatalog } from '../app/api/global-webcams/route';
import { GET as osm } from '../app/api/overpass-webcams/route';
import { GLOBAL_WEBCAMS } from '../lib/globalWebcams';
import { hasCoordinates, isPublicWebUrl } from '../lib/cameras';
const request = (query: string) => new Request(`https://example.com/api/test?${query}`);

describe('worldwide catalog', () => {
  it('covers all continents with explicit directory and coordinate provenance', async () => {
    expect(new Set(GLOBAL_WEBCAMS.map(camera => camera.continent)).size).toBe(7);
    expect(GLOBAL_WEBCAMS.length).toBeGreaterThanOrEqual(30);
    expect(GLOBAL_WEBCAMS.every(camera => hasCoordinates(camera) && isPublicWebUrl(camera.linkUrl))).toBe(true);
    expect(GLOBAL_WEBCAMS.filter(camera => camera.mediaKind === 'directory').every(camera => camera.positionPrecision === 'regional' && !camera.imageUrl && !camera.embedUrl)).toBe(true);
    expect((await (await globalCatalog()).json()).length).toBe(GLOBAL_WEBCAMS.length);
  });
});
describe('Google context configuration', () => {
  it.each(['lat=&lon=1', 'lat=91&lon=0', 'lat=1&lon=2&mode=unsafe', 'lat=1'])('validates coordinates: %s', async query => {
    expect((await google(request(query))).status).toBe(400);
  });
  it('provides a truthful fallback when no browser-restricted key is configured', async () => {
    vi.stubEnv('GOOGLE_MAPS_EMBED_BROWSER_KEY', '');
    expect(await (await google(request('lat=0&lon=0'))).json()).toEqual({ configured: false });
  });
  it('builds official satellite and Street View embed URLs', async () => {
    vi.stubEnv('GOOGLE_MAPS_EMBED_BROWSER_KEY', 'restricted-browser-key');
    const satellite = await (await google(request('lat=38&lon=-9'))).json();
    expect(satellite.url).toContain('/view?');
    expect(new URL(satellite.url).searchParams.get('maptype')).toBe('satellite');
    const street = await (await google(request('lat=38&lon=-9&mode=streetview'))).json();
    expect(street.url).toContain('/streetview?');
  });
});
describe('geographic public-camera discovery', () => {
  it('queries a requested area and accepts OSM way centroids without inventing a camera position', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ elements: [
      { type: 'way', id: 1, center: { lat: 38, lon: -9 }, tags: { name: 'Public webcam', webcam: 'https://example.com/cam.jpg' } },
      { type: 'node', id: 1, lat: 38, lon: -9, tags: { name: 'Other camera', webcam: 'https://example.com/live' } },
    ] }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await osm(request('bbox=40,0,30,-10&limit=500'));
    const cameras = await response.json();
    expect(cameras).toHaveLength(2);
    expect(cameras[0]).toMatchObject({ positionPrecision: 'approximate', description: expect.stringContaining('center of a mapped OSM feature') });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = decodeURIComponent(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('[bbox:30,-10,40,0]');
    expect(body).toContain('nwr["webcam"]');
  });
  it('rejects malformed discovery bounds before contacting any provider', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    expect((await osm(request('bbox=invalid'))).status).toBe(400);
    expect((await osm(request('limit=501'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


describe('public URL hygiene', () => {
  it.each(['http://localhost/cam.jpg', 'http://camera.local/cam.jpg', 'http://camera.internal/live', 'http://127.1/cam', 'http://2130706433/cam', 'http://10.0.0.2/live', 'http://172.16.1.1/cam', 'http://192.168.1.1/cam', 'http://169.254.169.254/', 'http://100.64.0.1/live', 'http://[::1]/cam', 'https://user:secret@example.com/cam', 'javascript:alert(1)'])('rejects private, credentialed, or executable URLs: %s', url => {
    expect(isPublicWebUrl(url)).toBe(false);
  });
  it('accepts public operator pages and public IPv4 endpoints', () => {
    expect(isPublicWebUrl('https://example.com/webcams')).toBe(true);
    expect(isPublicWebUrl('https://8.8.8.8/image.jpg')).toBe(true);
  });
});
