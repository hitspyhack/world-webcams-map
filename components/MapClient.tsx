'use client';

import dynamic from 'next/dynamic';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { GlobeCam } from './GlobeView';
import { ASIA_SOURCES } from './AsiaWebcamsLayer';
import { EU_COUNTRIES } from './EUTrafficLayer';
import type {
  SkylineItem,
  EarthCamItem,
  OsmWebcam,
  DeckchairWebcam,
  WindyWebcam,
} from '../types/webcam';

const GlobeView = dynamic(() => import('./GlobeView'), {
  ssr: false,
  loading: () => <Splash text="Initialising globe…" />,
});
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <Splash text="Loading map…" />,
});

function Splash({ text }: { text: string }) {
  return (
    <div style={{
      height: '100vh', width: '100vw',
      display: 'grid', placeItems: 'center',
      background: '#04080f', color: 'rgba(0,220,100,0.8)',
      fontFamily: 'monospace', fontSize: 14, letterSpacing: '0.15em',
    }}>
      {text}
    </div>
  );
}

export type SourceKey = 'windy' | 'skyline' | 'earthcam' | 'osm' | 'deckchair';

// Source colours — shared between GlobeView dots and LeafletMap markers
export const SOURCE_COLORS: Record<SourceKey, string> = {
  windy:     '#60a5fa',
  skyline:   '#f87171',
  earthcam:  '#fb923c',
  osm:       '#4ade80',
  deckchair: '#c084fc',
};

// Colours for EU + Asia dots on the globe (match their layer configs)
const EU_GLOBE_COLOR   = '#818cf8'; // violet — EU traffic
const ASIA_GLOBE_COLOR = '#fbbf24'; // gold   — Asia cams

function toArray<T>(val: unknown): T[] { return Array.isArray(val) ? (val as T[]) : []; }

export interface FlyToTarget { lat: number; lon: number; zoom?: number; }

// Internal shapes returned by EU/Asia APIs
interface TrafficCam {
  id: string; title?: string; lat: number; lon: number;
  country?: string; sourceCountry?: string; city?: string;
}
interface AsiaCam {
  id: string; title: string; lat: number; lon: number;
  country?: string; city?: string; sourceCountry?: string;
}

// ─── Seed cams shown on globe before API data arrives ───────────────────────
const SEED_CAMS: GlobeCam[] = [
  { lat: 48.86,  lon: 2.35,    title: 'Paris — Eiffel Tower',    color: SOURCE_COLORS.earthcam,  source: 'earthcam'  },
  { lat: 51.50,  lon: -0.13,   title: 'London — Westminster',    color: SOURCE_COLORS.earthcam,  source: 'earthcam'  },
  { lat: 40.71,  lon: -74.01,  title: 'New York — Times Square', color: SOURCE_COLORS.earthcam,  source: 'earthcam'  },
  { lat: 35.68,  lon: 139.69,  title: 'Tokyo — Shibuya',         color: SOURCE_COLORS.earthcam,  source: 'earthcam'  },
  { lat:  1.35,  lon: 103.82,  title: 'Singapore — Marina Bay',  color: SOURCE_COLORS.skyline,   source: 'skyline'   },
  { lat: -33.87, lon: 151.21,  title: 'Sydney — Harbour Bridge', color: SOURCE_COLORS.earthcam,  source: 'earthcam'  },
  { lat: 55.75,  lon: 37.62,   title: 'Moscow — Red Square',     color: SOURCE_COLORS.osm,       source: 'osm'       },
  { lat: 25.20,  lon: 55.27,   title: 'Dubai — Downtown',        color: SOURCE_COLORS.deckchair, source: 'deckchair' },
  { lat: -23.55, lon: -46.63,  title: 'São Paulo',               color: SOURCE_COLORS.osm,       source: 'osm'       },
  { lat: 19.43,  lon: -99.13,  title: 'Mexico City',             color: SOURCE_COLORS.osm,       source: 'osm'       },
  { lat: 28.61,  lon: 77.21,   title: 'New Delhi',               color: SOURCE_COLORS.deckchair, source: 'deckchair' },
  { lat: -1.29,  lon: 36.82,   title: 'Nairobi',                 color: SOURCE_COLORS.deckchair, source: 'deckchair' },
  { lat: 37.57,  lon: 126.98,  title: 'Seoul — Gangnam',         color: SOURCE_COLORS.skyline,   source: 'skyline'   },
  { lat: 41.01,  lon: 28.98,   title: 'Istanbul',                color: SOURCE_COLORS.deckchair, source: 'deckchair' },
  { lat: 59.33,  lon: 18.07,   title: 'Stockholm',               color: SOURCE_COLORS.osm,       source: 'osm'       },
];

