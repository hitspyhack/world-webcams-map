'use client';

import L from 'leaflet';
import { useMemo } from 'react';
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
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

interface WindyLayerProps {
  /** When false the layer hides all markers AND skips API fetches. */
  enabled: boolean;
  /** Callback so parent can show the live count in the legend panel. */
  onCountChange?: (count: number) => void;
  /** Debounce delay in ms after map stops moving. Default: 600 */
  debounceMs?: number;
  /** Max cameras per request (free-tier: ≤ 50). Default: 50 */
  limit?: number;
}

/**
 * WindyLayer — a self-contained react-leaflet layer that:
 *  1. Uses useWindyWebcams() to fetch Windy cameras for the current viewport.
 *  2. Re-fetches automatically whenever the map moves or zooms (with debounce).
 *  3. Cancels in-flight requests via AbortController when a new viewport fires.
 *
 * Must be rendered inside a <MapContainer>.
 */
export default function WindyLayer({
  enabled,
  onCountChange,
  debounceMs = 600,
  limit = 50,
}: WindyLayerProps) {
  const icon = useMemo(makeIcon, []);

  const { webcams, loading, error } = useWindyWebcams({ enabled, debounceMs, limit });

  // Notify parent of live count changes
  // (useEffect would cause an extra render cycle; this inline call is intentional
  //  because onCountChange should be a stable callback ref in the parent)
  onCountChange?.(webcams.length);

  if (!enabled) return null;

  return (
    <>
      {/* Loading indicator injected into the map */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: 12,
            zIndex: 1000,
            padding: '5px 11px',
            background: 'rgba(11,18,32,0.82)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 11,
            backdropFilter: 'blur(6px)',
            pointerEvents: 'none',
          }}
        >
          ⟳ Windy: loading…
        </div>
      )}

      {/* Error badge */}
      {error && !loading && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: 12,
            zIndex: 1000,
            padding: '5px 11px',
            background: 'rgba(161,44,68,0.9)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 11,
            pointerEvents: 'none',
          }}
        >
          ⚠ Windy: {error}
        </div>
      )}

      {/* Markers */}
      {webcams.map((cam: WindyWebcam) => {
        const loc = cam.location;
        if (!loc) return null;
        const { latitude: lat, longitude: lon } = loc;
        if (lat == null || lon == null) return null;
        const id = cam.webcamId ?? cam.id ?? `${lat}-${lon}`;
        return (
          <Marker key={`windy-${id}`} position={[lat, lon]} icon={icon}>
            <Popup maxWidth={260}>
              <strong>{cam.title ?? 'Windy webcam'}</strong>
              <br />
              <span style={{ fontSize: 11, color: '#666' }}>
                {[loc.city, loc.region, loc.country].filter(Boolean).join(', ')}
              </span>
              {cam.images?.current?.preview && (
                <div style={{ marginTop: 6 }}>
                  <img
                    src={cam.images.current.preview}
                    alt={cam.title ?? ''}
                    style={{ maxWidth: 240, borderRadius: 5 }}
                    loading="lazy"
                  />
                </div>
              )}
              {cam.urls?.player && (
                <div style={{ marginTop: 6 }}>
                  <iframe
                    src={cam.urls.player}
                    title="timelapse"
                    width="240"
                    height="135"
                    loading="lazy"
                    style={{ border: 0, borderRadius: 5 }}
                  />
                </div>
              )}
              {cam.urls?.webcam && (
                <div style={{ marginTop: 4 }}>
                  <a
                    href={cam.urls.webcam}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11 }}
                  >
                    Open on Windy ↗
                  </a>
                </div>
              )}
              <div style={{ marginTop: 4, fontSize: 10, color: '#3b82f6', fontWeight: 600 }}>
                SOURCE: WINDY
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
