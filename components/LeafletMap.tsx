'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { createCameraIcon } from '../lib/mapIcons';
import { hasCoordinates } from '../lib/cameras';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import AsiaWebcamsLayer, { ASIA_SOURCES } from './AsiaWebcamsLayer';
import EUTrafficLayer,   { EU_COUNTRIES }  from './EUTrafficLayer';
import WindyLayer from './WindyLayer';
import CamLightbox from './CamLightbox';
import type { CamLightboxEntry } from './CamLightbox';
import type { CountryEntry } from './CountrySearch';
import type {
  SkylineItem,
  EarthCamItem,
  OsmWebcam,
  DeckchairWebcam,
} from '../types/webcam';
import type { SourceKey, FlyToTarget } from './MapClient';

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

const SOURCE_CONFIG: Record<SourceKey, { label: string; color: string }> = {
  windy:     { label: 'Windy',     color: '#60a5fa' },
  skyline:   { label: 'Community',   color: '#f87171' },
  earthcam:  { label: 'EarthCam',  color: '#fb923c' },
  osm:       { label: 'OSM',       color: '#4ade80' },
  deckchair: { label: 'Deckchair', color: '#c084fc' },
};

// ── FlyTo controller ─────────────────────────────────────────────────────────
function FlyToController({ target, onDone }: { target: FlyToTarget | null; onDone: () => void }) {
  const map = useMap();
  const prev = useRef<FlyToTarget | null>(null);
  useEffect(() => {
    if (!target || target === prev.current) return;
    prev.current = target;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.flyTo([target.lat, target.lon], target.zoom ?? 10, { duration: reduceMotion ? 0 : 1.2, animate: !reduceMotion });
    const id = setTimeout(onDone, reduceMotion ? 0 : 1400);
    return () => clearTimeout(id);
  }, [target, map, onDone]);
  return null;
}

// ── Legend ───────────────────────────────────────────────────────────────────
interface LegendProps {
  visible: Record<SourceKey, boolean>;
  euVisible: Record<string, boolean>;
  asiaVisible: Record<string, boolean>;
  onToggleSource: (k: SourceKey) => void;
  onToggleEu: (k: string) => void;
  onToggleAsia: (k: string) => void;
  counts: Partial<Record<string, number>>;
  loading: boolean;
  errors: string[];
  countryFilter?: CountryEntry | null;
  onClearFilter?: () => void;
}

