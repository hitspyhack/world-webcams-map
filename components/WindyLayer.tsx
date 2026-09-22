'use client';

import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { useWindyWebcams } from '../hooks/useWindyWebcams';
import type { WindyWebcam } from '../types/webcam';
import type { CamLightboxEntry } from './CamLightbox';
import type { CountryEntry } from './CountrySearch';

const SHADOW_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
const MARKER_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';

function makeIcon() {
  return new L.Icon({
    iconUrl: MARKER_URL,
    iconRetinaUrl: MARKER_URL.replace('.png', '-2x.png'),
    shadowUrl: SHADOW_URL,
    iconSize: [25, 41], iconAnchor: [12, 41],
    popupAnchor: [1, -34], shadowSize: [41, 41],
  });
}

function isPopulated(cam: WindyWebcam): boolean {
  const loc = cam.location;
  if (!loc) return false;
  const { latitude: lat, longitude: lon } = loc;
  if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) return false;
  if (!cam.title?.trim()) return false;
  return !!cam.images?.current?.preview || !!cam.urls?.webcam || !!cam.urls?.detail;
}

interface WindyLayerProps {
  enabled: boolean;
  onCountChange?: (count: number) => void;
  onMissingKey?: () => void;
  onExpand?: (entry: CamLightboxEntry) => void;
  countryFilter?: CountryEntry;
  debounceMs?: number;
  limit?: number;
}

export default function WindyLayer({
  enabled,
  onCountChange,
  onMissingKey,
  onExpand,
  countryFilter,
  debounceMs = 600,
  limit = 50,
}: WindyLayerProps) {
  const icon = useMemo(makeIcon, []);
  const { webcams, loading, error, missingKey } = useWindyWebcams({ enabled, debounceMs, limit });

  const populated = useMemo(() => {
    const base = webcams.filter(isPopulated);
    if (!countryFilter) return base;
    const code = countryFilter.code.toUpperCase();
    const name = countryFilter.name.toLowerCase();
    return base.filter(c => {
      const cc = (c.location?.country ?? '').toUpperCase();
      return cc === code || cc.toLowerCase() === name;
    });
  }, [webcams, countryFilter]);

  const populatedCount = populated.length;

  useEffect(() => { onCountChange?.(populatedCount); }, [populatedCount, onCountChange]);
  useEffect(() => { if (missingKey) onMissingKey?.(); }, [missingKey, onMissingKey]);

  if (!enabled) return null;

  return (
    <>
      {loading && (
        <div style={{
          position: 'absolute', bottom: 80, left: 12, zIndex: 1000,
          padding: '5px 11px', background: 'rgba(11,18,32,0.82)',
          color: '#fff', borderRadius: 8, fontSize: 11,
          backdropFilter: 'blur(6px)', pointerEvents: 'none',
        }}>⟳ Windy: loading…</div>
      )}
      {error && !loading && !missingKey && (
        <div style={{
          position: 'absolute', bottom: 80, left: 12, zIndex: 1000,
          padding: '5px 11px', background: 'rgba(161,44,68,0.9)',
          color: '#fff', borderRadius: 8, fontSize: 11, pointerEvents: 'none',
        }}>⚠ Windy: {error}</div>
      )}
      {missingKey && (
        <div style={{
          position: 'absolute', bottom: 80, left: 12, zIndex: 1000,
          padding: '5px 11px', background: 'rgba(30,30,40,0.82)',
          color: '#8b949e', borderRadius: 8, fontSize: 11,
          backdropFilter: 'blur(6px)', pointerEvents: 'none',
        }}>🔑 Windy disabled — add WINDY_WEBCAMS_API_KEY to .env.local</div>
      )}

      {populated.map((cam: WindyWebcam) => {
        const loc = cam.location!;
        const { latitude: lat, longitude: lon } = loc;
        const id = cam.webcamId ?? cam.id ?? `${lat}-${lon}`;
        const title = cam.title ?? 'Windy cam';
        const preview = cam.images?.current?.preview ?? '';
        const playerUrl = cam.urls?.player ?? cam.urls?.webcam ?? '';
        const webcamUrl = cam.urls?.webcam ?? cam.urls?.detail ?? '';

        return (
          <Marker key={`windy-${id}`} position={[lat!, lon!]} icon={icon}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui' }}>
                <strong style={{ fontSize: 13 }}>{title}</strong>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                  {[loc.city, loc.region, loc.country].filter(Boolean).join(', ')}
                </div>

                {preview && onExpand && (
                  <div className="cam-preview-wrap"
                    style={{ position: 'relative', marginTop: 7, cursor: 'pointer' }}
                    onClick={() => onExpand({ source: 'windy', title, embedUrl: playerUrl || undefined, imageUrl: preview || undefined, linkUrl: webcamUrl, linkLabel: 'Open on Windy' })}
                  >
                    <img src={preview} alt={title}
                      style={{ maxWidth: 248, width: '100%', borderRadius: 6, display: 'block', background: '#0d1117' }}
                      loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button className="cam-expand-btn"
                      onClick={e => { e.stopPropagation(); onExpand({ source: 'windy', title, embedUrl: playerUrl || undefined, imageUrl: preview || undefined, linkUrl: webcamUrl, linkLabel: 'Open on Windy' }); }}
                      aria-label="Expand to full view"
                      style={{
                        position: 'absolute', top: 6, right: 6,
                        background: 'rgba(13,17,23,0.85)', border: '1px solid rgba(255,255,255,0.15)',
                        color: '#e6edf3', borderRadius: 6, padding: '3px 7px',
                        fontSize: 13, cursor: 'pointer', lineHeight: 1, backdropFilter: 'blur(4px)',
                        opacity: 0, transition: 'opacity 0.15s',
                      }}
                    >⛶</button>
                  </div>
                )}
                {preview && !onExpand && (
                  <div style={{ marginTop: 7 }}>
                    <img src={preview} alt={title}
                      style={{ maxWidth: 248, width: '100%', borderRadius: 6, display: 'block', background: '#0d1117' }}
                      loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}

                {webcamUrl && (
                  <div style={{ marginTop: 5 }}>
                    <a href={webcamUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open on Windy ↗</a>
                  </div>
                )}
                <div style={{ marginTop: 4, fontSize: 10, color: '#60a5fa', fontWeight: 700, letterSpacing: '0.04em' }}>SOURCE: WINDY</div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
