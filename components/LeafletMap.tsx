'use client';

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

// --- Types ---

interface WindyLocation {
  latitude: number;
  longitude: number;
  country?: string;
  region?: string;
  city?: string;
}

interface WindyWebcam {
  webcamId?: string;
  id?: string;
  title?: string;
  location?: WindyLocation;
  images?: {
    current?: { preview?: string };
  };
  urls?: {
    player?: string;
    webcam?: string;
  };
}

interface SkylineGps {
  lat: number;
  lon: number;
}

interface SkylineItem {
  id?: string;
  title?: string;
  url?: string;
  snapshotUrl?: string;
  gps?: SkylineGps;
  town?: string;
  country?: string;
}

// --- Component ---

export default function LeafletMap() {
  const [windyCams, setWindyCams] = useState<WindyWebcam[]>([]);
  const [skylineCams, setSkylineCams] = useState<SkylineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Blue marker — Windy
  const windyIcon = useMemo(
    () =>
      new L.Icon({
        iconUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    []
  );

  // Red marker — Skyline
  const skylineIcon = useMemo(
    () =>
      new L.Icon({
        iconUrl:
          'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        iconRetinaUrl:
          'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    []
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Windy — world bounding box
        const windyRes = await fetch(
          '/api/windy-webcams?bbox=90,180,-90,-180'
        );
        if (!windyRes.ok) throw new Error(`Windy API error: ${windyRes.status}`);
        const windyJson = await windyRes.json();
        const webcams: WindyWebcam[] =
          windyJson.webcams ?? windyJson.result?.webcams ?? [];
        setWindyCams(webcams);

        // Skyline — default location Rome (can be made dynamic later)
        const skylineRes = await fetch('/api/skyline-webcams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: 'Rome' }),
        });
        if (!skylineRes.ok)
          throw new Error(`Skyline API error: ${skylineRes.status}`);
        const skylineJson = await skylineRes.json();
        setSkylineCams(Array.isArray(skylineJson) ? skylineJson : []);
      } catch (e: unknown) {
        console.error('Failed to load webcam data:', e);
        setError(e instanceof Error ? e.message : 'Failed to load webcams');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <main style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Windy webcams — blue markers */}
        {windyCams.map((cam) => {
          const loc = cam.location;
          if (!loc) return null;
          const { latitude: lat, longitude: lon } = loc;
          if (lat == null || lon == null) return null;
          const preview = cam.images?.current?.preview;
          const id = cam.webcamId ?? cam.id ?? `${lat}-${lon}`;

          return (
            <Marker
              key={`windy-${id}`}
              position={[lat, lon]}
              icon={windyIcon}
            >
              <Popup maxWidth={260}>
                <strong>{cam.title ?? 'Windy webcam'}</strong>
                <br />
                <span style={{ fontSize: 12, color: '#555' }}>
                  {[loc.city, loc.region, loc.country]
                    .filter(Boolean)
                    .join(', ')}
                </span>
                {preview && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={preview}
                      alt={cam.title ?? 'Webcam preview'}
                      style={{ maxWidth: 240, borderRadius: 6 }}
                      loading="lazy"
                    />
                  </div>
                )}
                {cam.urls?.player && (
                  <div style={{ marginTop: 8 }}>
                    <iframe
                      src={cam.urls.player}
                      title={`${cam.title ?? 'Webcam'} timelapse`}
                      width="240"
                      height="135"
                      loading="lazy"
                      style={{ border: 0, borderRadius: 6 }}
                    />
                  </div>
                )}
                {cam.urls?.webcam && (
                  <div style={{ marginTop: 6 }}>
                    <a
                      href={cam.urls.webcam}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12 }}
                    >
                      Open on Windy ↗
                    </a>
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}

        {/* Skyline webcams — red markers */}
        {skylineCams.map((cam) => {
          const gps = cam.gps;
          if (!gps) return null;
          const { lat, lon } = gps;
          if (lat == null || lon == null) return null;

          return (
            <Marker
              key={`skyline-${cam.id ?? cam.url ?? `${lat}-${lon}`}`}
              position={[lat, lon]}
              icon={skylineIcon}
            >
              <Popup maxWidth={260}>
                <strong>{cam.title ?? 'Skyline webcam'}</strong>
                <br />
                <span style={{ fontSize: 12, color: '#555' }}>
                  {[cam.town, cam.country].filter(Boolean).join(', ')}
                </span>
                {cam.snapshotUrl && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={cam.snapshotUrl}
                      alt={cam.title ?? 'Skyline snapshot'}
                      style={{ maxWidth: 240, borderRadius: 6 }}
                      loading="lazy"
                    />
                  </div>
                )}
                {cam.url && (
                  <div style={{ marginTop: 6 }}>
                    <a
                      href={cam.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12 }}
                    >
                      Open on Skyline ↗
                    </a>
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          right: 12,
          zIndex: 1000,
          background: 'rgba(11,18,32,0.85)',
          color: '#fff',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          backdropFilter: 'blur(6px)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>
          World Webcams Map
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png"
            alt="Windy marker"
            style={{ width: 12, height: 20 }}
          />
          Windy ({windyCams.length})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png"
            alt="Skyline marker"
            style={{ width: 12, height: 20 }}
          />
          Skyline ({skylineCams.length})
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 1000,
            padding: '8px 14px',
            background: 'rgba(11,18,32,0.85)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            backdropFilter: 'blur(6px)',
          }}
        >
          Loading webcams…
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 1000,
            padding: '8px 14px',
            background: 'rgba(161,44,68,0.9)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          ⚠ {error}
        </div>
      )}
    </main>
  );
}
