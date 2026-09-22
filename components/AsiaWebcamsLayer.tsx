'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import type { CamLightboxEntry } from './CamLightbox';

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

export const ASIA_SOURCES: Record<string, string> = {
  SG: 'Singapore',
  JP: 'Japan',
  KR: 'Korea',
  HK: 'Hong Kong',
  TH: 'Thailand',
  AE: 'UAE',
  TW: 'Taiwan',
  MY: 'Malaysia',
  ID: 'Indonesia',
  VN: 'Vietnam',
  PH: 'Philippines',
  IN: 'India',
  CN: 'China',
};

const ASIA_CONFIG: Record<string, { label: string; flag: string; color: string; markerUrl: string }> = {
  SG: { label: 'Singapore',   flag: '\ud83c\uddf8\ud83c\uddec', color: '#ef4444', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  JP: { label: 'Japan',       flag: '\ud83c\uddef\ud83c\uddf5', color: '#2563eb', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' },
  KR: { label: 'Korea',       flag: '\ud83c\uddf0\ud83c\uddf7', color: '#16a34a', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  HK: { label: 'Hong Kong',   flag: '\ud83c\udded\ud83c\uddf0', color: '#f97316', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png' },
  TH: { label: 'Thailand',    flag: '\ud83c\uddf9\ud83c\udded', color: '#e11d48', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  AE: { label: 'UAE',         flag: '\ud83c\udde6\ud83c\uddea', color: '#0ea5e9', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' },
  TW: { label: 'Taiwan',      flag: '\ud83c\uddf9\ud83c\uddfc', color: '#7c3aed', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png' },
  MY: { label: 'Malaysia',    flag: '\ud83c\uddf2\ud83c\uddfe', color: '#ca8a04', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png' },
  ID: { label: 'Indonesia',   flag: '\ud83c\uddee\ud83c\udde9', color: '#dc2626', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  VN: { label: 'Vietnam',     flag: '\ud83c\uddfb\ud83c\uddf3', color: '#15803d', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  PH: { label: 'Philippines', flag: '\ud83c\uddf5\ud83c\udded', color: '#1d4ed8', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' },
  IN: { label: 'India',       flag: '\ud83c\uddee\ud83c\uddf3', color: '#ea580c', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png' },
  CN: { label: 'China',       flag: '\ud83c\udde8\ud83c\uddf3', color: '#be123c', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
};

const SHADOW = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

// Lazy-init: only called in the browser, never at module-eval time on the server.
let _icons: Record<string, L.Icon> | null = null;
let _defaultIcon: L.Icon | null = null;

function getIcons(): Record<string, L.Icon> {
  if (!_icons) {
    _icons = Object.fromEntries(
      Object.entries(ASIA_CONFIG).map(([k, v]) => [
        k,
        new L.Icon({ iconUrl: v.markerUrl, iconRetinaUrl: v.markerUrl.replace('.png', '-2x.png'), shadowUrl: SHADOW, iconSize: [20, 33], iconAnchor: [10, 33], popupAnchor: [1, -28], shadowSize: [33, 33] }),
      ])
    );
  }
  return _icons;
}

function getDefaultIcon(): L.Icon {
  if (!_defaultIcon) {
    _defaultIcon = new L.Icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png', shadowUrl: SHADOW, iconSize: [20, 33], iconAnchor: [10, 33], popupAnchor: [1, -28], shadowSize: [33, 33] });
  }
  return _defaultIcon;
}

function isPopulated(cam: AsiaCam): boolean {
  if (!cam.lat || !cam.lon || !isFinite(cam.lat) || !isFinite(cam.lon)) return false;
  if (!cam.title?.trim()) return false;
  return !!(cam.imageUrl || cam.sourceUrl);
}

interface Props {
  visible: Record<string, boolean>;
  cams?: AsiaCam[];
  onLoad?: (count: number) => void;
  onCountChange?: (count: number) => void;
  onExpand?: (entry: CamLightboxEntry) => void;
}

export default function AsiaWebcamsLayer({ visible, cams: camsProp, onLoad, onCountChange, onExpand }: Props) {
  const [fetchedCams, setFetchedCams] = useState<AsiaCam[]>([]);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

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

  const notifiedRef = useRef(false);
  useEffect(() => {
    if (camsProp === undefined) return;
    if (!notifiedRef.current && camsProp.length > 0) {
      notifiedRef.current = true;
      onLoadRef.current?.(camsProp.length);
    }
  }, [camsProp]);

  const cams = camsProp !== undefined ? camsProp : fetchedCams;

  const populated = useMemo(() => cams.filter(isPopulated), [cams]);
  const count = populated.length;
  useEffect(() => { onCountChange?.(count); }, [count, onCountChange]);

  // Icons are built lazily on first render (browser only)
  const icons = useMemo(() => getIcons(), []);
  const defaultIcon = useMemo(() => getDefaultIcon(), []);

  return (
    <>
      {populated.map(cam => {
        const key  = cam.sourceCountry ?? cam.country ?? 'SG';
        if (!visible[key]) return null;
        const cfg  = ASIA_CONFIG[key];
        const icon = icons[key] ?? defaultIcon;
        return (
          <Marker key={cam.id} position={[cam.lat, cam.lon]} icon={icon}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui, sans-serif' }}>
                <strong style={{ fontSize: 13 }}>{cam.title}</strong>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                  {[cam.city, cam.country].filter(Boolean).join(' \u00b7 ')}
                </div>
                {cam.imageUrl && (
                  <div style={{ marginTop: 6, cursor: onExpand ? 'pointer' : 'default' }}
                    onClick={() => onExpand?.({ source: 'asia' as never, title: cam.title, imageUrl: cam.imageUrl, linkUrl: cam.sourceUrl, linkLabel: cfg?.label ?? 'Source' })}>
                    <img src={cam.imageUrl} alt={cam.title}
                      style={{ maxWidth: 250, borderRadius: 5, display: 'block' }}
                      loading="lazy"
                      onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
                  </div>
                )}
                {cam.sourceUrl && (
                  <div style={{ marginTop: 5 }}>
                    <a href={cam.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open source \u2197</a>
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
