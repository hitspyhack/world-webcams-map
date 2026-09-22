'use client';

import { useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types — mirrors the d3-geo + topojson-client APIs we actually call.
// Both libs are loaded at runtime via CDN <script> tags (no npm install needed)
// and accessed through window.d3 / window.topojson.
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    d3: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topojson: any;
  }
}

interface GeoProjection {
  (coord: [number, number]): [number, number] | null;
  rotate(): [number, number, number];
  rotate(angles: [number, number, number]): this;
  scale(s: number): this;
  translate(t: [number, number]): this;
  clipAngle(a: number): this;
  precision(p: number): this;
}

interface GeoPathGenerator {
  context(ctx: CanvasRenderingContext2D): GeoPathGenerator;
  projection(proj: GeoProjection): GeoPathGenerator;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj: any): void;
}

interface D3Geo {
  geoOrthographic(): GeoProjection;
  geoPath(): GeoPathGenerator;
  geoGraticule(): () => unknown;
}

export interface GlobeCam {
  lat: number;
  lon: number;
  title: string;
  color: string;
}

interface Props {
  cams: GlobeCam[];
  onEnterMap: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SPIN_SPEED    = 0.12;
const TILT          = -15;
const DOT_RADIUS    = 3;
const HOVER_RADIUS  = 6;
const FPS_CAP       = 40;
const FRAME_MS      = 1000 / FPS_CAP;

const TOPO_URL      = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const D3_CDN        = 'https://cdn.jsdelivr.net/npm/d3-geo@3/dist/d3-geo.min.js';
const TOPOJSON_CDN  = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GlobeView({ cams, onEnterMap }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const rotRef       = useRef<[number, number, number]>([0, TILT, 0]);
  const dragRef      = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const pauseRef     = useRef(false);
  const lastFrameRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topoRef      = useRef<any>(null);
  const d3Ref        = useRef<D3Geo | null>(null);
  const projRef      = useRef<GeoProjection | null>(null);
  const hoveredRef   = useRef<GlobeCam | null>(null);
  const tooltipRef   = useRef<HTMLDivElement | null>(null);

  // ── Load libs + TopoJSON via CDN, then start the loop ──────────────────
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadScript(D3_CDN),
      loadScript(TOPOJSON_CDN),
      fetch(TOPO_URL).then(r => r.json()),
    ]).then(([, , world]) => {
      if (cancelled) return;
      d3Ref.current   = window.d3 as D3Geo;
      topoRef.current = window.topojson.feature(world, world.objects.countries);
      startLoop();
    }).catch(console.error);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render loop ─────────────────────────────────────────────────────────
  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    const d3     = d3Ref.current;
    if (!canvas || !d3) return;

    if (now - lastFrameRef.current < FRAME_MS) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    lastFrameRef.current = now;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.42;

    if (!pauseRef.current && !dragRef.current.active) {
      rotRef.current = [rotRef.current[0] + SPIN_SPEED, TILT, 0];
    }

    const proj = d3.geoOrthographic()
      .scale(radius)
      .translate([cx, cy])
      .rotate(rotRef.current)
      .clipAngle(90)
      .precision(0.5);
    projRef.current = proj;

    const pathGen = d3.geoPath().projection(proj).context(
      canvas.getContext('2d')!
    );

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    // Ocean
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    const ocean = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
    ocean.addColorStop(0,   '#0e2a3a');
    ocean.addColorStop(0.6, '#081c2a');
    ocean.addColorStop(1,   '#040e16');
    ctx.fillStyle = ocean;
    ctx.fill();

    // Graticule
    ctx.beginPath();
    pathGen(d3.geoGraticule()());
    ctx.strokeStyle = 'rgba(30,60,80,0.55)';
    ctx.lineWidth   = 0.4;
    ctx.stroke();

    // Land
    if (topoRef.current) {
      ctx.beginPath();
      pathGen(topoRef.current);
      ctx.fillStyle   = '#1a3d2b';
      ctx.strokeStyle = '#2a5c3f';
      ctx.lineWidth   = 0.6;
      ctx.fill();
      ctx.stroke();
    }

    // Globe rim
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0,200,120,0.18)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Cam dots
    const hov = hoveredRef.current;
    for (const cam of cams) {
      const pt = proj([cam.lon, cam.lat]);
      if (!pt) continue;
      const [px, py] = pt;
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy > radius * radius * 1.01) continue;

      const isHov = hov === cam;
      const r = isHov ? HOVER_RADIUS : DOT_RADIUS;

      ctx.beginPath();
      ctx.arc(px, py, r + 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fillStyle   = isHov ? '#ffffff' : cam.color;
      ctx.shadowColor = cam.color;
      ctx.shadowBlur  = isHov ? 10 : 4;
      ctx.fill();
      ctx.shadowBlur  = 0;
    }

    // Atmosphere glow
    const atm = ctx.createRadialGradient(cx, cy, radius * 0.95, cx, cy, radius * 1.12);
    atm.addColorStop(0, 'rgba(0,220,120,0.08)');
    atm.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.12, 0, 2 * Math.PI);
    ctx.fillStyle = atm;
    ctx.fill();

    rafRef.current = requestAnimationFrame(draw);
  }, [cams]);

  const startLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    if (d3Ref.current) startLoop();
  }, [cams, startLoop]);

  // ── Resize ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    };
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    sync();
    return () => ro.disconnect();
  }, []);

  // ── Pointer helpers ──────────────────────────────────────────────────────
  const getCamAt = useCallback((ex: number, ey: number): GlobeCam | null => {
    const canvas = canvasRef.current;
    const proj   = projRef.current;
    if (!canvas || !proj) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    const mx = (ex - rect.left) * sx;
    const my = (ey - rect.top)  * sy;
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.42;
    let best: GlobeCam | null = null;
    let bestDist = HOVER_RADIUS * 3;
    for (const cam of cams) {
      const pt = proj([cam.lon, cam.lat]);
      if (!pt) continue;
      const [px, py] = pt;
      if ((px - cx) ** 2 + (py - cy) ** 2 > radius * radius * 1.01) continue;
      const d = Math.hypot(px - mx, py - my);
      if (d < bestDist) { bestDist = d; best = cam; }
    }
    return best;
  }, [cams]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      rotRef.current = [
        rotRef.current[0] + dx * 0.4,
        Math.max(-60, Math.min(60, rotRef.current[1] - dy * 0.4)),
        0,
      ];
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
    }
    const cam = getCamAt(e.clientX, e.clientY);
    hoveredRef.current = cam;
    const tip = tooltipRef.current;
    if (tip) {
      if (cam) {
        tip.textContent   = cam.title;
        tip.style.left    = e.clientX + 14 + 'px';
        tip.style.top     = e.clientY - 8  + 'px';
        tip.style.opacity = '1';
      } else {
        tip.style.opacity = '0';
      }
    }
    if (canvasRef.current) canvasRef.current.style.cursor = cam ? 'pointer' : 'grab';
  }, [getCamAt]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { active: true, x: e.clientX, y: e.clientY };
    pauseRef.current = true;
  }, []);
  const onMouseUp    = useCallback(() => { dragRef.current.active = false; }, []);
  const onMouseLeave = useCallback(() => {
    dragRef.current.active = false;
    pauseRef.current = false;
    hoveredRef.current = null;
    if (tooltipRef.current) tooltipRef.current.style.opacity = '0';
  }, []);
  const onMouseEnter = useCallback(() => { pauseRef.current = true; }, []);
  const onClick = useCallback((e: React.MouseEvent) => {
    if (getCamAt(e.clientX, e.clientY)) onEnterMap();
  }, [getCamAt, onEnterMap]);

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    pauseRef.current = true;
    const t = e.touches[0];
    lastTouchRef.current = { x: t.clientX, y: t.clientY };
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0], prev = lastTouchRef.current;
    if (!prev) return;
    rotRef.current = [
      rotRef.current[0] + (t.clientX - prev.x) * 0.5,
      Math.max(-60, Math.min(60, rotRef.current[1] - (t.clientY - prev.y) * 0.5)),
      0,
    ];
    lastTouchRef.current = { x: t.clientX, y: t.clientY };
  }, []);
  const onTouchEnd = useCallback(() => {
    pauseRef.current = false;
    lastTouchRef.current = null;
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#04080f', overflow: 'hidden' }}>
      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,100,0.018) 2px, rgba(0,255,100,0.018) 4px)',
      }} />

      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      {/* HUD */}
      <div style={{
        position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, textAlign: 'center', pointerEvents: 'none',
        fontFamily: 'monospace', letterSpacing: '0.2em',
      }}>
        <div style={{ fontSize: 13, color: 'rgba(0,220,120,0.9)', textTransform: 'uppercase' }}>
          ◉ LIVE SURVEILLANCE NETWORK
        </div>
        <div style={{ fontSize: 10, color: 'rgba(0,180,80,0.5)', marginTop: 3 }}>
          {cams.length.toLocaleString()} CAMERAS ONLINE
        </div>
      </div>

      <button
        onClick={onEnterMap}
        style={{
          position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, padding: '10px 28px',
          background: 'rgba(0,30,20,0.85)',
          border: '1px solid rgba(0,220,100,0.5)',
          borderRadius: 6, color: 'rgba(0,220,100,0.95)',
          fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.15em',
          cursor: 'pointer', boxShadow: '0 0 18px rgba(0,200,80,0.15)',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,50,30,0.95)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,30,20,0.85)')}
      >
        ▶ ENTER MAP VIEW
      </button>

      <div style={{
        position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, fontSize: 10, color: 'rgba(0,180,80,0.4)',
        fontFamily: 'monospace', letterSpacing: '0.1em', pointerEvents: 'none',
      }}>
        DRAG TO ROTATE · CLICK DOT TO ENTER
      </div>

      <div
        ref={tooltipRef}
        style={{
          position: 'fixed', zIndex: 20, pointerEvents: 'none',
          padding: '4px 9px', background: 'rgba(4,14,10,0.92)',
          border: '1px solid rgba(0,200,90,0.35)',
          borderRadius: 5, color: '#a0ffcc',
          fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.05em',
          opacity: 0, transition: 'opacity 0.1s', whiteSpace: 'nowrap',
        }}
      />
    </div>
  );
}
