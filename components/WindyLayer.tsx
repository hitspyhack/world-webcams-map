'use client';

import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { useWindyWebcams } from '../hooks/useWindyWebcams';
import type { WindyWebcam } from '../types/webcam';

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

/** A Windy cam is considered populated when it has valid coords + a title
 *  + at least one usable media URL (preview image OR webcam link). */
function isPopulated(cam: WindyWebcam): boolean {
  const loc = cam.location;
  if (!loc) return false;
  const { latitude: lat, longitude: lon } = loc;
  if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) return false;
  if (!cam.title?.trim()) return false;
  const hasMedia =
    !!cam.images?.current?.preview ||
    !!cam.urls?.webcam ||
    !!cam.urls?.detail;
  return hasMedia;
}

interface WindyLayerProps {
  enabled: boolean;
  onCountChange?: (count: number) => void;
  onMissingKey?: () => void;
  debounceMs?: number;
  limit?: number;
}

export default function WindyLayer({
  enabled,
  onCountChange,
  onMissingKey,
  debounceMs = 600,
  limit = 50,
}: WindyLayerProps) {
  const icon = useMemo(makeIcon, []);

  const { webcams, loading, error, missingKey } = useWindyWebcams({ enabled, debounceMs, limit });

  const populated = webcams.filter(isPopulated);
  const populatedCount = populated.length;

  // ── Notify parent AFTER render (never during) ──────────────────────────
  // Calling setState on a parent component from inside the render body of a
  // child violates React's rule against side-effects during render and emits:
  //   "Cannot update a component (MapClient) while rendering WindyLayer"
  // Moving the calls into useEffect defers them until after the commit phase.
  useEffect(() => {
    onCountChange?.(populatedCount);
  }, [populatedCount, onCountChange]);

  useEffect(() => {
    if (missingKey) onMissingKey?.();
  }, [missingKey, onMissingKey]);

  if (!enabled) return null;

  return (
    <>
      {loading && (
        <div style={{
          position: 'absolute', bottom: 80, left: 12, zIndex: 1000,
          padding: '5px 11px', background: 'rgba(11,18,32,0.82)',
          color: '#fff', borderRadius: 8, fontSize: 11,
          backdropFilter: 'blur(6px)', pointerEvents: 'none',
        }}>
          ⟳ Windy: loading…
        </div>
      )}

      {error && !loading && !missingKey && (
        <div style={{
          position: 'absolute', bottom: 80, left: 12, zIndex: 1000,
          padding: '5px 11px', background: 'rgba(161,44,68,0.9)',
          color: '#fff', borderRadius: 8, fontSize: 11, pointerEvents: 'none',
        }}>
          ⚠ Windy: {error}
        </div>
      )}

      {missingKey && (
        <div style={{
          position: 'absolute', bottom: 80, left: 12, zIndex: 1000,
          padding: '5px 11px', background: 'rgba(30,30,40,0.82)',
          color: '#8b949e', borderRadius: 8, fontSize: 11,
          backdropFilter: 'blur(6px)', pointerEvents: 'none',
        }}>
          🔑 Windy disabled — add WINDY_WEBCAMS_API_KEY to .env.local
        </div>
      )}

      {populated.map((cam: WindyWebcam) => {
        const loc = cam.location!;
        const { latitude: lat, longitude: lon } = loc;
        const id = cam.webcamId ?? cam.id ?? `${lat}-${lon}`;
        return (
          <Marker key={`windy-${id}`} position={[lat!, lon!]} icon={icon}>
            <Popup maxWidth={270}>
              <strong style={{ fontSize: 13 }}>{cam.title}</strong>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                {[loc.city, loc.region, loc.country].filter(Boolean).join(', ')}
              </div>
              {cam.images?.current?.preview && (
                <div style={{ marginTop: 6 }}>
                  <img
                    src={cam.images.current.preview}
                    alt={cam.title ?? ''}
                    style={{ maxWidth: 248, width: '100%', borderRadius: 6, display: 'block', background: '#0d1117' }}
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              {cam.urls?.webcam && (
                <div style={{ marginTop: 5 }}>
                  <a href={cam.urls.webcam} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open on Windy ↗</a>
                </div>
              )}
              <div style={{ marginTop: 4, fontSize: 10, color: '#60a5fa', fontWeight: 700, letterSpacing: '0.04em' }}>SOURCE: WINDY</div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
