'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import AsiaWebcamsLayer, { ASIA_SOURCES } from './AsiaWebcamsLayer';
import EUTrafficLayer,   { EU_COUNTRIES }  from './EUTrafficLayer';
import WindyLayer from './WindyLayer';
import type {
  SkylineItem,
  EarthCamItem,
  OsmWebcam,
  DeckchairWebcam,
} from '../types/webcam';

function toArray<T>(val: unknown): T[] { return Array.isArray(val) ? (val as T[]) : []; }

type SourceKey = 'windy' | 'skyline' | 'earthcam' | 'osm' | 'deckchair';

const SOURCE_CONFIG: Record<SourceKey, { label: string; color: string; markerUrl: string }> = {
  windy:     { label: 'Windy',     color: '#3b82f6', markerUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png' },
  skyline:   { label: 'Skyline',   color: '#ef4444', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' },
  earthcam:  { label: 'EarthCam',  color: '#f97316', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png' },
  osm:       { label: 'OSM',       color: '#22c55e', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' },
  deckchair: { label: 'Deckchair', color: '#a855f7', markerUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png' },
};
const SHADOW_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
function makeIcon(url: string) {
  return new L.Icon({ iconUrl: url, iconRetinaUrl: url.replace('.png', '-2x.png'), shadowUrl: SHADOW_URL, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
}

// ---- Component ----
export default function LeafletMap() {
  // ── Windy count driven by <WindyLayer> via callback ──
  const [windyCount,  setWindyCount]  = useState(0);
  const windyCountRef = useRef(windyCount);
  const handleWindyCount = useCallback((n: number) => {
    if (n !== windyCountRef.current) { windyCountRef.current = n; setWindyCount(n); }
  }, []);

  const [skylineCams, setSkylineCams] = useState<SkylineItem[]>([]);
  const [earthCams,   setEarthCams]   = useState<EarthCamItem[]>([]);
  const [osmCams,     setOsmCams]     = useState<OsmWebcam[]>([]);
  const [deckCams,    setDeckCams]    = useState<DeckchairWebcam[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [errors,      setErrors]      = useState<string[]>([]);
  const [asiaCount,   setAsiaCount]   = useState(0);
  const [euCount,     setEuCount]     = useState(0);
  const [openSection, setOpenSection] = useState<'global'|'eu'|'asia'>('global');

  const [visible, setVisible] = useState<Record<SourceKey, boolean>>(
    { windy: true, skyline: true, earthcam: true, osm: true, deckchair: true }
  );
  const [euVisible,   setEuVisible]   = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(EU_COUNTRIES).map(k  => [k,  true]))
  );
  const [asiaVisible, setAsiaVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(ASIA_SOURCES).map(k => [k, true]))
  );

  const icons = useMemo(() => {
    const r = {} as Record<SourceKey, L.Icon>;
    for (const [k, cfg] of Object.entries(SOURCE_CONFIG)) r[k as SourceKey] = makeIcon(cfg.markerUrl);
    return r;
  }, []);

  // ── Fetch all non-Windy sources once on mount ──
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true); setErrors([]);
      const errs: string[] = [];
      const safe = async (label: string, fn: () => Promise<void>) => {
        try { await fn(); } catch (e: unknown) { errs.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); }
      };
      await Promise.all([
        // Skyline: no location arg → route uses DEFAULT_LOCATIONS fan-out
        safe('Skyline', async () => {
          const r = await fetch('/api/skyline-webcams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),       // ← empty body triggers multi-location default
          });
          const j = await r.json();
          if (!r.ok) errs.push(`Skyline: ${j?.error ?? r.statusText}`);
          else setSkylineCams(toArray(j));
        }),
        safe('EarthCam', async () => {
          const r = await fetch('/api/earthcam');
          const j = await r.json();
          if (!r.ok) errs.push(`EarthCam: ${j?.error ?? r.statusText}`);
          else setEarthCams(toArray(j));
        }),
        safe('OSM', async () => {
          const r = await fetch('/api/overpass-webcams');
          const j = await r.json();
          if (!r.ok) errs.push(`OSM: ${j?.error ?? r.statusText}`);
          else setOsmCams(toArray(j));
        }),
        safe('Deckchair', async () => {
          const r = await fetch('/api/deckchair');
          const j = await r.json();
          if (!r.ok) errs.push(`Deckchair: ${j?.error ?? r.statusText}`);
          else setDeckCams(toArray(j));
        }),
      ]);
      setErrors(errs); setLoading(false);
    };
    fetchAll();
  }, []);

  const globalTotal = windyCount + skylineCams.length + earthCams.length + osmCams.length + deckCams.length;
  const grandTotal  = globalTotal + asiaCount + euCount;

  const sectionBtn = (key: 'global'|'eu'|'asia', label: string) => (
    <button
      onClick={() => setOpenSection(s => s === key ? 'global' : key)}
      style={{ background: openSection === key ? 'rgba(255,255,255,0.12)' : 'transparent', border: 'none', color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', padding: '3px 6px', borderRadius: 5, cursor: 'pointer', textAlign: 'left', width: '100%' }}
    >{openSection === key ? '▾' : '▸'} {label}</button>
  );

  const toggle = (key: string, state: Record<string, boolean>, setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>, color: string, markerUrl: string, label: string, count: number) => (
    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', opacity: state[key] ? 1 : 0.4, transition: 'opacity 0.2s', paddingLeft: 8 }}>
      <input type="checkbox" checked={!!state[key]} onChange={() => setter(s => ({ ...s, [key]: !s[key] }))} style={{ accentColor: color, width: 13, height: 13 }} />
      <img src={markerUrl} alt={label} style={{ width: 9, height: 15 }} />
      <span style={{ color, fontWeight: 600, fontSize: 11 }}>{label}</span>
      <span style={{ color: '#aaa', marginLeft: 'auto', fontSize: 11 }}>({count})</span>
    </label>
  );

  return (
    <main style={{ height: '100vh', width: '100vw', position: 'relative', fontFamily: 'system-ui, sans-serif' }}>
      <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* ── Windy — viewport-aware, re-fetches on pan/zoom ── */}
        <WindyLayer
          enabled={visible.windy}
          onCountChange={handleWindyCount}
          debounceMs={600}
          limit={50}
        />

        {/* ── Skyline ──
             Fields now read from the normalised flat shape the route returns:
             cam.lat / cam.lon (not cam.gps.lat/lon)
             cam.url           (not cam.gps, which never existed)
        */}
        {visible.skyline && skylineCams.map(cam => {
          if (!cam.lat || !cam.lon) return null;
          return (
            <Marker key={`skyline-${cam.id}`} position={[cam.lat, cam.lon]} icon={icons.skyline}>
              <Popup maxWidth={260}>
                <strong>{cam.title}</strong><br />
                <span style={{ fontSize: 11, color: '#666' }}>
                  {[cam.city, cam.country].filter(Boolean).join(', ')}
                </span>
                {cam.tags?.length > 0 && (
                  <span style={{ fontSize: 10, color: '#888', marginLeft: 5 }}>
                    {cam.tags.map(t => `#${t}`).join(' ')}
                  </span>
                )}
                {cam.weather?.temp && (
                  <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                    {cam.weather.temp} • {cam.weather.condition}
                  </div>
                )}
                {cam.snapshotUrl && (
                  <div style={{ marginTop: 6 }}>
                    <img
                      src={cam.snapshotUrl}
                      alt={cam.title}
                      style={{ maxWidth: 240, borderRadius: 5 }}
                      loading="lazy"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                {cam.url && (
                  <div style={{ marginTop: 4 }}>
                    <a href={cam.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>
                      Open on Skyline ↗
                    </a>
                  </div>
                )}
                <div style={{ marginTop: 4, fontSize: 10, color: '#ef4444', fontWeight: 600 }}>
                  SOURCE: SKYLINE
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* ── EarthCam ── */}
        {visible.earthcam && earthCams.map(cam => (
          <Marker key={cam.id} position={[cam.lat, cam.lon]} icon={icons.earthcam}>
            <Popup maxWidth={260}>
              <strong>{cam.title}</strong><br />
              <span style={{ fontSize: 11, color: '#666' }}>{[cam.city, cam.country].filter(Boolean).join(', ')}</span>
              <div style={{ marginTop: 6 }}><img src={cam.imageUrl} alt={cam.title} style={{ maxWidth: 240, borderRadius: 5 }} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
              <div style={{ marginTop: 4 }}><a href={cam.embedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open on EarthCam ↗</a></div>
              <div style={{ marginTop: 4, fontSize: 10, color: '#f97316', fontWeight: 600 }}>SOURCE: EARTHCAM</div>
            </Popup>
          </Marker>
        ))}

        {/* ── OSM / Overpass ── */}
        {visible.osm && osmCams.map(cam => (
          <Marker key={cam.id} position={[cam.lat, cam.lon]} icon={icons.osm}>
            <Popup maxWidth={260}>
              <strong>{cam.title}</strong><br />
              {(cam.city || cam.country) && <span style={{ fontSize: 11, color: '#666' }}>{[cam.city, cam.country].filter(Boolean).join(', ')}<br /></span>}
              {cam.operator && <span style={{ fontSize: 11, color: '#666' }}>Operator: {cam.operator}<br /></span>}
              <div style={{ marginTop: 4 }}><a href={cam.webcamUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open stream ↗</a></div>
              <div style={{ marginTop: 4, fontSize: 10, color: '#22c55e', fontWeight: 600 }}>SOURCE: OPENSTREETMAP</div>
            </Popup>
          </Marker>
        ))}

        {/* ── Deckchair ── */}
        {visible.deckchair && deckCams.map(cam => (
          <Marker key={cam.id} position={[cam.lat, cam.lon]} icon={icons.deckchair}>
            <Popup maxWidth={260}>
              <strong>{cam.title}</strong>
              {cam.thumbnailUrl && <div style={{ marginTop: 6 }}><img src={cam.thumbnailUrl} alt={cam.title} style={{ maxWidth: 240, borderRadius: 5 }} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>}
              {cam.embedUrl && <div style={{ marginTop: 4 }}><a href={cam.embedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open on Deckchair ↗</a></div>}
              <div style={{ marginTop: 4, fontSize: 10, color: '#a855f7', fontWeight: 600 }}>SOURCE: DECKCHAIR</div>
            </Popup>
          </Marker>
        ))}

        {/* ── EU Traffic Layer ── */}
        <EUTrafficLayer visible={euVisible} onLoad={setEuCount} />

        {/* ── Asia Layer ── */}
        <AsiaWebcamsLayer visible={asiaVisible} onLoad={setAsiaCount} />
      </MapContainer>

      {/* ── Legend panel ── */}
      <div style={{ position: 'absolute', bottom: 24, right: 12, zIndex: 1000, background: 'rgba(11,18,32,0.94)', color: '#fff', borderRadius: 12, padding: '12px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6, backdropFilter: 'blur(10px)', minWidth: 200, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>🌍 World Webcams</div>
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>{grandTotal.toLocaleString()} cameras loaded</div>

        {sectionBtn('global', `GLOBAL SOURCES (${globalTotal})`)}
        {openSection === 'global' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 4 }}>
            {(Object.entries(SOURCE_CONFIG) as [SourceKey, typeof SOURCE_CONFIG[SourceKey]][]).map(([key, cfg]) => {
              const count = key === 'windy' ? windyCount : key === 'skyline' ? skylineCams.length : key === 'earthcam' ? earthCams.length : key === 'osm' ? osmCams.length : deckCams.length;
              return toggle(key, visible as Record<string,boolean>, setVisible as React.Dispatch<React.SetStateAction<Record<string,boolean>>>, cfg.color, cfg.markerUrl, cfg.label, count);
            })}
          </div>
        )}

        {sectionBtn('eu', `EU TRAFFIC (${euCount})`)}
        {openSection === 'eu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 4 }}>
            {Object.entries(EU_COUNTRIES).map(([key, cfg]) =>
              toggle(key, euVisible, setEuVisible, cfg.color, cfg.markerUrl, `${cfg.flag} ${cfg.label}`, 0)
            )}
          </div>
        )}

        {sectionBtn('asia', `ASIA (${asiaCount})`)}
        {openSection === 'asia' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 4 }}>
            {Object.entries(ASIA_SOURCES).map(([key, cfg]) =>
              toggle(key, asiaVisible, setAsiaVisible, cfg.color, cfg.markerUrl, `${cfg.flag} ${cfg.label}`, 0)
            )}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000, padding: '8px 14px', background: 'rgba(11,18,32,0.88)', color: '#fff', borderRadius: 8, fontSize: 13, backdropFilter: 'blur(6px)' }}>
          Loading webcam sources…
        </div>
      )}

      {errors.map((msg, i) => (
        <div key={i} style={{ position: 'absolute', top: 12 + i * 44, left: 12, zIndex: 1000, padding: '8px 14px', background: 'rgba(161,44,68,0.9)', color: '#fff', borderRadius: 8, fontSize: 12, maxWidth: 360 }}>
          ⚠ {msg}
        </div>
      ))}
    </main>
  );
}
