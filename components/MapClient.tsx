'use client';

import dynamic from 'next/dynamic';
import { useState, useMemo } from 'react';
import type { GlobeCam } from './GlobeView';

// Lazy-load both heavy components — neither is needed on first paint
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

// Hardcoded seed cams shown on globe before the full dataset loads.
// Covers all continents so the globe looks lively immediately.
const SEED_CAMS: GlobeCam[] = [
  { lat: 48.86, lon: 2.35,   title: 'Paris — Eiffel Tower',     color: '#818cf8' },
  { lat: 51.50, lon: -0.13,  title: 'London — Westminster',     color: '#dc2626' },
  { lat: 40.71, lon: -74.01, title: 'New York — Times Square',  color: '#fb923c' },
  { lat: 35.68, lon: 139.69, title: 'Tokyo — Shibuya',          color: '#2563eb' },
  { lat: 1.35,  lon: 103.82, title: 'Singapore — Marina Bay',   color: '#ef4444' },
  { lat: -33.87, lon: 151.21, title: 'Sydney — Harbour Bridge', color: '#16a34a' },
  { lat: 55.75, lon: 37.62,  title: 'Moscow — Red Square',      color: '#f59e0b' },
  { lat: 25.20, lon: 55.27,  title: 'Dubai — Downtown',         color: '#0ea5e9' },
  { lat: -23.55, lon: -46.63, title: 'São Paulo',               color: '#34d399' },
  { lat: 19.43, lon: -99.13, title: 'Mexico City',              color: '#e879f9' },
  { lat: 28.61, lon: 77.21,  title: 'New Delhi',                color: '#ea580c' },
  { lat: -1.29, lon: 36.82,  title: 'Nairobi',                  color: '#6ee7b7' },
  { lat: 37.57, lon: 126.98, title: 'Seoul — Gangnam',          color: '#4ade80' },
  { lat: 41.01, lon: 28.98,  title: 'Istanbul',                 color: '#f97316' },
  { lat: 59.33, lon: 18.07,  title: 'Stockholm',                color: '#3b82f6' },
];

export default function MapClient() {
  const [mode, setMode] = useState<'globe' | 'map'>('globe');

  // Merge seed cams — in production you could lift real cam coords here
  const globeCams: GlobeCam[] = useMemo(() => SEED_CAMS, []);

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
        <GlobeView cams={globeCams} onEnterMap={() => setMode('map')} />
      </div>

      {/* ── Leaflet map view ── */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: mode === 'map' ? 1 : 0,
        pointerEvents: mode === 'map' ? 'auto' : 'none',
        transition: 'opacity 0.45s ease',
        zIndex: mode === 'map' ? 2 : 1,
      }}>
        <LeafletMap />
      </div>

      {/* ── Mode toggle ── always visible ── */}
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