function Legend({
  visible, euVisible, asiaVisible,
  onToggleSource, onToggleEu, onToggleAsia,
  counts, loading, errors, countryFilter, onClearFilter,
}: LegendProps) {
  // Start collapsed — user expands on demand
  const [open, setOpen] = useState(false);

  const totalCount = Object.entries(counts).reduce((sum, [key, count]) => {
    const enabled = key.startsWith('eu_') ? euVisible[key.slice(3)] !== false
      : key.startsWith('asia_') ? asiaVisible[key.slice(5)] !== false : visible[key as SourceKey];
    return sum + (enabled ? count ?? 0 : 0);
  }, 0);

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 1000,
      background: 'rgba(4,8,16,0.88)', color: '#e6edf3',
      borderRadius: 10, padding: open ? '12px 14px' : '8px 14px',
      maxHeight: 'calc(100dvh - 90px)', overflowY: 'auto',
      minWidth: 190, fontSize: 12, fontFamily: 'system-ui',
      border: '1px solid rgba(255,255,255,0.1)',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      userSelect: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', color: 'rgba(0,220,100,0.85)' }}>
          LISTED CAMS {loading ? '⟳' : `(${totalCount.toLocaleString()})`}
        </span>
        <button aria-label="Toggle source layers" aria-expanded={open} onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>
          {open ? '▴' : '▾'}
        </button>
      </div>

      {countryFilter && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#fbbf24', fontSize: 11 }}>🌍 {countryFilter.name}</span>
          <button onClick={onClearFilter}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
        </div>
      )}

      {open && (
        <>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(Object.entries(SOURCE_CONFIG) as [SourceKey, typeof SOURCE_CONFIG[SourceKey]][]).map(([key, cfg]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                <input type="checkbox" checked={visible[key]} onChange={() => onToggleSource(key)}
                  style={{ accentColor: cfg.color }} />
                <span style={{ color: cfg.color, minWidth: 8, display: 'inline-block' }}>●</span>
                <span style={{ flex: 1 }}>{cfg.label}</span>
                <span style={{ color: '#8b949e' }}>{(counts[key] ?? 0).toLocaleString()}</span>
              </label>
            ))}
          </div>

          {Object.keys(EU_COUNTRIES).length > 0 && (
            <>
              <div style={{ marginTop: 8, marginBottom: 4, color: '#8b949e', fontSize: 10, letterSpacing: '0.05em' }}>EU TRAFFIC</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {(Object.entries(EU_COUNTRIES) as [string, string][]).map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                    <input type="checkbox" checked={euVisible[k] !== false} onChange={() => onToggleEu(k)}
                      style={{ accentColor: '#818cf8' }} />
                    <span style={{ color: '#818cf8', minWidth: 8 }}>●</span>
                    <span style={{ flex: 1, fontSize: 11 }}>{label}</span>
                    <span style={{ color: '#8b949e' }}>{(counts[`eu_${k}`] ?? 0).toLocaleString()}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {Object.keys(ASIA_SOURCES).length > 0 && (
            <>
              <div style={{ marginTop: 8, marginBottom: 4, color: '#8b949e', fontSize: 10, letterSpacing: '0.05em' }}>ASIA</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {(Object.entries(ASIA_SOURCES) as [string, string][]).map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                    <input type="checkbox" checked={asiaVisible[k] !== false} onChange={() => onToggleAsia(k)}
                      style={{ accentColor: '#fbbf24' }} />
                    <span style={{ color: '#fbbf24', minWidth: 8 }}>●</span>
                    <span style={{ flex: 1, fontSize: 11 }}>{label}</span>
                    <span style={{ color: '#8b949e' }}>{(counts[`asia_${k}`] ?? 0).toLocaleString()}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {errors.length > 0 && (
            <div style={{ marginTop: 8, color: '#f87171', fontSize: 10 }}>
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface LeafletMapProps {
  skylineCams:  SkylineItem[];
  earthCams:    EarthCamItem[];
  osmCams:      OsmWebcam[];
  deckCams:     DeckchairWebcam[];
  euCams:       TrafficCam[];
  asiaCams:     AsiaCam[];
  visible:      Record<SourceKey, boolean>;
  euVisible:    Record<string, boolean>;
  asiaVisible:  Record<string, boolean>;
  loading:      boolean;
  errors:       string[];
  onWindyCount: (n: number) => void;
  onAsiaCount:  (n: number) => void;
  onEuCount:    (n: number) => void;
  onToggleSource: (k: SourceKey) => void;
  onToggleEu:   (k: string) => void;
  onToggleAsia: (k: string) => void;
  flyTo:        FlyToTarget | null;
  onFlyToDone:  () => void;
  countryFilter?: CountryEntry | null;
  onClearFilter?: () => void;
  /** Override viewport bbox when a country filter is active. */
  windyForceBbox?: string | null;
}

// ── Inner map (must be child of MapContainer) ─────────────────────────────────
function MapInner({
  skylineCams, earthCams, osmCams, deckCams, euCams, asiaCams,
  visible, euVisible, asiaVisible,
  loading, errors,
  onWindyCount, onAsiaCount, onEuCount,
  onToggleSource, onToggleEu, onToggleAsia,
  flyTo, onFlyToDone,
  countryFilter, onClearFilter,
  windyForceBbox,
}: LeafletMapProps) {
  const [lightbox, setLightbox] = useState<CamLightboxEntry | null>(null);

  // Per-source marker icons (memoised)
  const icons = useMemo(() => {
    const result = {} as Record<SourceKey, L.Icon>;
    for (const [key, cfg] of Object.entries(SOURCE_CONFIG) as [SourceKey, typeof SOURCE_CONFIG[SourceKey]][]) {
      result[key] = createCameraIcon(cfg.color);
    }
    return result;
  }, []);

  // Live windy count (state — must be state, not just a ref, so the legend rerenders)
  const [windyCount, setWindyCountLocal] = useState(0);
  const windyCountRef = useRef(0);
  const handleWindyCount = useCallback((n: number) => {
    if (n !== windyCountRef.current) {
      windyCountRef.current = n;
      setWindyCountLocal(n);
      onWindyCount(n);
    }
  }, [onWindyCount]);

  // Legend source counts
  const [euCount,   setEuCountLocal]   = useState(0);
  const [asiaCount, setAsiaCountLocal] = useState(0);
  useEffect(() => { onEuCount(euCount);   }, [euCount,   onEuCount]);
  useEffect(() => { onAsiaCount(asiaCount); }, [asiaCount, onAsiaCount]);

  const counts = useMemo<Partial<Record<string, number>>>(() => ({
    windy:     windyCount,  // use state — not the stale ref
    skyline:   skylineCams.length,
    earthcam:  earthCams.length,
    osm:       osmCams.length,
    deckchair: deckCams.length,
    ...Object.fromEntries(euCams.map<[string, number]>(c => [`eu_${c.sourceCountry ?? c.country ?? 'EU'}`, 1]).reduce(
      (acc: Map<string, number>, [k, v]: [string, number]) => { acc.set(k, (acc.get(k) ?? 0) + v); return acc; },
      new Map<string, number>()
    )),
    ...Object.fromEntries(asiaCams.map<[string, number]>(c => [`asia_${c.sourceCountry ?? c.country ?? 'SG'}`, 1]).reduce(
      (acc: Map<string, number>, [k, v]: [string, number]) => { acc.set(k, (acc.get(k) ?? 0) + v); return acc; },
      new Map<string, number>()
    )),
  }), [windyCount, skylineCams, earthCams, osmCams, deckCams, euCams, asiaCams]);

  return (
    <>
      <FlyToController target={flyTo} onDone={onFlyToDone} />

      <Legend
        visible={visible} euVisible={euVisible} asiaVisible={asiaVisible}
        onToggleSource={onToggleSource} onToggleEu={onToggleEu} onToggleAsia={onToggleAsia}
        counts={counts} loading={loading} errors={errors}
        countryFilter={countryFilter} onClearFilter={onClearFilter}
      />

      {/* ── Windy cameras — live viewport fetch via sub-component ─────────── */}
      <WindyLayer
        enabled={visible.windy}
        onCountChange={handleWindyCount}
        onExpand={setLightbox}
        countryFilter={countryFilter ?? undefined}
        forceBbox={windyForceBbox}
      />

      {/* ── Skyline ────────────────────────────────────────────────────────── */}
      {visible.skyline && skylineCams.map(cam => {
        if (!hasCoordinates(cam)) return null;
        return (
          <Marker key={`sky-${cam.id}`} position={[cam.lat, cam.lon]} icon={icons.skyline}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui' }}>
                <strong style={{ fontSize: 13 }}>{cam.title}</strong>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{[cam.city, cam.country].filter(Boolean).join(', ')}</div>
                {cam.snapshotUrl && (
                  <div style={{ marginTop: 7, cursor: 'pointer' }}
                    onClick={() => setLightbox({ source: 'skyline', title: cam.title, imageUrl: cam.snapshotUrl, linkUrl: cam.url, linkLabel: 'Open webcam source' })}>
                    <img src={cam.snapshotUrl} alt={cam.title}
                      style={{ maxWidth: 248, width: '100%', borderRadius: 6, display: 'block', background: '#0d1117' }}
                      loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                {cam.url && <div style={{ marginTop: 5 }}><a href={cam.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open webcam source ↗</a></div>}
                <div style={{ marginTop: 4, fontSize: 10, color: '#f87171', fontWeight: 700, letterSpacing: '0.04em' }}>SOURCE: COMMUNITY</div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* ── EarthCam ───────────────────────────────────────────────────────── */}
      {visible.earthcam && earthCams.map(cam => {
        if (!hasCoordinates(cam)) return null;
        return (
          <Marker key={`earth-${cam.id}`} position={[cam.lat, cam.lon]} icon={icons.earthcam}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui' }}>
                <strong style={{ fontSize: 13 }}>{cam.title}</strong>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{[cam.city, cam.country].filter(Boolean).join(', ')}</div>
                {cam.imageUrl && (
                  <div style={{ marginTop: 7, cursor: 'pointer' }}
                    onClick={() => setLightbox({ source: 'earthcam', title: cam.title, embedUrl: cam.embedUrl, imageUrl: cam.imageUrl, linkUrl: cam.embedUrl, linkLabel: 'EarthCam' })}>
                    <img src={cam.imageUrl} alt={cam.title}
                      style={{ maxWidth: 248, width: '100%', borderRadius: 6, display: 'block', background: '#0d1117' }}
                      loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                <div style={{ marginTop: 4, fontSize: 10, color: '#fb923c', fontWeight: 700, letterSpacing: '0.04em' }}>SOURCE: EARTHCAM</div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* ── OSM ────────────────────────────────────────────────────────────── */}
      {visible.osm && osmCams.map(cam => {
        if (!hasCoordinates(cam)) return null;
        return (
          <Marker key={`osm-${cam.id}`} position={[cam.lat, cam.lon]} icon={icons.osm}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui' }}>
                <strong style={{ fontSize: 13 }}>{cam.title ?? cam.id}</strong>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{[cam.city, cam.country].filter(Boolean).join(', ')}</div>
                {cam.webcamUrl && (
                  <div style={{ marginTop: 5 }}>
                    <a href={cam.webcamUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open stream ↗</a>
                  </div>
                )}
                <div style={{ marginTop: 4, fontSize: 10, color: '#4ade80', fontWeight: 700, letterSpacing: '0.04em' }}>SOURCE: OSM</div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* ── Deckchair ──────────────────────────────────────────────────────── */}
      {visible.deckchair && deckCams.map(cam => {
        if (!hasCoordinates(cam)) return null;
        return (
          <Marker key={`deck-${cam.id}`} position={[cam.lat, cam.lon]} icon={icons.deckchair}>
            <Popup maxWidth={270}>
              <div style={{ fontFamily: 'system-ui' }}>
                <strong style={{ fontSize: 13 }}>{cam.title}</strong>
                {cam.thumbnailUrl && (
                  <div style={{ marginTop: 7, cursor: 'pointer' }}
                    onClick={() => setLightbox({ source: 'deckchair', title: cam.title, embedUrl: cam.embedUrl, imageUrl: cam.thumbnailUrl, linkLabel: 'Deckchair' })}>
                    <img src={cam.thumbnailUrl} alt={cam.title}
                      style={{ maxWidth: 248, width: '100%', borderRadius: 6, display: 'block', background: '#0d1117' }}
                      loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                <div style={{ marginTop: 4, fontSize: 10, color: '#c084fc', fontWeight: 700, letterSpacing: '0.04em' }}>SOURCE: DECKCHAIR</div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* ── EU Traffic ─────────────────────────────────────────────────────── */}
      <EUTrafficLayer
        cams={euCams}
        visible={euVisible}
        onCountChange={setEuCountLocal}
        onExpand={setLightbox}
      />

      {/* ── Asia ───────────────────────────────────────────────────────────── */}
      <AsiaWebcamsLayer
        cams={asiaCams}
        visible={asiaVisible}
        onCountChange={setAsiaCountLocal}
        onExpand={setLightbox}
      />

      {/* ── Lightbox ───────────────────────────────────────────────────────── */}
      {lightbox && <CamLightbox entry={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

// ── Public export (wraps MapContainer) ───────────────────────────────────────
export default function LeafletMap(props: LeafletMapProps) {
  const [baseLayer, setBaseLayer] = useState<'satellite' | 'dark'>('satellite');

  return (
    <MapContainer
      center={[20, 0]}
      zoom={3}
      minZoom={2}
      maxZoom={18}
      style={{ height: '100vh', width: '100vw', background: '#04080f' }}
      worldCopyJump
    >
      <TileLayer
        key={baseLayer}
        url={baseLayer === 'satellite'
          ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'}
        {...(baseLayer === 'dark' ? { subdomains: 'abcd' } : {})}
        attribution={baseLayer === 'satellite'
          ? 'Tiles &copy; Esri - Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
          : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'}
        maxZoom={18}
      />
      <div role="group" aria-label="Map imagery" style={{
        position: 'absolute', right: 14, bottom: 30, zIndex: 1000,
        display: 'flex', padding: 3, gap: 3, borderRadius: 7,
        background: 'rgba(13,17,23,0.94)', border: '1px solid #52616c',
        boxShadow: '0 2px 12px #0008',
      }}>
        {(['satellite', 'dark'] as const).map(layer => (
          <button key={layer} type="button" aria-pressed={baseLayer === layer}
            onClick={() => setBaseLayer(layer)}
            style={{
              border: 0, borderRadius: 4, padding: '7px 10px', cursor: 'pointer',
              background: baseLayer === layer ? '#315449' : 'transparent',
              color: baseLayer === layer ? '#d8fff0' : '#d0d9df',
              font: '600 11px system-ui, sans-serif',
            }}
          >{layer === 'satellite' ? 'Satellite' : 'Dark'}</button>
        ))}
      </div>
      <MapInner {...props} />
    </MapContainer>
  );
}
