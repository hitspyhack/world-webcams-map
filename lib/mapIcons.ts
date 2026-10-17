import L from 'leaflet';

/** Self-contained, source-colored pins: no remote icon CDN or retina assets. */
export function createCameraIcon(color: string, compact = false): L.Icon {
  const fill = /^#[a-f\d]{6}$/i.test(color) ? color : '#79c0ff';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38"><path d="M14 37C11 32 1 22 1 14a13 13 0 0 1 26 0c0 8-10 18-13 23Z" fill="${fill}" stroke="#071018" stroke-width="2"/><rect x="6" y="9" width="16" height="11" rx="3" fill="#071018"/><circle cx="14" cy="14.5" r="3.4" fill="none" stroke="white" stroke-width="1.5"/></svg>`;
  const width = compact ? 22 : 28;
  const height = compact ? 30 : 38;
  return L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [width, height], iconAnchor: [width / 2, height], popupAnchor: [0, -height + 4],
  });
}
