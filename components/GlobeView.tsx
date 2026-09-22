'use client';

import { useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types (minimal subset of d3-geo we actually use)
// ---------------------------------------------------------------------------
interface GeoProjection {
  (coord: [number, number]): [number, number] | null;
  rotate(): [number, number, number];
  rotate(angles: [number, number, number]): this;
  scale(): number;
  scale(s: number): this;
  translate(): [number, number];
  translate(t: [number, number]): this;
  clipAngle(): number;
  clipAngle(a: number): this;
  precision(): number;
  precision(p: number): this;
}

interface GeoPath {
  (obj: unknown): string | null;
  context(ctx: CanvasRenderingContext2D): this;
  projection(proj: GeoProjection): this;
}

interface D3Geo {
  geoOrthographic(): GeoProjection;
  geoPath(): GeoPath;
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
const SPIN_SPEED   = 0.12;   // degrees per frame
const TILT         = -15;    // fixed Y-axis tilt
const DOT_RADIUS   = 3;      // camera dot radius px
const HOVER_RADIUS = 6;      // enlarged on hover
const FPS_CAP      = 40;     // max frames/sec — keeps CPU low on weak devices
const FRAME_MS     = 1000 / FPS_CAP;

// World land TopoJSON (111 KB, free, no API key)
const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export default function GlobeView({ cams, onEnterMap }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const rotRef      = useRef<[number, number, number]>([0, TILT, 0]);
  const dragRef     = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const pauseRef    = useRef(false);          // paused while pointer is inside canvas
  const lastFrameRef = useRef(0);
  const topoRef     = useRef<unknown>(null);
  const d3Ref       = useRef<D3Geo | null>(null);
  const projRef     = useRef<GeoProjection | null>(null);
  const hoveredRef  = useRef<GlobeCam | null>(null);
  const tooltipRef  = useRef<HTMLDivElement | null>(null);

  // ── Load d3-geo + TopoJSON once ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import('d3-geo'),
      import('topojson-client'),
      fetch(TOPO_URL).then(r => r.json()),
    ]).then(([d3geo, topo, world]) => {
      if (cancelled) return;
      d3Ref.current   = d3geo as unknown as D3Geo;
      // Extract land feature from TopoJSON
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      topoRef.current = (topo as any).feature(world, (world as any).objects.countries);
      startLoop();
    }).catch(console.error);
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Main render loop ─────────────────────────────────────────────────────
  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    const d3     = d3Ref.current;
    if (!canvas || !d3) return;

    // FPS cap
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

    // Auto-spin
    if (!pauseRef.current && !dragRef.current.active) {
      rotRef.current = [rotRef.current[0] + SPIN_SPEED, TILT, 0];
    }

    // Build projection
    const proj = d3.geoOrthographic()
      .scale(radius)
      .translate([cx, cy])
      .rotate(rotRef.current)
      .clipAngle(90)
      .precision(0.5);
    projRef.current = proj;

    const pathGen = d3.geoPath().projection(proj);

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    // ── Ocean ──
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    const ocean = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
    ocean.addColorStop(0,   '#0e2a3a');
    ocean.addColorStop(0.6, '#081c2a');
    ocean.addColorStop(1,   '#040e16');
    ctx.fillStyle = ocean;
    ctx.fill();

    // ── Graticule ──
    ctx.beginPath();
    const graticule = d3.geoGraticule()();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pathGen as any).context(ctx)(graticule);
    ctx.strokeStyle = 'rgba(30,60,80,0.55)';
    ctx.lineWidth   = 0.4;
    ctx.stroke();

    // ── Land ──
    if (topoRef.current) {
      ctx.beginPath();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pathGen as any).context(ctx)(topoRef.current);
      ctx.fillStyle   = '#1a3d2b';
      ctx.strokeStyle = '#2a5c3f';
      ctx.lineWidth   = 0.6;
      ctx.fill();
      ctx.stroke();
    }

    // ── Globe rim ──
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0,200,120,0.18)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // ── Cam dots ──
    const hov = hoveredRef.current;
    for (const cam of cams) {
      const pt = proj([cam.lon, cam.lat]);
      if (!pt) continue;
      // Only render dots on the visible hemisphere (clipAngle handles path,
      // but dots need a manual visibility check)
      const [px, py] = pt;
      // Quick distance check: if projected point is outside globe circle it's on back
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > radius * radius * 1.01) continue;

      const isHov = hov === cam;
      const r     = isHov ? HOVER_RADIUS : DOT_RADIUS;

      ctx.beginPath();
      ctx.arc(px, py, r + 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fillStyle = isHov ? '#ffffff' : cam.color;
      ctx.shadowColor = cam.color;
      ctx.shadowBlur  = isHov ? 10 : 4;
      ctx.fill();
      ctx.shadowBlur  = 0;
    }

    // ── Atmosphere glow ──
    const atm = ctx.createRadialGradient(cx, cy, radius * 0.95, cx, cy, radius * 1.12);
    atm.addColorStop(0,   'rgba(0,220,120,0.08)');
    atm.addColorStop(1,   'rgba(0,0,0,0)');
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

  // Re-kick loop if cams change
  useEffect(() => {
    if (d3Ref.current) startLoop();
  }, [cams, startLoop]);

  // ── Resize handler ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      canvas.style.width  = canvas.offsetWidth  + 'px';
      canvas.style.height = canvas.offsetHeight + 'px';
    });
    ro.observe(canvas);
    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    return () => ro.disconnect();
  }, []);

  // ── Pointer events ───────────────────────────────────────────────────────
  const getCamAt = useCallback((ex: number, ey: number): GlobeCam | null => {
    const canvas = canvasRef.current;
    const proj   = projRef.current;
    if (!canvas || !proj) return null;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (ex - rect.left) * scaleX;
    const my = (ey - rect.top)  * scaleY;
    const W  = canvas.width;
    const H  = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.42;

    let best: GlobeCam | null = null;
    let bestDist = HOVER_RADIUS * 3;
    for (const cam of cams) {
      const pt = proj([cam.lon, cam.lat]);
      if (!pt) continue;
      const [px, py] = pt;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > radius * radius * 1.01) continue;
      const d = Math.hypot(px - mx, py - my);
      if (d < bestDist) { bestDist = d; best = cam; }
    }
    return best;
  }, [cams]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    // Drag to rotate
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
    // Update tooltip
    const tip = tooltipRef.current;
    if (tip) {
      if (cam) {
        tip.textContent = cam.title;
        tip.style.left    = e.clientX + 14 + 'px';
        tip.style.top     = e.clientY - 8  + 'px';
        tip.style.opacity = '1';
      } else {
        tip.style.opacity = '0';
      }
    }
    canvasRef.current!.style.cursor = cam ? 'pointer' : 'grab';
  }, [getCamAt]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { active: true, x: e.clientX, y: e.clientY };
    pauseRef.current = true;
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  const onMouseLeave = useCallback(() => {
    dragRef.current.active = false;
    pauseRef.current = false;
    hoveredRef.current = null;
    if (tooltipRef.current) tooltipRef.current.style.opacity = '0';
  }, []);

  const onMouseEnter = useCallback(() => {
    pauseRef.current = true;
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    const cam = getCamAt(e.clientX, e.clientY);
    if (cam) onEnterMap();
  }, [getCamAt, onEnterMap]);

  // Touch support
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    pauseRef.current = true;
    const t = e.touches[0];
    lastTouchRef.current = { x: t.clientX, y: t.clientY };
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const t    = e.touches[0];
    const prev = lastTouchRef.current;
    if (!prev) return;
    const dx = t.clientX - prev.x;
    const dy = t.clientY - prev.y;
    rotRef.current = [
      rotRef.current[0] + dx * 0.5,
      Math.max(-60, Math.min(60, rotRef.current[1] - dy * 0.5)),
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
      {/* Scanline overlay — OSINT aesthetic, CSS only */}
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

      {/* HUD header */}
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

      {/* Enter map button */}
      <button
        onClick={onEnterMap}
        style={{
          position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, padding: '10px 28px',
          background: 'rgba(0,30,20,0.85)',
          border: '1px solid rgba(0,220,100,0.5)',
          borderRadius: 6, color: 'rgba(0,220,100,0.95)',
          fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.15em',
          cursor: 'pointer',
          boxShadow: '0 0 18px rgba(0,200,80,0.15)',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,50,30,0.95)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,30,20,0.85)')}
      >
        ▶ ENTER MAP VIEW
      </button>

      {/* Drag hint */}
      <div style={{
        position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, fontSize: 10, color: 'rgba(0,180,80,0.4)',
        fontFamily: 'monospace', letterSpacing: '0.1em', pointerEvents: 'none',
      }}>
        DRAG TO ROTATE · CLICK DOT TO ENTER
      </div>

      {/* Cam tooltip */}
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
