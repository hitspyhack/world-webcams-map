'use client';

import { useEffect, useState } from 'react';
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

// ---- Per-country config ----
export const EU_COUNTRIES: Record<string, { label: string; flag: string; color: string; markerUrl: string }> = {
  FI: { label: 'Finland',     flag: '🇫🇮', color: '#06b6d4', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' },
  EE: { label: 'Estonia',     flag: '🇪🇪', color: '#f59e0b', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png' },
  GB: { label: 'UK (TfL)',    flag: '🇬🇧', color: '#dc2626', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  SE: { label: 'Sweden',      flag: '🇸🇪', color: '#2563eb', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' },
  NO: { label: 'Norway',      flag: '🇳🇴', color: '#16a34a', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  PT: { label: 'Portugal',    flag: '🇵🇹', color: '#15803d', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  EU: { label: 'OSM Roads',   flag: '🇪🇺', color: '#7c3aed', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png' },
};

const SHADOW = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

function makeIcon(url: string) {
  return new L.Icon({ iconUrl: url, iconRetinaUrl: url.replace('.png', '-2x.png'), shadowUrl: SHADOW, iconSize: [20, 33], iconAnchor: [10, 33], popupAnchor: [1, -28], shadowSize: [33, 33] });
}

const ICONS = Object.fromEntries(
  Object.entries(EU_COUNTRIES).map(([k, v]) => [k, makeIcon(v.markerUrl)])
) as Record<string, L.Icon>;

const DEFAULT_ICON = makeIcon('https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png');

interface Props {
  visible: Record<string, boolean>;
}

export default function EUTrafficLayer({ visible }: Props) {
  const [cams, setCams] = useState<TrafficCam[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const countries = Object.keys(EU_COUNTRIES).join(',');
    fetch(`/api/eu-traffic?countries=${countries}`)
      .then(r => r.json())
      .then(data => setCams(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <>
      {cams.map(cam => {
        const key = cam.sourceCountry ?? cam.country ?? 'EU';
        if (!visible[key]) return null;
        if (!cam.lat || !cam.lon) return null;
        const icon = ICONS[key] ?? DEFAULT_ICON;
        const cfg  = EU_COUNTRIES[key] ?? { label: key, flag: '🌐', color: '#888' };
        const imgSrc = cam.imageUrl ?? cam.sourceUrl ?? cam.webcamUrl ?? '';
        const linkUrl = cam.sourceUrl ?? cam.webcamUrl ?? '';

        return (
          <Marker key={cam.id} position={[cam.lat, cam.lon]} icon={icon}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui, sans-serif' }}>
                <strong style={{ fontSize: 13 }}>{cam.title ?? 'Traffic cam'}</strong>
                {(cam.city || cam.county) && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{[cam.city, cam.county].filter(Boolean).join(' · ')}</div>}
                {cam.roadCondition && <div style={{ fontSize: 11, marginTop: 2 }}>🛣 {cam.roadCondition}{cam.airTemp != null ? ` · ${cam.airTemp}°C` : ''}</div>}
                {cam.operator && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Op: {cam.operator}</div>}
                {imgSrc && !imgSrc.startsWith('http') === false && (
                  <div style={{ marginTop: 6 }}>
                    <img src={imgSrc} alt={cam.title ?? ''} style={{ maxWidth: 250, borderRadius: 5, display: 'block' }} loading="lazy"
                      onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                  </div>
                )}
                {linkUrl && (
                  <div style={{ marginTop: 5 }}>
                    <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open stream ↗</a>
                  </div>
                )}
                <div style={{ marginTop: 5, fontSize: 10, fontWeight: 700, color: cfg.color }}>{cfg.flag} {cfg.label.toUpperCase()}</div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
