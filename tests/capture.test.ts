// @vitest-environment node
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { buildCapture } from '../lib/capture';
const target = { title: 'Harbour', source: 'public', lat: 0, lon: 0, imageUrl: 'https://example.com/cam.png', linkUrl: 'https://example.com/source' };
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
describe('direct browser capture packages', () => {
  it('archives original bytes and a matching SHA-256 provenance manifest', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(png, { headers: { 'Content-Type': 'image/png' } })));
    const capture = await buildCapture(target);
    const archive = unzipSync(capture.archive);
    const manifest = JSON.parse(strFromU8(archive['manifest.json']));
    expect(manifest.file.sha256).toBe(createHash('sha256').update(png).digest('hex'));
    expect(archive[manifest.file.name]).toEqual(png);
    expect(manifest).toMatchObject({ sourceUrl: target.linkUrl, providerCaptureAt: null, coordinates: { latitude: 0, longitude: 0 } });
    expect(capture.filename).toMatch(/\.zip$/);
  });
  it.each(['text/html', 'image/svg+xml'])('rejects non-raster payloads: %s', async mime => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('<script>bad</script>', { headers: { 'Content-Type': mime } })));
    await expect(buildCapture(target)).rejects.toThrow('JPEG, PNG, and WebP');
  });
  it('rejects disguised HTML and oversized responses', async () => {
    const mock = vi.fn().mockImplementationOnce(async () => new Response('<html>error</html>', { headers: { 'Content-Type': 'image/png' } }))
      .mockImplementationOnce(async () => new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Length': String(21 * 1024 * 1024) } }));
    vi.stubGlobal('fetch', mock);
    await expect(buildCapture(target)).rejects.toThrow('not a supported image');
    await expect(buildCapture(target)).rejects.toThrow('20 MB');
  });
  it('never falls back to a proxy when the provider denies browser access', async () => {
    const mock = vi.fn().mockRejectedValue(new Error('CORS blocked')); vi.stubGlobal('fetch', mock);
    await expect(buildCapture(target)).rejects.toThrow('CORS blocked');
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toBe(target.imageUrl);
  });
});
