'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import AsiaWebcamsLayer, { ASIA_SOURCES } from './AsiaWebcamsLayer';
import EUTrafficLayer,   { EU_COUNTRIES }  from './EUTrafficLayer';
import WindyLayer from './WindyLayer';
import { useState } from 'react';
import type {
  SkylineItem,
  EarthCamItem,
  OsmWebcam,
  DeckchairWebcam,
} from '../types/webcam';
import type { SourceKey, FlyToTarget } from './MapClient';

function toArray<T>(val: unknown): T[] { return Array.isArray(val) ? (val as T[]) : []; }
void toArray; // imported helper kept for potential future use

// Internal shapes — must match what MapClient passes down
interface TrafficCam {
  id: string; title?: string; lat: number; lon: number;
  country?: string; sourceCountry?: string; city?: string;
  imageUrl?: string; sourceUrl?: string; webcamUrl?: string;
  roadCondition?: string; airTemp?: number; county?: string;
  photoTime?: string; operator?: string;
}
interface AsiaCam {
  id: string; title: string; lat: number; lon: number;
  country?: string; city?: string; sourceCountry?: string;
  imageUrl?: string; sourceUrl?: string;
}

// SOURCE_CONFIG stays here (marker URLs only needed by the map)
const SOURCE_CONFIG: Record<SourceKey, { label: string; color: string; markerUrl: string }> = {
  windy:     { label: 'Windy',     color: '#60a5fa', markerUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png' },
  skyline:   { label: 'Skyline',   color: '#f87171', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  earthcam:  { label: 'EarthCam',  color: '#fb923c', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png' },
  osm:       { label: 'OSM',       color: '#4ade80', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  deckchair: { label: 'Deckchair', color: '#c084fc', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png' },
};

const SHADOW_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
function makeIcon(url: string) {
  return new L.Icon({ iconUrl: url, iconRetinaUrl: url.replace('.png', '-2x.png'), shadowUrl: SHADOW_URL, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
}

const OSM_URL  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';

const TILE_FILTER_CSS = `
  .leaflet-tile-pane {
    filter: invert(1) hue-rotate(180deg) brightness(0.78) contrast(1.08) saturate(0.75);
  }
  .leaflet-popup-content-wrapper, .leaflet-popup-tip {
    background: rgba(13,17,23,0.97) !important; color: #e6edf3 !important;
    border: 1px solid #30363d !important; box-shadow: 0 8px 24px rgba(0,0,0,0.7) !important;
  }
  .leaflet-popup-content a { color: #79c0ff; }
  .leaflet-control-attribution { background: rgba(13,17,23,0.85) !important; color: #484f58 !important; }
  .leaflet-control-attribution a { color: #30363d !important; }
  .leaflet-control-zoom a { background: rgba(22,27,34,0.95) !important; color: #8b949e !important; border-color: #30363d !important; }
  .leaflet-control-zoom a:hover { background: rgba(48,54,61,0.95) !important; color: #e6edf3 !important; }
`;

function PreviewImg({ src, alt }: { src: string; alt: string }) {
  if (!src) return null;
  return (
    <div style={{ marginTop: 7 }}>
      <img src={src} alt={alt} style={{ maxWidth: 248, width: '100%', borderRadius: 6, display: 'block', background: '#0d1117' }}
        loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
    </div>
  );
}
function PopupLink({ href, label }: { href: string; label: string }) {
  if (!href) return null;
  return <div style={{ marginTop: 5 }}><a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>{label} ↗</a></div>;
}
function SourceBadge({ label, color }: { label: string; color: string }) {
  return <div style={{ marginTop: 5, fontSize: 10, fontWeight: 700, color, letterSpacing: '0.04em' }}>SOURCE: {label}</div>;
}

// ── FlyTo controller — inner component so it has map context ─────────────────
function FlyToController({ target, onDone }: { target: FlyToTarget | null; onDone: () => void }) {
  const map = useMap();
  const doneRef = useRef(false);
  useEffect(() => {
    if (!target) { doneRef.current = false; return; }
    if (doneRef.current) return;
    doneRef.current = true;
    map.flyTo([target.lat, target.lon], target.zoom ?? 13, { duration: 1.4 });
    setTimeout(onDone, 1600);
  }, [target, map, onDone]);
  return null;
}

// ── Props ────────────────────────────────────────────────────────────────────────────
interface LeafletMapProps {
  skylineCams:   SkylineItem[];
  earthCams:     EarthCamItem[];
  osmCams:       OsmWebcam[];
  deckCams:      DeckchairWebcam[];
  /** Pre-fetched EU traffic cams from MapClient (avoids duplicate request). */
  euCams:        TrafficCam[];
  /** Pre-fetched Asia cams from MapClient (avoids duplicate request). */
  asiaCams:      AsiaCam[];
  visible:       Record<SourceKey, boolean>;
  euVisible:     Record<string, boolean>;
  asiaVisible:   Record<string, boolean>;
  loading:       boolean;
  errors:        string[];
  onWindyCount:  (n: number) => void;
  onAsiaCount:   (n: number) => void;
  onEuCount:     (n: number) => void;
  onToggleSource:(key: string) => void;
  onToggleEu:    (key: string) => void;
  onToggleAsia:  (key: string) => void;
  flyTo:         FlyToTarget | null;
  onFlyToDone:   () => void;
}

export default function LeafletMap({
  skylineCams, earthCams, osmCams, deckCams,
  euCams, asiaCams,
  visible, euVisible, asiaVisible,
  loading, errors,
  onWindyCount, onAsiaCount, onEuCount,
  onToggleSource, onToggleEu, onToggleAsia,
  flyTo, onFlyToDone,
}: LeafletMapProps) {
  const windyCountRef = useRef(0);
  const handleWindyCount = useCallback((n: number) => {
    if (n !== windyCountRef.current) { windyCountRef.current = n; onWindyCount(n); }
  }, [onWindyCount]);

  // Notify parent of EU/Asia counts whenever the pre-fetched arrays change
  useEffect(() => { onEuCount(euCams.length); }, [euCams.length, onEuCount]);
  useEffect(() => { onAsiaCount(asiaCams.length); }, [asiaCams.length, onAsiaCount]);

  const [openSection, setOpenSection] = useState<'global'|'eu'|'asia'>('global');

  const icons = useMemo(() => {
    const r = {} as Record<SourceKey, L.Icon>;
    for (const [k, cfg] of Object.entries(SOURCE_CONFIG)) r[k as SourceKey] = makeIcon(cfg.markerUrl);
    return r;
  }, []);

  useEffect(() => {
    const id = 'osint-tile-filter';
    if (document.getElementById(id)) return;
    const el = document.createElement('style'); el.id = id; el.textContent = TILE_FILTER_CSS;
    document.head.appendChild(el);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  const globalTotal = (windyCountRef.current) + skylineCams.length + earthCams.length + osmCams.length + deckCams.length;

  const legendStyle: React.CSSProperties = {
    position: 'absolute', bottom: 24, right: 12, zIndex: 1000,
    background: 'rgba(13,17,23,0.96)', color: '#e6edf3',
    border: '1px solid #30363d', borderRadius: 12, padding: '12px 14px', fontSize: 12,
    display: 'flex', flexDirection: 'column', gap: 6,
    backdropFilter: 'blur(12px)', minWidth: 210,
    maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  };

  const sectionBtn = (key: 'global'|'eu'|'asia', label: string) => (
    <button
      onClick={() => setOpenSection(s => s === key ? 'global' : key)}
      style={{
        background: openSection === key ? 'rgba(88,166,255,0.10)' : 'transparent',
        border: openSection === key ? '1px solid rgba(88,166,255,0.2)' : '1px solid transparent',
        color: openSection === key ? '#79c0ff' : '#8b949e',
        fontWeight: 700, fontSize: 11, letterSpacing: '0.05em',
        padding: '3px 8px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'all 0.15s',
      }}
    >{openSection === key ? '▾' : '▸'} {label}</button>
  );

  const toggle = (
    key: string, state: Record<string, boolean>,
    onToggle: (k: string) => void,
    color: string, markerUrl: string, label: string, count: number,
  ) => (
    <label key={key} style={{
      display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
      opacity: state[key] ? 1 : 0.35, transition: 'opacity 0.2s',
      padding: '2px 0',
    }}>
      <input type="checkbox" checked={!!state[key]} onChange={() => onToggle(key)}
        style={{ accentColor: color, cursor: 'pointer', width: 13, height: 13 }} />
      <img src={markerUrl} alt="" style={{ width: 10, height: 17, objectFit: 'contain' }} />
      <span style={{ flex: 1, fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 10, color: '#8b949e', minWidth: 28, textAlign: 'right' }}>{count}</span>
    </label>
  );

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <MapContainer
        center={[20, 0]} zoom={3} style={{ width: '100%', height: '100%' }}
        zoomControl={true} preferCanvas={true}
      >
        <TileLayer url={OSM_URL} attribution={OSM_ATTR} />
        <FlyToController target={flyTo} onDone={onFlyToDone} />

        {/* Windy — live viewport fetch */}
        <WindyLayer enabled={visible.windy} onCountChange={handleWindyCount} />

        {/* Skyline — SkylineItem uses flat lat/lon */}
        {visible.skyline && skylineCams.map(cam => {
          if (!cam.lat || !cam.lon) return null;
          const title = cam.title ?? 'Skyline cam';
          const img   = cam.snapshotUrl ?? '';
          return (
            <Marker key={cam.id ?? `sky-${cam.lat}-${cam.lon}`} position={[cam.lat, cam.lon]} icon={icons.skyline}>
              <Popup maxWidth={270}>
                <div style={{ fontFamily: 'system-ui' }}>
                  <strong style={{ fontSize: 13 }}>{title}</strong>
                  {cam.city && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{cam.city}{cam.country ? ` · ${cam.country}` : ''}</div>}
                  <PreviewImg src={img} alt={title} />
                  <PopupLink href={cam.url ?? ''} label="Open on Skyline" />
                  <SourceBadge label="SKYLINE" color={SOURCE_CONFIG.skyline.color} />
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* EarthCam */}
        {visible.earthcam && earthCams.map((cam) => {
          if (!cam.lat || !cam.lon) return null;
          const title = cam.title ?? 'EarthCam';
          return (
            <Marker key={cam.id} position={[cam.lat, cam.lon]} icon={icons.earthcam}>
              <Popup maxWidth={270}>
                <div style={{ fontFamily: 'system-ui' }}>
                  <strong style={{ fontSize: 13 }}>{title}</strong>
                  {cam.city && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{cam.city}{cam.country ? ` · ${cam.country}` : ''}</div>}
                  <PreviewImg src={cam.imageUrl ?? ''} alt={title} />
                  <PopupLink href={cam.embedUrl ?? ''} label="View on EarthCam" />
                  <SourceBadge label="EARTHCAM" color={SOURCE_CONFIG.earthcam.color} />
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* OSM — OsmWebcam uses webcamUrl, not url */}
        {visible.osm && osmCams.map((cam) => {
          if (!cam.lat || !cam.lon) return null;
          const title = cam.title ?? cam.name ?? 'OSM webcam';
          return (
            <Marker key={cam.id ?? `osm-${cam.lat}-${cam.lon}`} position={[cam.lat, cam.lon]} icon={icons.osm}>
              <Popup maxWidth={270}>
                <div style={{ fontFamily: 'system-ui' }}>
                  <strong style={{ fontSize: 13 }}>{title}</strong>
                  {cam.city && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{cam.city}{cam.country ? ` · ${cam.country}` : ''}</div>}
                  <PopupLink href={cam.webcamUrl ?? ''} label="Open webcam" />
                  <SourceBadge label="OSM" color={SOURCE_CONFIG.osm.color} />
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Deckchair */}
        {visible.deckchair && deckCams.map((cam) => {
          if (!cam.lat || !cam.lon) return null;
          const title = cam.title ?? 'Deckchair';
          return (
            <Marker key={cam.id} position={[cam.lat, cam.lon]} icon={icons.deckchair}>
              <Popup maxWidth={270}>
                <div style={{ fontFamily: 'system-ui' }}>
                  <strong style={{ fontSize: 13 }}>{title}</strong>
                  <PreviewImg src={cam.thumbnailUrl ?? ''} alt={title} />
                  <PopupLink href={cam.embedUrl ?? ''} label="View stream" />
                  <SourceBadge label="DECKCHAIR" color={SOURCE_CONFIG.deckchair.color} />
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/*
          EU Traffic — pass pre-fetched cams so the layer renders without
          making a second network request. onLoad still called for count.
        */}
        <EUTrafficLayer cams={euCams} visible={euVisible} onLoad={onEuCount} />

        {/*
          Asia — same pattern: render from pre-fetched data.
        */}
        <AsiaWebcamsLayer cams={asiaCams} visible={asiaVisible} onLoad={onAsiaCount} />
      </MapContainer>

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1100, background: 'rgba(13,17,23,0.9)',
          color: '#58a6ff', fontFamily: 'monospace', fontSize: 12,
          padding: '6px 14px', borderRadius: 8, border: '1px solid #30363d',
          letterSpacing: '0.08em',
        }}>
          ⟳ Loading cameras…
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{
          position: 'absolute', top: loading ? 100 : 60, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1100, background: 'rgba(13,17,23,0.9)',
          color: '#f87171', fontFamily: 'monospace', fontSize: 11,
          padding: '5px 12px', borderRadius: 8, border: '1px solid #f8717140',
          maxWidth: 320, textAlign: 'center',
        }}>
          ⚠ {errors.join(' · ')}
        </div>
      )}

      {/* Legend */}
      <div style={legendStyle}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.05em', color: '#58a6ff', marginBottom: 2 }}>
          ◉ CAMERA SOURCES
          <span style={{ float: 'right', fontWeight: 400, color: '#8b949e', fontSize: 11 }}>{globalTotal.toLocaleString()}</span>
        </div>

        {sectionBtn('global', 'Global')}
        {openSection === 'global' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
            {(Object.entries(SOURCE_CONFIG) as [SourceKey, typeof SOURCE_CONFIG[SourceKey]][]).map(([key, cfg]) => {
              const count = key === 'windy' ? windyCountRef.current
                : key === 'skyline'   ? skylineCams.length
                : key === 'earthcam'  ? earthCams.length
                : key === 'osm'       ? osmCams.length
                : deckCams.length;
              return toggle(key, visible as Record<string,boolean>, onToggleSource, cfg.color, cfg.markerUrl, cfg.label, count);
            })}
          </div>
        )}

        {sectionBtn('eu', `EU Traffic`)}
        {openSection === 'eu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
            {Object.entries(EU_COUNTRIES).map(([key, cfg]) =>
              toggle(key, euVisible, onToggleEu, cfg.color, cfg.markerUrl, `${cfg.flag} ${cfg.label}`, 0)
            )}
          </div>
        )}

        {sectionBtn('asia', `Asia`)}
        {openSection === 'asia' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
            {Object.entries(ASIA_SOURCES).map(([key, cfg]) =>
              toggle(key, asiaVisible, onToggleAsia, cfg.color, cfg.markerUrl, `${cfg.flag} ${cfg.label}`, 0)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
