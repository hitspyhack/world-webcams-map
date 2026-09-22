'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';

interface AsiaCam {
  id: string;
  title: string;
  lat: number;
  lon: number;
  country?: string;
  city?: string;
  imageUrl?: string;
  sourceUrl?: string;
  sourceCountry?: string;
}

export const ASIA_SOURCES: Record<string, { label: string; flag: string; color: string; markerUrl: string }> = {
  SG: { label: 'Singapore',   flag: '🇸🇬', color: '#ef4444', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  JP: { label: 'Japan',       flag: '🇯🇵', color: '#2563eb', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' },
  KR: { label: 'Korea',       flag: '🇰🇷', color: '#16a34a', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  HK: { label: 'Hong Kong',   flag: '🇭🇰', color: '#f97316', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png' },
  TH: { label: 'Thailand',    flag: '🇹🇭', color: '#e11d48', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  AE: { label: 'UAE',         flag: '🇦🇪', color: '#0ea5e9', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' },
  TW: { label: 'Taiwan',      flag: '🇹🇼', color: '#7c3aed', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png' },
  MY: { label: 'Malaysia',    flag: '🇲🇾', color: '#ca8a04', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png' },
  ID: { label: 'Indonesia',   flag: '🇮🇩', color: '#dc2626', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  VN: { label: 'Vietnam',     flag: '🇻🇳', color: '#15803d', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  PH: { label: 'Philippines', flag: '🇵🇭', color: '#1d4ed8', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' },
  IN: { label: 'India',       flag: '🇮🇳', color: '#ea580c', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png' },
  CN: { label: 'China',       flag: '🇨🇳', color: '#be123c', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
};

const SHADOW = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
function makeIcon(url: string) {
  return new L.Icon({ iconUrl: url, iconRetinaUrl: url.replace('.png', '-2x.png'), shadowUrl: SHADOW, iconSize: [20, 33], iconAnchor: [10, 33], popupAnchor: [1, -28], shadowSize: [33, 33] });
}
const ICONS = Object.fromEntries(Object.entries(ASIA_SOURCES).map(([k, v]) => [k, makeIcon(v.markerUrl)])) as Record<string, L.Icon>;
const DEFAULT_ICON = makeIcon('https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png');

/** Keep only cams that have valid coords + a non-empty title
 *  + at least one media/link URL to show in the popup. */
function isPopulated(cam: AsiaCam): boolean {
  if (!cam.lat || !cam.lon || !isFinite(cam.lat) || !isFinite(cam.lon)) return false;
  if (!cam.title?.trim()) return false;
  return !!(cam.imageUrl || cam.sourceUrl);
}

interface Props {
  visible: Record<string, boolean>;
  /**
   * When provided, the layer renders these cams directly instead of fetching
   * independently. MapClient passes its already-fetched array here so the
   * globe and flat map share the same data without double network requests.
   */
  cams?: AsiaCam[];
  onLoad?: (count: number) => void;
}

export default function AsiaWebcamsLayer({ visible, cams: camsProp, onLoad }: Props) {
  const [fetchedCams, setFetchedCams] = useState<AsiaCam[]>([]);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  // Only fetch independently when no cams prop is provided
  useEffect(() => {
    if (camsProp !== undefined) return;
    Promise.all([
      fetch('/api/asia-traffic/singapore').then(r => r.json()).catch(() => []),
      fetch('/api/asia-tourism').then(r => r.json()).catch(() => []),
    ]).then(([sg, tourism]) => {
      const sgArr   = Array.isArray(sg)      ? sg      : (sg?.cameras ?? []);
      const tourArr = Array.isArray(tourism) ? tourism : [];
      const all = ([...sgArr, ...tourArr] as AsiaCam[]).filter(isPopulated);
      setFetchedCams(all);
      onLoadRef.current?.(all.length);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When cams are passed from parent, notify count once
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (camsProp === undefined) return;
    if (!notifiedRef.current && camsProp.length > 0) {
      notifiedRef.current = true;
      onLoadRef.current?.(camsProp.length);
    }
  }, [camsProp]);

  const cams = camsProp !== undefined ? camsProp : fetchedCams;

  return (
    <>
      {cams.map(cam => {
        const key  = cam.sourceCountry ?? cam.country ?? 'SG';
        if (!visible[key]) return null;
        const cfg  = ASIA_SOURCES[key];
        const icon = ICONS[key] ?? DEFAULT_ICON;
        return (
          <Marker key={cam.id} position={[cam.lat, cam.lon]} icon={icon}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui, sans-serif' }}>
                <strong style={{ fontSize: 13 }}>{cam.title}</strong>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                  {[cam.city, cam.country].filter(Boolean).join(' · ')}
                </div>
                {cam.imageUrl && (
                  <div style={{ marginTop: 6 }}>
                    <img
                      src={cam.imageUrl}
                      alt={cam.title}
                      style={{ maxWidth: 250, borderRadius: 5, display: 'block' }}
                      loading="lazy"
                      onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
                    />
                  </div>
                )}
                {cam.sourceUrl && (
                  <div style={{ marginTop: 5 }}>
                    <a href={cam.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open source ↗</a>
                  </div>
                )}
                {cfg && (
                  <div style={{ marginTop: 5, fontSize: 10, fontWeight: 700, color: cfg.color }}>
                    {cfg.flag} {cfg.label.toUpperCase()}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
