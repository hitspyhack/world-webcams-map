'use client';

import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Marker, Popup, useMap } from 'react-leaflet';
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

/**
 * Guard that a cam has valid coords, a non-empty title, AND at least a
 * preview image OR an outbound URL — so we never render a useless pin.
 *
 * Handles both the Windy API v3 response shape (image / urls) and any
 * legacy shape that used `images` / direct URL strings.
 */
function isPopulated(cam: WindyWebcam): boolean {
  const loc = cam.location;
  if (!loc) return false;
  const { latitude: lat, longitude: lon } = loc;
  if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) return false;
  if (!cam.title?.trim()) return false;

  // API v3 uses `image` (singular); some internal shapes use `images`
  const preview =
    (cam as unknown as Record<string, unknown> & { image?: { current?: { preview?: string } } })
      .image?.current?.preview ??
    cam.images?.current?.preview;

  const webcamUrl =
    cam.urls?.webcam ??
    cam.urls?.detail ??
    cam.urls?.player;

  return !!(preview || webcamUrl);
}

/** Stable overlay div mounted once inside the Leaflet container. */
function useOverlayDiv(className: string) {
  const map   = useMap();
  const elRef = useRef<HTMLDivElement | null>(null);
  if (!elRef.current) {
    const div = document.createElement('div');
    div.className = className;
    map.getContainer().appendChild(div);
    elRef.current = div;
  }
  useEffect(() => () => { elRef.current?.remove(); }, []);
  return elRef.current;
}

const BADGE_BASE: React.CSSProperties = {
  position: 'absolute', bottom: 80, left: 12, zIndex: 1000,
  padding: '5px 11px', borderRadius: 8, fontSize: 11, pointerEvents: 'none',
};

interface WindyLayerProps {
  enabled: boolean;
  onCountChange?: (count: number) => void;
  onMissingKey?: () => void;
  onExpand?: (entry: CamLightboxEntry) => void;
  countryFilter?: CountryEntry;
  /** When set, overrides live viewport bbox (e.g. for country-filter mode). */
  forceBbox?: string | null;
  debounceMs?: number;
  limit?: number;
}

export default function WindyLayer({
  enabled,
  onCountChange,
  onMissingKey,
  onExpand,
  countryFilter,
  forceBbox = null,
  debounceMs = 600,
  limit = 50,
}: WindyLayerProps) {
  const icon = useMemo(makeIcon, []);
  const overlayEl = useOverlayDiv('windy-status-overlay');

  const { webcams, loading, error, missingKey } = useWindyWebcams({
    enabled,
    debounceMs,
    limit,
    forceBbox,
  });

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

  // Status badge lives in a portal outside the react-leaflet SVG tree
  const badge = loading ? (
    <div style={{ ...BADGE_BASE, background: 'rgba(11,18,32,0.82)', color: '#fff', backdropFilter: 'blur(6px)' }}>
      ⟳ Windy: loading…
    </div>
  ) : error && !missingKey ? (
    <div style={{ ...BADGE_BASE, background: 'rgba(161,44,68,0.9)', color: '#fff' }}>
      ⚠ Windy: {error}
    </div>
  ) : missingKey ? (
    <div style={{ ...BADGE_BASE, background: 'rgba(30,30,40,0.82)', color: '#8b949e', backdropFilter: 'blur(6px)' }}>
      🔑 Windy disabled — add WINDY_WEBCAMS_API_KEY to .env.local
    </div>
  ) : null;

  return (
    <>
      {createPortal(badge, overlayEl)}

      {populated.map((cam: WindyWebcam) => {
        const loc  = cam.location!;
        const { latitude: lat, longitude: lon } = loc;
        const id   = cam.webcamId ?? cam.id ?? `${lat}-${lon}`;
        const title = cam.title ?? 'Windy cam';

        // API v3 uses `image` (singular); fall back to `images` for safety
        const camAny = cam as unknown as Record<string, unknown> & {
          image?: { current?: { preview?: string } };
        };
        const preview  = camAny.image?.current?.preview ?? cam.images?.current?.preview ?? '';
        const playerUrl = cam.urls?.player  ?? cam.urls?.webcam  ?? '';
        const webcamUrl = cam.urls?.webcam  ?? cam.urls?.detail  ?? '';

        return (
          <Marker key={`windy-${id}`} position={[lat!, lon!]} icon={icon}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui' }}>
                <strong style={{ fontSize: 13 }}>{title}</strong>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                  {[loc.city, loc.region, loc.country].filter(Boolean).join(', ')}
                </div>

                {preview && onExpand && (
                  <div
                    className="cam-preview-wrap"
                    style={{ position: 'relative', marginTop: 7, cursor: 'pointer' }}
                    onClick={() => onExpand({ source: 'windy', title, embedUrl: playerUrl || undefined, imageUrl: preview || undefined, linkUrl: webcamUrl, linkLabel: 'Open on Windy' })}
                  >
                    <img
                      src={preview} alt={title}
                      style={{ maxWidth: 248, width: '100%', borderRadius: 6, display: 'block', background: '#0d1117' }}
                      loading="lazy"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button
                      className="cam-expand-btn"
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
                    <img
                      src={preview} alt={title}
                      style={{ maxWidth: 248, width: '100%', borderRadius: 6, display: 'block', background: '#0d1117' }}
                      loading="lazy"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
