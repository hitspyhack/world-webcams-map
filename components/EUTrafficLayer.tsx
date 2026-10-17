'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { createCameraIcon } from '../lib/mapIcons';
import { hasCoordinates } from '../lib/cameras';
import { Marker, Popup } from 'react-leaflet';
import type { CamLightboxEntry } from './CamLightbox';

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

import { EU_COUNTRIES } from '../lib/sources';
export { EU_COUNTRIES } from '../lib/sources';

const EU_CONFIG: Record<string, { label: string; flag: string; color: string }> = {
  FI: { label: 'Finland',     flag: '\ud83c\uddeb\ud83c\uddee', color: '#06b6d4' },
  EE: { label: 'Estonia',     flag: '\ud83c\uddea\ud83c\uddea', color: '#f59e0b' },
  GB: { label: 'UK (TfL)',    flag: '\ud83c\uddec\ud83c\udde7', color: '#dc2626' },
  SE: { label: 'Sweden',      flag: '\ud83c\uddf8\ud83c\uddea', color: '#3b82f6' },
  NO: { label: 'Norway',      flag: '\ud83c\uddf3\ud83c\uddf4', color: '#16a34a' },
  PT: { label: 'Portugal',    flag: '\ud83c\uddf5\ud83c\uddf9', color: '#15803d' },
  DE: { label: 'Germany',     flag: '\ud83c\udde9\ud83c\uddea', color: '#facc15' },
  FR: { label: 'France',      flag: '\ud83c\uddeb\ud83c\uddf7', color: '#818cf8' },
  ES: { label: 'Spain',       flag: '\ud83c\uddea\ud83c\uddf8', color: '#f97316' },
  NL: { label: 'Netherlands', flag: '\ud83c\uddf3\ud83c\uddf1', color: '#f97316' },
  AT: { label: 'Austria',     flag: '\ud83c\udde6\ud83c\uddf9', color: '#ef4444' },
  CH: { label: 'Switzerland', flag: '\ud83c\udde8\ud83c\udded', color: '#f43f5e' },
  IT: { label: 'Italy',       flag: '\ud83c\uddee\ud83c\uddf9', color: '#34d399' },
  DK: { label: 'Denmark',     flag: '\ud83c\udde9\ud83c\uddf0', color: '#f87171' },
  BE: { label: 'Belgium',     flag: '\ud83c\udde7\ud83c\uddea', color: '#fbbf24' },
  PL: { label: 'Poland',      flag: '\ud83c\uddf5\ud83c\uddf1', color: '#e879f9' },
  EU: { label: 'OSM Roads',   flag: '\ud83c\uddea\ud83c\uddfa', color: '#7c3aed' },
};

// Lazy-init: only called in the browser, never at module-eval time on the server.
let _icons: Record<string, L.Icon> | null = null;
let _defaultIcon: L.Icon | null = null;

function getIcons(): Record<string, L.Icon> {
  if (!_icons) {
    _icons = Object.fromEntries(
      Object.entries(EU_CONFIG).map(([k, v]) => [
        k,
        createCameraIcon(v.color, true),
      ])
    );
  }
  return _icons;
}

function getDefaultIcon(): L.Icon {
  if (!_defaultIcon) {
    _defaultIcon = createCameraIcon('#79c0ff', true);
  }
  return _defaultIcon;
}

function isPopulated(cam: TrafficCam): boolean {
  if (!hasCoordinates(cam)) return false;
  const hasContent = !!(cam.title?.trim()) || !!(cam.imageUrl) || !!(cam.sourceUrl) || !!(cam.webcamUrl);
  if (!hasContent) return false;
  return !!(cam.imageUrl || cam.sourceUrl || cam.webcamUrl || cam.roadCondition);
}

interface Props {
  visible: Record<string, boolean>;
  cams?: TrafficCam[];
  onLoad?: (count: number) => void;
  onCountChange?: (count: number) => void;
  onExpand?: (entry: CamLightboxEntry) => void;
}

export default function EUTrafficLayer({ visible, cams: camsProp, onLoad, onCountChange, onExpand }: Props) {
  const [fetchedCams, setFetchedCams] = useState<TrafficCam[]>([]);
  const [loading, setLoading] = useState(false);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    if (camsProp !== undefined) return;
    setLoading(true);
    const countries = Object.keys(EU_COUNTRIES).join(',');
    fetch(`/api/eu-traffic?countries=${countries}`)
      .then(r => r.json())
      .then(data => {
        const arr: TrafficCam[] = (Array.isArray(data) ? data : []).filter(isPopulated);
        setFetchedCams(arr);
        onLoadRef.current?.(arr.length);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
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

  if (loading) return null;

  return (
    <>
      {populated.map(cam => {
        const key = cam.sourceCountry ?? cam.country ?? 'EU';
        const cfgKey = key in EU_COUNTRIES ? key : 'EU';
        if (visible[cfgKey] === false) return null;
        const icon = icons[cfgKey] ?? defaultIcon;
        const cfg  = EU_CONFIG[cfgKey];
        const imgSrc = cam.imageUrl ?? cam.sourceUrl ?? cam.webcamUrl ?? '';
        const linkUrl = cam.sourceUrl ?? cam.webcamUrl ?? '';

        return (
          <Marker key={cam.id} position={[cam.lat, cam.lon]} icon={icon}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui, sans-serif', color: '#e6edf3' }}>
                <strong style={{ fontSize: 13, color: '#f0f6fc' }}>{cam.title ?? 'Traffic cam'}</strong>
                {(cam.city || cam.county) && (
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                    {[cam.city, cam.county].filter(Boolean).join(' \u00b7 ')}
                  </div>
                )}
                {cam.roadCondition && (
                  <div style={{ fontSize: 11, marginTop: 2, color: '#8b949e' }}>
                    \ud83d\udee3 {cam.roadCondition}{cam.airTemp != null ? ` \u00b7 ${cam.airTemp}\u00b0C` : ''}
                  </div>
                )}
                {cam.operator && (
                  <div style={{ fontSize: 11, color: '#6e7681', marginTop: 2 }}>Op: {cam.operator}</div>
                )}
                {imgSrc && imgSrc.startsWith('http') && (
                  <div style={{ marginTop: 6, cursor: onExpand ? 'pointer' : 'default' }}
                    onClick={() => onExpand?.({ source: 'eu' as never, title: cam.title ?? 'Traffic cam', imageUrl: imgSrc, linkUrl, linkLabel: cfg?.label ?? 'Source' })}>
                    <img src={imgSrc} alt={cam.title ?? ''}
                      style={{ maxWidth: 250, borderRadius: 6, display: 'block' }}
                      loading="lazy"
                      onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
                  </div>
                )}
                {linkUrl && (
                  <div style={{ marginTop: 5 }}>
                    <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open stream \u2197</a>
                  </div>
                )}
                <div style={{ marginTop: 5, fontSize: 10, fontWeight: 700, color: cfg?.color ?? '#7c3aed' }}>
                  {cfg?.flag} {cfg?.label.toUpperCase()}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
