'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';

// ---- Types ----
interface TrafficCam {
  id: string;
  title?: string;
  lat: number;
  lon: number;
  country?: string;
  sourceCountry?: string;
  city?: string;
  imageUrl?: string;
  sourceUrl?: string;
  webcamUrl?: string;
  roadCondition?: string;
  airTemp?: number;
  county?: string;
  photoTime?: string;
  operator?: string;
}

// ---- Per-country config (ALL 16 countries + OSM fallback) ----
export const EU_COUNTRIES: Record<string, { label: string; flag: string; color: string; markerUrl: string }> = {
  FI: { label: 'Finland',     flag: '🇫🇮', color: '#06b6d4', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' },
  EE: { label: 'Estonia',     flag: '🇪🇪', color: '#f59e0b', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png' },
  GB: { label: 'UK (TfL)',    flag: '🇬🇧', color: '#dc2626', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  SE: { label: 'Sweden',      flag: '🇸🇪', color: '#3b82f6', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' },
  NO: { label: 'Norway',      flag: '🇳🇴', color: '#16a34a', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  PT: { label: 'Portugal',    flag: '🇵🇹', color: '#15803d', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  DE: { label: 'Germany',     flag: '🇩🇪', color: '#facc15', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png' },
  FR: { label: 'France',      flag: '🇫🇷', color: '#818cf8', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png' },
  ES: { label: 'Spain',       flag: '🇪🇸', color: '#f97316', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png' },
  NL: { label: 'Netherlands', flag: '🇳🇱', color: '#f97316', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png' },
  AT: { label: 'Austria',     flag: '🇦🇹', color: '#ef4444', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  CH: { label: 'Switzerland', flag: '🇨🇭', color: '#f43f5e', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  IT: { label: 'Italy',       flag: '🇮🇹', color: '#34d399', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  DK: { label: 'Denmark',     flag: '🇩🇰', color: '#f87171', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  BE: { label: 'Belgium',     flag: '🇧🇪', color: '#fbbf24', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png' },
  PL: { label: 'Poland',      flag: '🇵🇱', color: '#e879f9', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png' },
  EU: { label: 'OSM Roads',   flag: '🇪🇺', color: '#7c3aed', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png' },
};

const SHADOW = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

function makeIcon(url: string) {
  return new L.Icon({
    iconUrl: url,
    iconRetinaUrl: url.replace('.png', '-2x.png'),
    shadowUrl: SHADOW,
    iconSize: [20, 33], iconAnchor: [10, 33], popupAnchor: [1, -28], shadowSize: [33, 33],
  });
}

const ICONS = Object.fromEntries(
  Object.entries(EU_COUNTRIES).map(([k, v]) => [k, makeIcon(v.markerUrl)])
) as Record<string, L.Icon>;

const DEFAULT_ICON = makeIcon('https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png');

/** A traffic cam is populated when it has valid coords + at least one
 *  displayable element beyond its title (image URL, stream URL, or road data). */
function isPopulated(cam: TrafficCam): boolean {
  if (!cam.lat || !cam.lon || !isFinite(cam.lat) || !isFinite(cam.lon)) return false;
  // Must have at least a title or a URL — pure coordinate-only entries are useless on the map
  const hasContent =
    !!(cam.title?.trim()) ||
    !!(cam.imageUrl) ||
    !!(cam.sourceUrl) ||
    !!(cam.webcamUrl);
  if (!hasContent) return false;
  // Require at least one actionable piece: an image to preview OR a link to follow
  return !!(cam.imageUrl || cam.sourceUrl || cam.webcamUrl || cam.roadCondition);
}

interface Props {
  visible: Record<string, boolean>;
  /** Called once after the initial fetch resolves, with total camera count. */
  onLoad?: (count: number) => void;
}

export default function EUTrafficLayer({ visible, onLoad }: Props) {
  const [cams, setCams] = useState<TrafficCam[]>([]);
  const [loading, setLoading] = useState(false);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    setLoading(true);
    const countries = Object.keys(EU_COUNTRIES).join(',');
    fetch(`/api/eu-traffic?countries=${countries}`)
      .then(r => r.json())
      .then(data => {
        const arr: TrafficCam[] = (Array.isArray(data) ? data : []).filter(isPopulated);
        setCams(arr);
        onLoadRef.current?.(arr.length);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <>
      {cams.map(cam => {
        const key = cam.sourceCountry ?? cam.country ?? 'EU';
        const cfgKey = key in EU_COUNTRIES ? key : 'EU';
        if (visible[cfgKey] === false) return null;
        const icon = ICONS[cfgKey] ?? DEFAULT_ICON;
        const cfg  = EU_COUNTRIES[cfgKey];
        const imgSrc = cam.imageUrl ?? cam.sourceUrl ?? cam.webcamUrl ?? '';
        const linkUrl = cam.sourceUrl ?? cam.webcamUrl ?? '';

        return (
          <Marker key={cam.id} position={[cam.lat, cam.lon]} icon={icon}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui, sans-serif', color: '#e6edf3' }}>
                <strong style={{ fontSize: 13, color: '#f0f6fc' }}>{cam.title ?? 'Traffic cam'}</strong>
                {(cam.city || cam.county) && (
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                    {[cam.city, cam.county].filter(Boolean).join(' · ')}
                  </div>
                )}
                {cam.roadCondition && (
                  <div style={{ fontSize: 11, marginTop: 2, color: '#8b949e' }}>
                    🛣 {cam.roadCondition}{cam.airTemp != null ? ` · ${cam.airTemp}°C` : ''}
                  </div>
                )}
                {cam.operator && (
                  <div style={{ fontSize: 11, color: '#6e7681', marginTop: 2 }}>Op: {cam.operator}</div>
                )}
                {imgSrc && imgSrc.startsWith('http') && (
                  <div style={{ marginTop: 6 }}>
                    <img
                      src={imgSrc}
                      alt={cam.title ?? ''}
                      style={{ maxWidth: 250, borderRadius: 6, display: 'block' }}
                      loading="lazy"
                      onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
                    />
                  </div>
                )}
                {linkUrl && (
                  <div style={{ marginTop: 5 }}>
                    <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open stream ↗</a>
                  </div>
                )}
                <div style={{ marginTop: 5, fontSize: 10, fontWeight: 700, color: cfg.color }}>
                  {cfg.flag} {cfg.label.toUpperCase()}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
