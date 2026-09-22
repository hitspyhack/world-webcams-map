'use client';

import dynamic from 'next/dynamic';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'grid',
        placeItems: 'center',
        background: '#0b1220',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 16,
      }}
    >
      Loading world webcams map…
    </div>
  ),
});

export default function MapClient() {
  return <LeafletMap />;
}
