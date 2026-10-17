import { geoDistance } from 'd3-geo';

/** Orthographic projection also returns coordinates for the hidden hemisphere. */
export function isOnVisibleHemisphere(lon: number, lat: number, rotation: [number, number, number]): boolean {
  return geoDistance([lon, lat], [-rotation[0], -rotation[1]]) <= Math.PI / 2;
}