export default function MapClient() {
  const [mode, setMode] = useState<'globe' | 'map'>('globe');

  // ─── Shared source-visibility state ─────────────────────────────────────
  const [visible, setVisible] = useState<Record<SourceKey, boolean>>(
    { windy: true, skyline: true, earthcam: true, osm: true, deckchair: true }
  );
  const [euVisible, setEuVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(EU_COUNTRIES).map(k => [k, true]))
  );
  const [asiaVisible, setAsiaVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(ASIA_SOURCES).map(k => [k, true]))
  );

  // ─── Shared cam data (fetched once, used by both views) ─────────────────
  const [skylineCams,    setSkylineCams]    = useState<SkylineItem[]>([]);
  const [earthCams,      setEarthCams]      = useState<EarthCamItem[]>([]);
  const [osmCams,        setOsmCams]        = useState<OsmWebcam[]>([]);
  const [deckCams,       setDeckCams]       = useState<DeckchairWebcam[]>([]);
  const [euCams,         setEuCams]         = useState<TrafficCam[]>([]);
  const [asiaCams,       setAsiaCams]       = useState<AsiaCam[]>([]);
  // Windy: globe uses a one-shot world-bbox snapshot; the 2D map uses the
  // live viewport hook inside WindyLayer. These are independent.
  const [windyGlobeCams, setWindyGlobeCams] = useState<WindyWebcam[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [errors,         setErrors]         = useState<string[]>([]);

  // live windy count from the 2D map viewport layer (may differ from globe)
  const [windyMapCount, setWindyMapCount] = useState(0);
  const [asiaCount,     setAsiaCount]     = useState(0);
  const [euCount,       setEuCount]       = useState(0);

  // ─── Fly-to: clicking a globe dot then entering map flies there ──────────
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);

  const windyMapCountRef = useRef(windyMapCount);
  const handleWindyCount = useCallback((n: number) => {
    if (n !== windyMapCountRef.current) { windyMapCountRef.current = n; setWindyMapCount(n); }
  }, []);

  // ─── Fetch all cam data once on mount ───────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true); setErrors([]);
      const errs: string[] = [];
      const safe = async (label: string, fn: () => Promise<void>) => {
        try { await fn(); } catch (e: unknown) { errs.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); }
      };
      await Promise.all([
        safe('Skyline', async () => {
          const r = await fetch('/api/skyline-webcams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
          const j = await r.json();
          if (!r.ok) errs.push(`Skyline: ${j?.error ?? r.statusText}`); else setSkylineCams(toArray(j));
        }),
        safe('EarthCam', async () => {
          const r = await fetch('/api/earthcam');
          const j = await r.json();
          if (!r.ok) errs.push(`EarthCam: ${j?.error ?? r.statusText}`); else setEarthCams(toArray(j));
        }),
        safe('OSM', async () => {
          const r = await fetch('/api/overpass-webcams');
          const j = await r.json();
          if (!r.ok) errs.push(`OSM: ${j?.error ?? r.statusText}`); else setOsmCams(toArray(j));
        }),
        safe('Deckchair', async () => {
          const r = await fetch('/api/deckchair');
          const j = await r.json();
          if (!r.ok) errs.push(`Deckchair: ${j?.error ?? r.statusText}`); else setDeckCams(toArray(j));
        }),
        // EU traffic — same endpoint used by EUTrafficLayer
        safe('EU', async () => {
          const countries = Object.keys(EU_COUNTRIES).join(',');
          const r = await fetch(`/api/eu-traffic?countries=${countries}`);
          const j = await r.json();
          if (!r.ok) errs.push(`EU: ${j?.error ?? r.statusText}`);
          else {
            const arr = (toArray<TrafficCam>(j)).filter(
              c => c.lat && c.lon && isFinite(c.lat) && isFinite(c.lon)
            );
            setEuCams(arr);
          }
        }),
        // Asia tourism + Singapore — same endpoints used by AsiaWebcamsLayer
        safe('Asia', async () => {
          const [sg, tourism] = await Promise.all([
            fetch('/api/asia-traffic/singapore').then(r => r.json()).catch(() => []),
            fetch('/api/asia-tourism').then(r => r.json()).catch(() => []),
          ]);
          const sgArr   = toArray<AsiaCam>(Array.isArray(sg) ? sg : (sg?.cameras ?? []));
          const tourArr = toArray<AsiaCam>(tourism);
          const all = [...sgArr, ...tourArr].filter(
            c => c.lat && c.lon && isFinite(c.lat) && isFinite(c.lon) && c.title?.trim()
          );
          setAsiaCams(all);
        }),
        // Windy globe snapshot — world-bbox, best-effort, errors swallowed.
        // The live per-viewport data for the 2D map is handled separately by
        // WindyLayer → useWindyWebcams inside the MapContainer.
        safe('WindyGlobe', async () => {
          const bbox = encodeURIComponent('90,180,-90,-180');
          const r = await fetch(`/api/windy-webcams?bbox=${bbox}&limit=50`);
          const j = await r.json();
          if (j?.missingKey || !r.ok) return; // no key configured — globe dots stay empty
          const list: WindyWebcam[] = Array.isArray(j) ? j
            : Array.isArray(j?.webcams) ? j.webcams : [];
          setWindyGlobeCams(
            list.filter(c =>
              c.location?.latitude != null &&
              c.location?.longitude != null &&
              isFinite(c.location.latitude) &&
              isFinite(c.location.longitude)
            )
          );
        }),
      ]);
      setErrors(errs); setLoading(false);
    };
    fetchAll();
  }, []);

  // ─── Build GlobeCam array from real API data ─────────────────────────────
  const globeCams: GlobeCam[] = useMemo(() => {
    const cams: GlobeCam[] = [];

    // Windy — globe snapshot (separate from the live viewport hook)
    if (visible.windy)
      for (const c of windyGlobeCams) {
        const lat = c.location!.latitude, lon = c.location!.longitude;
        cams.push({ lat, lon, title: c.title ?? 'Windy', color: SOURCE_COLORS.windy, source: 'windy' });
      }

    // Skyline — SkylineItem has flat lat/lon fields (not location.lat/lng)
    if (visible.skyline)
      for (const c of skylineCams)
        if (c.lat && c.lon)
          cams.push({ lat: c.lat, lon: c.lon, title: c.title ?? 'Skyline', color: SOURCE_COLORS.skyline, source: 'skyline' });

    if (visible.earthcam)
      for (const c of earthCams)
        if (c.lat && c.lon)
          cams.push({ lat: c.lat, lon: c.lon, title: c.title ?? 'EarthCam', color: SOURCE_COLORS.earthcam, source: 'earthcam' });

    if (visible.osm)
      for (const c of osmCams)
        if (c.lat && c.lon)
          cams.push({ lat: c.lat, lon: c.lon, title: c.title ?? c.name ?? 'OSM', color: SOURCE_COLORS.osm, source: 'osm' });

    if (visible.deckchair)
      for (const c of deckCams)
        if (c.lat && c.lon)
          cams.push({ lat: c.lat, lon: c.lon, title: c.title ?? 'Deckchair', color: SOURCE_COLORS.deckchair, source: 'deckchair' });

    // EU traffic cams — use per-country visibility
    for (const c of euCams) {
      const key = (c.sourceCountry ?? c.country ?? 'EU') in EU_COUNTRIES
        ? (c.sourceCountry ?? c.country ?? 'EU') : 'EU';
      if (euVisible[key] === false) continue;
      cams.push({ lat: c.lat, lon: c.lon, title: c.title ?? 'EU Traffic', color: EU_GLOBE_COLOR, source: 'eu' });
    }

    // Asia cams — use per-country visibility
    for (const c of asiaCams) {
      const key = c.sourceCountry ?? c.country ?? 'SG';
      if (asiaVisible[key] === false) continue;
      cams.push({ lat: c.lat, lon: c.lon, title: c.title ?? 'Asia cam', color: ASIA_GLOBE_COLOR, source: 'asia' });
    }

    // Fall back to seed cams while data is loading so globe looks populated
    return cams.length > 0 ? cams : SEED_CAMS.filter(c => visible[c.source as SourceKey] !== false);
  }, [windyGlobeCams, skylineCams, earthCams, osmCams, deckCams, euCams, asiaCams, visible, euVisible, asiaVisible]);

  // When a globe dot is clicked: store fly-to target and switch to map.
  // Works for all sources (windy/skyline/earthcam/osm/deckchair/eu/asia)
  // because GlobeCam always carries lat/lon regardless of source.
  const handleGlobeCamClick = useCallback((cam: GlobeCam) => {
    setFlyTo({ lat: cam.lat, lon: cam.lon, zoom: 13 });
    setMode('map');
  }, []);

  const grandTotal = windyMapCount + skylineCams.length + earthCams.length + osmCams.length + deckCams.length + asiaCount + euCount;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* ── Globe view ── */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: mode === 'globe' ? 1 : 0,
        pointerEvents: mode === 'globe' ? 'auto' : 'none',
        transition: 'opacity 0.45s ease',
        zIndex: mode === 'globe' ? 2 : 1,
      }}>
        <GlobeView
          cams={globeCams}
          totalCount={grandTotal}
          loading={loading}
          errors={errors}
          visible={visible}
          euVisible={euVisible}
          asiaVisible={asiaVisible}
          onToggleSource={(k) => setVisible(v => ({ ...v, [k]: !v[k as SourceKey] }))}
          onToggleEu={(k)   => setEuVisible(v => ({ ...v, [k]: !v[k] }))}
          onToggleAsia={(k) => setAsiaVisible(v => ({ ...v, [k]: !v[k] }))}
          onEnterMap={() => setMode('map')}
          onCamClick={handleGlobeCamClick}
        />
      </div>

      {/* ── Leaflet map view ── */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: mode === 'map' ? 1 : 0,
        pointerEvents: mode === 'map' ? 'auto' : 'none',
        transition: 'opacity 0.45s ease',
        zIndex: mode === 'map' ? 2 : 1,
      }}>
        <LeafletMap
          skylineCams={skylineCams}
          earthCams={earthCams}
          osmCams={osmCams}
          deckCams={deckCams}
          euCams={euCams}
          asiaCams={asiaCams}
          visible={visible}
          euVisible={euVisible}
          asiaVisible={asiaVisible}
          loading={loading}
          errors={errors}
          onWindyCount={handleWindyCount}
          onAsiaCount={setAsiaCount}
          onEuCount={setEuCount}
          onToggleSource={(k) => setVisible(v => ({ ...v, [k]: !v[k as SourceKey] }))}
          onToggleEu={(k)   => setEuVisible(v => ({ ...v, [k]: !v[k] }))}
          onToggleAsia={(k) => setAsiaVisible(v => ({ ...v, [k]: !v[k] }))}
          flyTo={flyTo}
          onFlyToDone={() => setFlyTo(null)}
        />
      </div>

      {/* ── Mode toggle — always visible ── */}
      <button
        onClick={() => setMode(m => m === 'globe' ? 'map' : 'globe')}
        title={mode === 'globe' ? 'Switch to flat map' : 'Switch to globe'}
        style={{
          position: 'fixed', top: 14, left: 14, zIndex: 3000,
          padding: '7px 14px',
          background: 'rgba(4,14,10,0.88)',
          border: '1px solid rgba(0,200,90,0.45)',
          borderRadius: 7,
          color: 'rgba(0,220,100,0.95)',
          fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.1em',
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,40,25,0.95)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(4,14,10,0.88)')}
      >
        {mode === 'globe' ? '🗺 MAP' : '🌐 GLOBE'}
      </button>
    </div>
  );
}
