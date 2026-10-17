import { describe, expect, it } from 'vitest';
import { cameraKey, hasCoordinates, readSavedCameras } from '../lib/cameras';
import { isOnVisibleHemisphere } from '../lib/globe';
import { validBbox, viewportBbox } from '../lib/viewport';
import { createCameraIcon } from '../lib/mapIcons';

const camera = { title: 'Lisbon', lat: 38.7, lon: -9.1, source: 'earthcam', color: '#ff8833' };

describe('geographic validation', () => {
  it('keeps cameras at zero latitude/longitude', () => {
    expect(hasCoordinates({ lat: 0, lon: 0 })).toBe(true);
  });
  it.each([{ lat: NaN, lon: 1 }, { lat: 91, lon: 0 }, { lat: 0, lon: 181 }, { lat: '1', lon: 0 }, null])('rejects invalid coordinates: %j', value => {
    expect(hasCoordinates(value)).toBe(false);
  });
  it('does not project the hidden hemisphere as visible cameras', () => {
    expect(isOnVisibleHemisphere(0, 0, [0, 0, 0])).toBe(true);
    expect(isOnVisibleHemisphere(180, 0, [0, 0, 0])).toBe(false);
    expect(isOnVisibleHemisphere(120, 40, [-120, -40, 0])).toBe(true);
    expect(isOnVisibleHemisphere(-60, -40, [-120, -40, 0])).toBe(false);
  });
  it('normalizes unwrapped map bounds and covers dateline crossings', () => {
    expect(viewportBbox(95, 200, -95, -200)).toBe('90,180,-90,-180');
    expect(viewportBbox(50, 380, 30, 360)).toBe('50,20,30,0');
    expect(viewportBbox(50, 190, 30, 170)).toBe('50,180,30,-180');
    expect(validBbox(viewportBbox(50, 190, 30, 170))).toBe(true);
  });
  it.each(['1,2,3,4', '90,181,-90,-180', '90,180,-91,-180', 'NaN,1,0,0', ',1,0,0', '1,2,0', ''])('rejects invalid bounding boxes: %s', value => {
    expect(validBbox(value)).toBe(false);
  });
});

describe('saved camera persistence', () => {
  it('deduplicates records and safely handles corrupt storage', () => {
    expect(readSavedCameras('{bad json')).toEqual([]);
    expect(readSavedCameras('{}')).toEqual([]);
    expect(readSavedCameras(JSON.stringify([camera, camera, { ...camera, lat: Infinity }]))).toEqual([camera]);
    expect(cameraKey(camera)).not.toBe(cameraKey({ ...camera, source: 'osm' }));
  });
  it('removes executable URLs and invalid color values', () => {
    const [saved] = readSavedCameras(JSON.stringify([{ ...camera, embedUrl: 'javascript:alert(1)', imageUrl: 'data:text/html,bad', linkUrl: 'https://example.com', color: 'url(bad)' }]));
    expect(saved.embedUrl).toBeUndefined();
    expect(saved.imageUrl).toBeUndefined();
    expect(saved.linkUrl).toBe('https://example.com');
    expect(saved.color).toBe('#79c0ff');
  });
});


describe('local map pins', () => {
  it('renders source-colored SVG icons without requesting a remote CDN', () => {
    const icon = createCameraIcon('#ff8833');
    expect(icon.options.iconUrl).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(icon.options.iconUrl)).toContain('fill="#ff8833"');
    expect(icon.options.shadowUrl).toBeUndefined();
    expect(createCameraIcon('#ff8833', true).options.iconSize).toEqual([22, 30]);
  });
});
