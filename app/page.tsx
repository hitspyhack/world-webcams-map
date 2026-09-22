'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

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

export default function HomePage() {
  const [windyCams, setWindyCams] = useState<WindyWebcam[]>([]);
  const [skylineCams, setSkylineCams] = useState<SkylineItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const windyRes = await fetch('/api/windy-webcams?bbox=90,180,-90,-180');
        const windyJson = await windyRes.json();
        const webcams: WindyWebcam[] =
          windyJson.webcams ?? windyJson.result?.webcams ?? [];
        setWindyCams(webcams);

        const skylineRes = await fetch('/api/skyline-webcams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: 'Rome' }),
        });
        const skylineJson: SkylineItem[] = await skylineRes.json();
        setSkylineCams(skylineJson);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <main style={{ height: '100vh', width: '100vw' }}>
      <MapContainer
        center={[0, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {windyCams.map((cam) => {
          const loc = cam.location;
          if (!loc) return null;
          const lat = loc.latitude;
          const lon = loc.longitude;
          if (lat == null || lon == null) return null;

          const preview = cam.images?.current?.preview;
          const id = cam.webcamId ?? cam.id ?? `${lat}-${lon}`;

          return (
            <Marker key={`windy-${id}`} position={[lat, lon]}>
              <Popup>
                <strong>{cam.title}</strong>
                <br />
                {loc.country} {loc.region && `– ${loc.region}`}
                <br />
                {loc.city && loc.city}
                {preview && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={preview}
                      alt={cam.title ?? 'Webcam'}
                      style={{ maxWidth: 240 }}
                      loading="lazy"
                    />
                  </div>
                )}
                {cam.urls?.player && (
                  <div style={{ marginTop: 8 }}>
                    <iframe
                      src={cam.urls.player}
                      title="Timelapse"
                      width={240}
                      height={135}
                      loading="lazy"
                    />
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}

        {skylineCams.map((cam) => {
          const gps = cam.gps;
          if (!gps) return null;
          const { lat, lon } = gps;
          if (lat == null || lon == null) return null;

          return (
            <Marker
              key={`skyline-${cam.id ?? cam.url ?? `${lat}-${lon}`}`}
              position={[lat, lon]}
            >
              <Popup>
                <strong>{cam.title}</strong>
                <br />
                {cam.town && cam.town} {cam.country && `– ${cam.country}`}
                {cam.snapshotUrl && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={cam.snapshotUrl}
                      alt={cam.title ?? 'Skyline webcam'}
                      style={{ maxWidth: 240 }}
                      loading="lazy"
                    />
                  </div>
                )}
                {cam.url && (
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={cam.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Skyline page
                    </a>
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          Loading webcams…
        </div>
      )}
    </main>
  );
}
