'use client';

import { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import { ASIA_SOURCES, EU_COUNTRIES } from '../lib/sources';
import { geoOrthographic, geoPath, geoGraticule } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import { isOnVisibleHemisphere } from '../lib/globe';
import CamLightbox from './CamLightbox';
import type { CamLightboxEntry } from './CamLightbox';
import CountrySearch from './CountrySearch';
import type { CountryEntry } from './CountrySearch';
import type { SourceKey } from './MapClient';

export interface GlobeCam {
  lat: number;
  lon: number;
  title: string;
  color: string;
  source?: string;
  city?: string;
  country?: string;
  categories?: string[];
  embedUrl?: string;
  imageUrl?: string;
  linkUrl?:  string;
  captureAt?: string;
  checkedAt?: number;
  collection?: string;
  id?: string;
  continent?: string;
  mediaKind?: 'live' | 'timelapse' | 'snapshot' | 'player' | 'provider' | 'directory';
  videoUrl?: string;
  positionPrecision?: 'regional' | 'approximate' | 'provider';
  description?: string;
}

/** Methods exposed to the parent via ref */
export interface GlobeViewHandle {
  rotateTo: (lon: number, lat: number) => void;
}

interface Props {
  cams: GlobeCam[];
  active?: boolean;
  totalCount?: number;
  loading?: boolean;
  errors?: string[];
  visible: Record<string, boolean>;
  euVisible: Record<string, boolean>;
  asiaVisible: Record<string, boolean>;
  onToggleSource: (key: SourceKey) => void;
  onToggleEu:   (key: string) => void;
  onToggleAsia: (key: string) => void;
  onEnterMap: () => void;
  onCamClick?: (cam: GlobeCam) => void;
  countryFilter?: CountryEntry | null;
  onClearFilter?: () => void;
  countries?: CountryEntry[];
  onSearchSelect?: (c: CountryEntry | null) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SPIN_SPEED   = 0.12;
const TILT         = -15;
const DOT_RADIUS   = 3;
const HOVER_RADIUS = 6;
const FPS_CAP      = 40;
const FRAME_MS     = 1000 / FPS_CAP;
const MIN_GLOBE_ZOOM = 0.65;
const MAX_GLOBE_ZOOM = 3.5;

const COUNTRIES = feature(world as unknown as Topology, world.objects.countries as GeometryCollection);

const SOURCE_LABELS: Record<SourceKey, string> = {
  global: 'Global operators', windy: 'Windy', skyline: 'Community', earthcam: 'EarthCam', osm: 'OSM', deckchair: 'Deckchair',
};

const SOURCE_BADGE_COLORS: Record<string, string> = {
  global: '#2dd4bf', windy: '#60a5fa', skyline: '#f87171', earthcam: '#fb923c',
  osm: '#4ade80', deckchair: '#c084fc', eu: '#818cf8', asia: '#fbbf24',
};

// Flag emoji — private to GlobeView; layer files only export { code: label } strings
const EU_FLAGS: Record<string, string> = {
  FI: '🇫🇮', EE: '🇪🇪', GB: '🇬🇧', SE: '🇸🇪', NO: '🇳🇴',
  PT: '🇵🇹', DE: '🇩🇪', FR: '🇫🇷', ES: '🇪🇸', NL: '🇳🇱',
  AT: '🇦🇹', CH: '🇨🇭', IT: '🇮🇹', DK: '🇩🇰', BE: '🇧🇪',
  PL: '🇵🇱', EU: '🇪🇺',
};

const ASIA_FLAGS: Record<string, string> = {
  SG: '🇸🇬', JP: '🇯🇵', KR: '🇰🇷', HK: '🇭🇰', TH: '🇹🇭',
  AE: '🇦🇪', TW: '🇹🇼', MY: '🇲🇾', ID: '🇮🇩', VN: '🇻🇳',
  PH: '🇵🇭', IN: '🇮🇳', CN: '🇨🇳',
};

function dotRadius(source: string | undefined, hovered: boolean): number {
  if (hovered) return HOVER_RADIUS;
  if (source === 'eu' || source === 'asia') return 2.2;
  if (source === 'windy') return 3.5;
  return DOT_RADIUS;
}

// ---------------------------------------------------------------------------
// Cam drawer
// ---------------------------------------------------------------------------
function CamDrawer({
  cam, onClose, onExpand, onViewInMap,
}: {
  cam: GlobeCam | null;
  onClose: () => void;
  onExpand: (entry: CamLightboxEntry) => void;
  onViewInMap: (cam: GlobeCam) => void;
}) {
  if (!cam) return null;
  const badgeColor = SOURCE_BADGE_COLORS[cam.source ?? ''] ?? '#8b949e';
  const hasEmbed   = !!cam.embedUrl;
  const hasImage   = !!cam.imageUrl;

  return (
    <div style={{
      position: 'absolute', bottom: 110, left: 12, zIndex: 20, width: 280,
      background: 'rgba(4,14,10,0.97)', border: '1px solid rgba(0,200,90,0.35)',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 11, color: '#a0ffcc',
      backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      overflow: 'hidden', animation: 'drawerSlideUp 0.22s cubic-bezier(0.16,1,0.3,1)',
    }}>
      <style>{`
        @keyframes drawerSlideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '9px 10px 6px', borderBottom: '1px solid rgba(0,200,90,0.15)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cam.title}</div>
          {cam.source && (
            <div style={{ marginTop: 3, fontSize: 9, letterSpacing: '0.08em', color: badgeColor, fontWeight: 700 }}>
              SOURCE: {cam.source.toUpperCase()}
            </div>
          )}
        </div>
        <button onClick={onClose} aria-label="Close cam panel"
          style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: '0 0 0 8px', flexShrink: 0, transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
          onMouseLeave={e => (e.currentTarget.style.color = '#8b949e')}
        >✕</button>
      </div>
      {hasEmbed ? (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#04080f' }}>
          <iframe src={cam.embedUrl} title={cam.title} allowFullScreen
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
        </div>
      ) : hasImage ? (
        <div style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
          <img src={cam.imageUrl} alt={cam.title}
            style={{ width: '100%', display: 'block', background: '#04080f', maxHeight: 160, objectFit: 'cover' }}
            loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      ) : (
        <div style={{ padding: '18px 0', textAlign: 'center', fontSize: 10, color: 'rgba(0,200,90,0.35)', letterSpacing: '0.06em' }}>
          NO PREVIEW AVAILABLE
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px' }}>
        {(hasEmbed || hasImage || cam.linkUrl) && (
          <button
            onClick={() => onExpand({ ...cam, source: cam.source ?? 'webcam' })}
            style={{ flex: 1, padding: '5px 0', background: 'rgba(0,200,90,0.10)', border: '1px solid rgba(0,200,90,0.3)', borderRadius: 6, color: '#6effb4', fontSize: 10, cursor: 'pointer', letterSpacing: '0.05em', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,200,90,0.20)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,200,90,0.10)')}
          >⛶ EXPAND</button>
        )}
        <button onClick={() => onViewInMap(cam)}
          style={{ flex: 1, padding: '5px 0', background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.25)', borderRadius: 6, color: '#79c0ff', fontSize: 10, cursor: 'pointer', letterSpacing: '0.05em', transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(88,166,255,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(88,166,255,0.08)')}
        >🗺 VIEW IN MAP</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component — wrapped in forwardRef to expose rotateTo to the parent
// ---------------------------------------------------------------------------
const GlobeView = forwardRef<GlobeViewHandle, Props>(function GlobeView({
  cams, active = true, totalCount, loading, errors = [],
  visible, euVisible, asiaVisible,
  onToggleSource, onToggleEu, onToggleAsia,
  onEnterMap, onCamClick,
  countryFilter, onClearFilter,
  countries = [],
  onSearchSelect,
}, ref) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const rotRef       = useRef<[number, number, number]>([0, TILT, 0]);
  const dragRef      = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const pauseRef     = useRef(false);
  const gestureMovedRef = useRef(false);
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastFrameRef = useRef(0);
  const projRef      = useRef<((c: [number, number]) => [number, number] | null) | null>(null);
  const hoveredRef   = useRef<GlobeCam | null>(null);
  const tooltipRef   = useRef<HTMLDivElement | null>(null);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const zoomRef = useRef(1);

  const [spinning, setSpinning] = useState(true);
  const [zoom, setZoom] = useState(1);

  const changeZoom = useCallback((factor: number) => {
    setZoom(current => {
      const next = Math.max(MIN_GLOBE_ZOOM, Math.min(MAX_GLOBE_ZOOM, current * factor));
      zoomRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) setSpinning(false);
    const changed = () => { if (preference.matches) setSpinning(false); };
    preference.addEventListener('change', changed);
    return () => preference.removeEventListener('change', changed);
  }, []);

  const [legendOpen,    setLegendOpen]    = useState(false);
  const [legendSection, setLegendSection] = useState<'global' | 'eu' | 'asia'>('global');
  const [lightboxEntry, setLightboxEntry] = useState<CamLightboxEntry | null>(null);
  const [drawerCam,     setDrawerCam]     = useState<GlobeCam | null>(null);

  // Expose rotateTo so MapClient can pan the globe on country search
  const rotateTo = useCallback((lon: number, lat: number) => {
    rotRef.current = [-lon, -lat, 0];
    setSpinning(false);
  }, []);

  useImperativeHandle(ref, () => ({ rotateTo }), [rotateTo]);

  // ── Draw one frame ───────────────────────────────────────────────────────
  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (document.hidden) { rafRef.current = requestAnimationFrame(draw); return; }
    if (now - lastFrameRef.current < FRAME_MS) { rafRef.current = requestAnimationFrame(draw); return; }
    lastFrameRef.current = now;

    const W = canvas.width, H = canvas.height;
    if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(draw); return; }

    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) * 0.42 * zoomRef.current;

    if (spinning && !pauseRef.current && !dragRef.current.active)
      rotRef.current = [rotRef.current[0] + SPIN_SPEED, rotRef.current[1], 0];

    const proj = geoOrthographic()
      .scale(radius).translate([cx, cy]).rotate(rotRef.current)
      .clipAngle(90).precision(0.5);
    projRef.current = proj;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pathGen = geoPath().projection(proj).context(ctx);
    ctx.clearRect(0, 0, W, H);

    // Ocean
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    const ocean = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
    ocean.addColorStop(0, '#0e2a3a'); ocean.addColorStop(0.6, '#081c2a'); ocean.addColorStop(1, '#040e16');
    ctx.fillStyle = ocean; ctx.fill(); ctx.restore();

    // Graticule
    ctx.save(); ctx.beginPath(); pathGen(geoGraticule()());
    ctx.strokeStyle = 'rgba(30,80,60,0.45)'; ctx.lineWidth = 0.4; ctx.stroke(); ctx.restore();

    // Land
    if (COUNTRIES) {
      ctx.save();
      ctx.beginPath(); pathGen(COUNTRIES);
      ctx.fillStyle   = '#2d7a48';
      ctx.strokeStyle = '#52c47a';
      ctx.lineWidth   = 0.7;
      ctx.globalAlpha = 1;
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Globe rim
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0,200,120,0.30)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();

    // Cam dots
    const hov = hoveredRef.current;
    for (const cam of cams) {
      if (!isOnVisibleHemisphere(cam.lon, cam.lat, rotRef.current)) continue;
      const pt = proj([cam.lon, cam.lat]);
      if (!pt) continue;
      const [px, py] = pt as [number, number];
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy > radius * radius * 1.01) continue;
      const isHov = hov === cam;
      const r = dotRadius(cam.source, isHov);
      ctx.save();
      ctx.beginPath(); ctx.arc(px, py, r + 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fillStyle = isHov ? '#ffffff' : cam.color;
      ctx.shadowColor = cam.color; ctx.shadowBlur = isHov ? 12 : 5;
      ctx.fill(); ctx.restore();
    }

    // Atmosphere glow
    ctx.save();
    const atm = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.15);
    atm.addColorStop(0, 'rgba(0,220,120,0.08)'); atm.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.15, 0, 2 * Math.PI);
    ctx.fillStyle = atm; ctx.fill(); ctx.restore();

    rafRef.current = requestAnimationFrame(draw);
  }, [cams, spinning]);

  const startLoop = useCallback(() => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(draw); }, [draw]);

  useEffect(() => {
    if (active) startLoop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, startLoop]);

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const sync = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    };
    const ro = new ResizeObserver(sync); ro.observe(canvas); sync();
    return () => ro.disconnect();
  }, []);

  const getCamAt = useCallback((ex: number, ey: number): GlobeCam | null => {
    const canvas = canvasRef.current, proj = projRef.current;
    if (!canvas || !proj) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const mx = (ex - rect.left) * sx, my = (ey - rect.top) * sy;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.42 * zoomRef.current;
    let best: GlobeCam | null = null, bestDist = HOVER_RADIUS * 3;
    for (const cam of cams) {
      if (!isOnVisibleHemisphere(cam.lon, cam.lat, rotRef.current)) continue;
      const pt = proj([cam.lon, cam.lat]); if (!pt) continue;
      const [px, py] = pt as [number, number];
      if ((px - cx) ** 2 + (py - cy) ** 2 > radius * radius * 1.01) continue;
      const d = Math.hypot(px - mx, py - my);
      if (d < bestDist) { bestDist = d; best = cam; }
    }
    return best;
  }, [cams]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.active) {
      const start = gestureStartRef.current;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) gestureMovedRef.current = true;
      const dx = e.clientX - dragRef.current.x, dy = e.clientY - dragRef.current.y;
      rotRef.current = [
        rotRef.current[0] + dx * 0.5,
        Math.max(-60, Math.min(60, rotRef.current[1] - dy * 0.5)), 0,
      ];
      dragRef.current = { active: true, x: e.clientX, y: e.clientY };
    }
    const cam = getCamAt(e.clientX, e.clientY);
    hoveredRef.current = cam;
    const tt = tooltipRef.current;
    if (tt) {
      if (cam) {
        tt.style.opacity = '1';
        tt.style.left    = `${e.clientX + 12}px`;
        tt.style.top     = `${e.clientY - 8}px`;
        tt.textContent   = cam.title;
      } else {
        tt.style.opacity = '0';
      }
    }
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = cam ? 'pointer' : (dragRef.current.active ? 'grabbing' : 'grab');
  }, [getCamAt]);

  const onMouseDown  = useCallback((e: React.MouseEvent) => { pauseRef.current = true; gestureMovedRef.current = false; gestureStartRef.current = { x: e.clientX, y: e.clientY }; dragRef.current = { active: true, x: e.clientX, y: e.clientY }; }, []);
  const onMouseUp    = useCallback(() => { dragRef.current.active = false; pauseRef.current = false; }, []);
  const onMouseLeave = useCallback(() => {
    dragRef.current.active = false; pauseRef.current = false; hoveredRef.current = null;
    if (tooltipRef.current) tooltipRef.current.style.opacity = '0';
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    if (gestureMovedRef.current) { gestureMovedRef.current = false; return; }
    const cam = getCamAt(e.clientX, e.clientY);
    if (!cam) return;
    setDrawerCam(cam);
    setSpinning(false);
  }, [getCamAt]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    changeZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, [changeZoom]);

  const handleDrawerExpand    = useCallback((entry: CamLightboxEntry) => { setLightboxEntry(entry); }, []);
  const handleDrawerViewInMap = useCallback((cam: GlobeCam) => {
    setDrawerCam(null);
    if (onCamClick) onCamClick(cam); else onEnterMap();
  }, [onCamClick, onEnterMap]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    pauseRef.current = true;
    if (e.touches.length >= 2) {
      const [first, second] = Array.from(e.touches);
      pinchDistanceRef.current = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
      gestureMovedRef.current = true;
      lastTouchRef.current = null;
      return;
    }
    const touch = e.touches[0];
    gestureMovedRef.current = false;
    gestureStartRef.current = { x: touch.clientX, y: touch.clientY };
    lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);
  const onTouchMove  = useCallback((e: React.TouchEvent) => {
    if (e.touches.length >= 2) {
      const [first, second] = Array.from(e.touches);
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
      const previousDistance = pinchDistanceRef.current;
      if (previousDistance && Math.abs(distance - previousDistance) > 1) {
        changeZoom(distance / previousDistance);
        gestureMovedRef.current = true;
      }
      pinchDistanceRef.current = distance;
      return;
    }
    const t = e.touches[0]; const prev = lastTouchRef.current; if (!prev) return;
    const start = gestureStartRef.current;
    if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 5) gestureMovedRef.current = true;
    rotRef.current = [
      rotRef.current[0] + (t.clientX - prev.x) * 0.5,
      Math.max(-60, Math.min(60, rotRef.current[1] - (t.clientY - prev.y) * 0.5)), 0,
    ];
    lastTouchRef.current = { x: t.clientX, y: t.clientY };
  }, [changeZoom]);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    pinchDistanceRef.current = null;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      return;
    }
    pauseRef.current = false;
    lastTouchRef.current = null;
  }, []);

  // React to countryFilter prop — pan globe to selected country
  useEffect(() => {
    if (countryFilter) rotateTo(countryFilter.lon, countryFilter.lat);
  }, [countryFilter, rotateTo]);

  const displayCount = totalCount ?? cams.length;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#04080f', overflow: 'hidden' }}>

      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,100,0.012) 2px, rgba(0,255,100,0.012) 4px)',
      }} />

      <canvas
        ref={canvasRef}
        aria-label="Interactive webcam globe. Use Explore cameras for a keyboard-accessible list."
        role="img"
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }}
        onMouseMove={onMouseMove} onMouseDown={onMouseDown} onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave} onClick={onClick} onWheel={onWheel}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      />

      <div className="globe-zoom-controls" role="group" aria-label="Globe zoom controls">
        <button type="button" aria-label="Zoom globe in" disabled={zoom >= MAX_GLOBE_ZOOM} onClick={() => changeZoom(1.25)}>+</button>
        <output aria-label="Globe zoom level">{Math.round(zoom * 100)}%</output>
        <button type="button" aria-label="Zoom globe out" disabled={zoom <= MIN_GLOBE_ZOOM} onClick={() => changeZoom(0.8)}>−</button>
      </div>

      <button className="globe-spin-toggle" aria-pressed={!spinning} onClick={() => setSpinning(value => !value)}>
        {spinning ? 'Ⅱ Pause rotation' : '▷ Resume rotation'}
      </button>

      {/* HUD */}
      <div style={{
        position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, textAlign: 'center', pointerEvents: 'none',
        fontFamily: 'monospace', letterSpacing: '0.2em',
      }}>
        <div style={{ fontSize: 13, color: 'rgba(0,220,120,0.9)', textTransform: 'uppercase' }}>◉ WORLD WEBCAMS</div>
        <div style={{ fontSize: 10, color: 'rgba(0,180,80,0.5)', marginTop: 3 }}>
          {loading ? 'LOADING…' : `${displayCount.toLocaleString()} CAMERAS LISTED`}
        </div>
        {errors.length > 0 && (
          <div style={{ fontSize: 9, color: 'rgba(255,100,80,0.6)', marginTop: 2 }}>
            {errors.length} source{errors.length > 1 ? 's' : ''} offline
          </div>
        )}
      </div>

      {/* Country Search Bar */}
      <CountrySearch countries={countries} selected={countryFilter ?? null} onSelect={onSearchSelect ?? (() => {})} />

      {/* Active filter badge — only when search dropdown not shown */}
      {countryFilter && countries.length === 0 && (
        <div style={{
          position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(4,14,10,0.90)', border: '1px solid rgba(88,166,255,0.45)',
          borderRadius: 20, padding: '4px 12px 4px 14px',
          fontFamily: 'monospace', fontSize: 11, color: '#79c0ff', letterSpacing: '0.06em',
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)', pointerEvents: 'auto',
        }}>
          <span>🔍 {countryFilter.name}</span>
          <button onClick={onClearFilter} aria-label="Clear country filter"
            style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 13, cursor: 'pointer', lineHeight: 1, padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
            onMouseLeave={e => (e.currentTarget.style.color = '#8b949e')}
          >✕</button>
        </div>
      )}

      <CamDrawer
        cam={drawerCam}
        onClose={() => setDrawerCam(null)}
        onExpand={handleDrawerExpand}
        onViewInMap={handleDrawerViewInMap}
      />

      {/* Source legend */}
      <div style={{
        position: 'absolute', bottom: 24, right: 12, zIndex: 10,
        background: 'rgba(4,14,10,0.92)', border: '1px solid rgba(0,200,90,0.3)',
        borderRadius: 10, fontFamily: 'monospace', fontSize: 11, color: '#a0ffcc',
        backdropFilter: 'blur(10px)', minWidth: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}>
        <button onClick={() => setLegendOpen(o => !o)}
          style={{
            width: '100%', padding: '8px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'transparent', border: 'none',
            color: 'rgba(0,220,100,0.9)', fontFamily: 'monospace',
            fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer',
          }}
        >
          <span>⚙ SOURCES</span>
          <span style={{ opacity: 0.6 }}>{legendOpen ? '▲' : '▼'}</span>
        </button>

        {legendOpen && (
          <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 380, overflowY: 'auto' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              {(['global', 'eu', 'asia'] as const).map(sec => (
                <button key={sec} onClick={() => setLegendSection(sec)} style={{
                  flex: 1, padding: '3px 0', fontSize: 9, letterSpacing: '0.06em',
                  fontFamily: 'monospace', cursor: 'pointer',
                  background: legendSection === sec ? 'rgba(0,200,90,0.18)' : 'transparent',
                  border: legendSection === sec ? '1px solid rgba(0,200,90,0.35)' : '1px solid transparent',
                  borderRadius: 5, color: legendSection === sec ? '#6effb4' : 'rgba(0,200,90,0.5)',
                  transition: 'all 0.15s',
                }}>{sec.toUpperCase()}</button>
              ))}
            </div>

            {legendSection === 'global' && (
              <>
                {(Object.entries(SOURCE_LABELS) as [SourceKey, string][]).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', opacity: visible[key] ? 1 : 0.35, transition: 'opacity 0.2s' }}>
                    <input type="checkbox" checked={!!visible[key]} onChange={() => onToggleSource(key)}
                      style={{ accentColor: '#00dc64', cursor: 'pointer', width: 12, height: 12 }} />
                    <span style={{ fontSize: 9, letterSpacing: '0.06em', color: 'rgba(0,200,90,0.7)' }}>█</span>
                    <span style={{ flex: 1 }}>{label}</span>
                  </label>
                ))}
              </>
            )}

            {legendSection === 'eu' && (
              <>
                {(Object.entries(EU_COUNTRIES) as [string, string][]).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', opacity: euVisible[key] ? 1 : 0.35, transition: 'opacity 0.2s' }}>
                    <input type="checkbox" checked={!!euVisible[key]} onChange={() => onToggleEu(key)}
                      style={{ accentColor: '#00dc64', cursor: 'pointer', width: 12, height: 12 }} />
                    <span style={{ fontSize: 10 }}>{EU_FLAGS[key] ?? '🇪🇺'}</span>
                    <span style={{ flex: 1 }}>{label}</span>
                  </label>
                ))}
              </>
            )}

            {legendSection === 'asia' && (
              <>
                {(Object.entries(ASIA_SOURCES) as [string, string][]).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', opacity: asiaVisible[key] ? 1 : 0.35, transition: 'opacity 0.2s' }}>
                    <input type="checkbox" checked={!!asiaVisible[key]} onChange={() => onToggleAsia(key)}
                      style={{ accentColor: '#00dc64', cursor: 'pointer', width: 12, height: 12 }} />
                    <span style={{ fontSize: 10 }}>{ASIA_FLAGS[key] ?? '🌏'}</span>
                    <span style={{ flex: 1 }}>{label}</span>
                  </label>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <button onClick={onEnterMap}
        style={{
          position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, padding: '10px 28px',
          background: 'rgba(0,30,20,0.85)', border: '1px solid rgba(0,220,100,0.5)',
          borderRadius: 6, color: 'rgba(0,220,100,0.95)',
          fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.15em',
          cursor: 'pointer', boxShadow: '0 0 18px rgba(0,200,80,0.15)', transition: 'background 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,50,30,0.95)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,30,20,0.85)')}
      >▶ ENTER MAP VIEW</button>

      <div style={{
        position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, fontSize: 10, color: 'rgba(0,180,80,0.4)',
        fontFamily: 'monospace', letterSpacing: '0.1em', pointerEvents: 'none',
      }}>HOLD &amp; DRAG TO ROTATE · CLICK DOT TO VIEW LIVE FEED</div>

      <div ref={tooltipRef} style={{
        position: 'fixed', zIndex: 20, pointerEvents: 'none',
        padding: '4px 9px', background: 'rgba(4,14,10,0.92)',
        border: '1px solid rgba(0,200,90,0.35)',
        borderRadius: 5, color: '#a0ffcc',
        fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.05em',
        opacity: 0, transition: 'opacity 0.1s', whiteSpace: 'nowrap',
      }} />

      <CamLightbox entry={lightboxEntry} onClose={() => setLightboxEntry(null)} />
    </div>
  );
});

export default GlobeView;
