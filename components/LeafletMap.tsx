'use client';

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

// ---- Types ----

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
  images?: { current?: { preview?: string } };
  urls?: { player?: string; webcam?: string };
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

/** Always return a safe array regardless of what the API gives back */
function toArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

// ---- Component ----

export default function LeafletMap() {
  const [windyCams, setWindyCams] = useState<WindyWebcam[]>([]);
  const [skylineCams, setSkylineCams] = useState<SkylineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const windyIcon = useMemo(
    () =>
      new L.Icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    []
  );

  const skylineIcon = useMemo(
    () =>
      new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    []
  );

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setErrors([]);
      const errs: string[] = [];

      // Windy
      try {
        const res = await fetch('/api/windy-webcams?bbox=90,180,-90,-180');
        const json = await res.json();
        if (!res.ok) {
          errs.push(`Windy: ${json?.error ?? res.statusText}`);
        } else {
          setWindyCams(toArray<WindyWebcam>(json.webcams ?? json.result?.webcams));
        }
      } catch (e: unknown) {
        errs.push(`Windy network error: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Skyline
      try {
        const res = await fetch('/api/skyline-webcams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: 'Rome' }),
        });
        const json = await res.json();
        if (!res.ok) {
          errs.push(`Skyline: ${json?.error ?? res.statusText}`);
        } else {
          setSkylineCams(toArray<SkylineItem>(json));
        }
      } catch (e: unknown) {
        errs.push(`Skyline network error: ${e instanceof Error ? e.message : String(e)}`);
      }

      setErrors(errs);
      setLoading(false);
    };

    fetchAll();
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

        {/* Windy — blue markers */}
        {windyCams.map((cam) => {
          const loc = cam.location;
          if (!loc) return null;
          const { latitude: lat, longitude: lon } = loc;
          if (lat == null || lon == null) return null;
          const id = cam.webcamId ?? cam.id ?? `${lat}-${lon}`;
          const preview = cam.images?.current?.preview;
          return (
            <Marker key={`windy-${id}`} position={[lat, lon]} icon={windyIcon}>
              <Popup maxWidth={260}>
                <strong>{cam.title ?? 'Windy webcam'}</strong>
                <br />
                <span style={{ fontSize: 12, color: '#555' }}>
                  {[loc.city, loc.region, loc.country].filter(Boolean).join(', ')}
                </span>
                {preview && (
                  <div style={{ marginTop: 8 }}>
                    <img src={preview} alt={cam.title ?? 'Webcam'} style={{ maxWidth: 240, borderRadius: 6 }} loading="lazy" />
                  </div>
                )}
                {cam.urls?.player && (
                  <div style={{ marginTop: 8 }}>
                    <iframe src={cam.urls.player} title="timelapse" width="240" height="135" loading="lazy" style={{ border: 0, borderRadius: 6 }} />
                  </div>
                )}
                {cam.urls?.webcam && (
                  <div style={{ marginTop: 6 }}>
                    <a href={cam.urls.webcam} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>Open on Windy ↗</a>
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}

        {/* Skyline — red markers */}
        {skylineCams.map((cam) => {
          const gps = cam.gps;
          if (!gps) return null;
          const { lat, lon } = gps;
          if (lat == null || lon == null) return null;
          return (
            <Marker key={`skyline-${cam.id ?? cam.url ?? `${lat}-${lon}`}`} position={[lat, lon]} icon={skylineIcon}>
              <Popup maxWidth={260}>
                <strong>{cam.title ?? 'Skyline webcam'}</strong>
                <br />
                <span style={{ fontSize: 12, color: '#555' }}>
                  {[cam.town, cam.country].filter(Boolean).join(', ')}
                </span>
                {cam.snapshotUrl && (
                  <div style={{ marginTop: 8 }}>
                    <img src={cam.snapshotUrl} alt={cam.title ?? 'Skyline'} style={{ maxWidth: 240, borderRadius: 6 }} loading="lazy" />
                  </div>
                )}
                {cam.url && (
                  <div style={{ marginTop: 6 }}>
                    <a href={cam.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>Open on Skyline ↗</a>
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 24, right: 12, zIndex: 1000, background: 'rgba(11,18,32,0.88)', color: '#fff', borderRadius: 8, padding: '10px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6, backdropFilter: 'blur(6px)' }}>
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>World Webcams Map</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png" alt="Windy" style={{ width: 12, height: 20 }} />
          Windy ({windyCams.length})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png" alt="Skyline" style={{ width: 12, height: 20 }} />
          Skyline ({skylineCams.length})
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000, padding: '8px 14px', background: 'rgba(11,18,32,0.88)', color: '#fff', borderRadius: 8, fontSize: 13, backdropFilter: 'blur(6px)' }}>
          Loading webcams…
        </div>
      )}

      {/* Errors — non-fatal, map still renders */}
      {errors.map((msg, i) => (
        <div key={i} style={{ position: 'absolute', top: 12 + i * 44, left: 12, zIndex: 1000, padding: '8px 14px', background: 'rgba(161,44,68,0.9)', color: '#fff', borderRadius: 8, fontSize: 12, maxWidth: 340 }}>
          ⚠ {msg}
        </div>
      ))}
    </main>
  );
}
