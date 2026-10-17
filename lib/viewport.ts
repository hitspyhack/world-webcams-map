/** Leaflet can report unwrapped longitudes after panning or zooming out. */
export function viewportBbox(north: number, east: number, south: number, west: number): string {
  const wrap = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
  const fullWorld = east - west >= 360;
  const wrappedWest = wrap(west);
  const wrappedEast = wrap(east);
  // The upstream bbox cannot cross the dateline. Use all longitudes rather
  // than silently excluding the part on the other side of it.
  const crossesDateline = wrappedEast < wrappedWest;
  return [
    Math.min(90, Math.max(-90, north)),
    fullWorld || crossesDateline ? 180 : wrappedEast,
    Math.min(90, Math.max(-90, south)),
    fullWorld || crossesDateline ? -180 : wrappedWest,
  ].join(',');
}

export function validBbox(value: string): boolean {
  const parts = value.split(',');
  if (parts.length !== 4 || parts.some(part => !part.trim())) return false;
  const [north, east, south, west] = parts.map(Number);
  return [north, east, south, west].every(Number.isFinite)
    && north <= 90 && south >= -90 && north >= south
    && east <= 180 && west >= -180 && east >= west;
}
