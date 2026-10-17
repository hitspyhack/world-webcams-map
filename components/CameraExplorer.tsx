'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { GlobeCam } from './GlobeView';
import { cameraContextUrls, cameraKey, distanceKm, exportCameras, isPublicWebUrl, normalizeSearch, readCameraCollections, readSavedCameras, timestampedCaptureFilename } from '../lib/cameras';
import { FEEDS, type FeedKey, type FeedStates } from '../hooks/useWebcamFeeds';

const STORAGE_KEY = 'world-webcams:saved:v1';
const COLLECTIONS_KEY = 'world-webcams:collections:v1';
const LISTING_STALE_MS = 24 * 60 * 60 * 1000;

interface Props {
  cameras: GlobeCam[];
  feeds: FeedStates;
  onRefresh: (key?: FeedKey) => void;
  onOpen: (camera: GlobeCam) => void;
  onLocate: (camera: GlobeCam) => void;
}

export default function CameraExplorer({ cameras, feeds, onRefresh, onOpen, onLocate }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'discover' | 'saved' | 'sources'>('discover');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<GlobeCam[]>([]);
  const [collections, setCollections] = useState(['Favorites']);
  const [activeCollection, setActiveCollection] = useState('Favorites');
  const [newCollection, setNewCollection] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radiusKm, setRadiusKm] = useState('25');
  const [captureMessage, setCaptureMessage] = useState('');
  const [storageError, setStorageError] = useState(false);
  const panelId = useId();

  useEffect(() => {
    try { setSaved(readSavedCameras(localStorage.getItem(STORAGE_KEY))); }
    catch { setStorageError(true); }
    try { setCollections(readCameraCollections(localStorage.getItem(COLLECTIONS_KEY))); }
    catch { setStorageError(true); }
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setSaved(readSavedCameras(event.newValue));
      if (event.key === COLLECTIONS_KEY || event.key === null) setCollections(readCameraCollections(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const toggleSaved = (camera: GlobeCam) => {
    const key = cameraKey(camera);
    const next = saved.some(item => cameraKey(item) === key)
      ? saved.filter(item => cameraKey(item) !== key) : [...saved, { ...camera, collection: activeCollection }].slice(-500);
    setSaved(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  };

  const createCollection = () => {
    const name = newCollection.trim().slice(0, 60);
    if (!name) return;
    const next = collections.includes(name) ? collections : [...collections, name].slice(0, 100);
    setCollections(next);
    setActiveCollection(name);
    setNewCollection('');
    try { localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  };

  const hasGeoCenter = latitude !== '' && longitude !== ''
    && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
    && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
  const radius = Number(radiusKm);
  const validRadius = Number.isFinite(radius) && radius > 0 && radius <= 20000;

  const savedKeys = useMemo(() => new Set(saved.map(cameraKey)), [saved]);
  const results = useMemo(() => {
    const needle = normalizeSearch(query);
    const unique = new Map<string, GlobeCam>();
    const source = tab === 'saved'
      ? saved.filter(camera => (camera.collection ?? 'Favorites') === activeCollection)
      : cameras;
    for (const camera of source) {
      if (!normalizeSearch(`${camera.title} ${camera.source ?? ''} ${camera.city ?? ''} ${camera.country ?? ''} ${(camera.categories ?? []).join(' ')}`).includes(needle)) continue;
      unique.set(cameraKey(camera), camera);
    }
    const matching = [...unique.values()];
    if (!hasGeoCenter || !validRadius) return matching;
    return matching
      .map(camera => ({ camera, distance: distanceKm(Number(latitude), Number(longitude), camera.lat, camera.lon) }))
      .filter(item => item.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .map(item => item.camera);
  }, [cameras, query, saved, tab, activeCollection, hasGeoCenter, validRadius, latitude, longitude, radius]);
  const loading = Object.values(feeds).some(feed => feed.status === 'loading');
  const failures = Object.values(feeds).filter(feed => feed.status === 'error' || feed.warning).length;

  const download = (format: 'csv' | 'geojson') => {
    const blob = new Blob([exportCameras(results, format)], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/geo+json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `webcam-cameras-${new Date().toISOString().slice(0, 10)}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadSnapshot = async (camera: GlobeCam) => {
    if (!isPublicWebUrl(camera.imageUrl)) return;
    setCaptureMessage('Requesting snapshot from its provider…');
    try {
      const response = await fetch(camera.imageUrl, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error('Provider refused the image request.');
      const image = await response.blob();
      if (!image.type.startsWith('image/')) throw new Error('Provider did not return an image.');
      const url = URL.createObjectURL(image);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = timestampedCaptureFilename(camera, new Date(), image.type);
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCaptureMessage('Snapshot downloaded with local capture time in its filename.');
    } catch {
      setCaptureMessage('Snapshot not downloaded. The provider may block browser capture; use its source link instead.');
    }
  };

  return (
    <aside className="camera-explorer" aria-label="Camera explorer">
      <button className="explorer-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
        <span>◈ Explore cameras</span>
        <span className="explorer-count">{cameras.length.toLocaleString()} available {open ? '−' : '+'}</span>
      </button>
      {open && (
        <div id={panelId} className="explorer-panel">
          <div className="explorer-tabs" aria-label="Explorer sections">
            {(['discover', 'saved', 'sources'] as const).map(item => (
              <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>
                {item === 'saved' ? `Saved (${saved.length})` : item === 'sources' ? `Sources${failures ? ` · ${failures} issues` : ''}` : 'Discover'}
              </button>
            ))}
          </div>
          {tab === 'sources' ? (
            <div className="explorer-sources">
              <p className="explorer-hint">Sources load independently. Counts describe listed cameras, not verified live streams.</p>
              <button className="explorer-secondary" onClick={() => onRefresh()}>Refresh all sources</button>
              {(Object.keys(FEEDS) as FeedKey[]).map(key => {
                const feed = feeds[key];
                return (
                  <div key={key} className="explorer-source">
                    <div><strong>{FEEDS[key].label}</strong>
                      <span className={`feed-state feed-${feed.status}`}>
                        {feed.status === 'loading' ? 'Loading…' : feed.status === 'unconfigured' ? 'API key not configured' : feed.status === 'error' ? feed.error : `${feed.data.length.toLocaleString()} listed`}
                      </span>
                      {feed.warning && <small className="feed-error">{feed.warning}</small>}
                      {feed.updatedAt && <small>Last loaded {new Date(feed.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{feed.status === 'error' ? ' · showing cached results' : ''}</small>}
                    </div>
                    <button className="explorer-icon" aria-label={`Refresh ${FEEDS[key].label}`} onClick={() => onRefresh(key)}>↻</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <label className="explorer-search">
                <span className="sr-only">Search cameras</span>
                <input type="search" placeholder="Search place, country, or source…" value={query} onChange={event => setQuery(event.target.value)} />
              </label>
              <div className="explorer-collection-controls">
                <label>Collection
                  <select aria-label="Saved collection" value={activeCollection} onChange={event => setActiveCollection(event.target.value)}>
                    {collections.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <div className="explorer-new-collection">
                  <label className="sr-only" htmlFor={`${panelId}-collection`}>New collection name</label>
                  <input id={`${panelId}-collection`} value={newCollection} maxLength={60} placeholder="New collection" onChange={event => setNewCollection(event.target.value)} />
                  <button className="explorer-secondary" onClick={createCollection} disabled={!newCollection.trim()}>Create</button>
                </div>
              </div>
              <fieldset className="explorer-geo-search">
                <legend>Search near coordinates</legend>
                <label>Latitude
                  <input type="number" min="-90" max="90" step="any" value={latitude} onChange={event => setLatitude(event.target.value)} placeholder="e.g. 38.72" />
                </label>
                <label>Longitude
                  <input type="number" min="-180" max="180" step="any" value={longitude} onChange={event => setLongitude(event.target.value)} placeholder="e.g. -9.14" />
                </label>
                <label>Radius (km)
                  <input type="number" min="1" max="20000" step="1" value={radiusKm} onChange={event => setRadiusKm(event.target.value)} />
                </label>
                {((latitude !== '' || longitude !== '') && !hasGeoCenter) && <small role="status">Enter valid latitude and longitude.</small>}
                {hasGeoCenter && !validRadius && <small role="status">Radius must be between 1 and 20,000 km.</small>}
              </fieldset>
              <div className="explorer-toolbar">
                <span role="status">{results.length.toLocaleString()} {tab === 'saved' ? `saved in ${activeCollection}` : 'matching'} cameras</span>
                <div className="explorer-actions">
                  <button className="explorer-secondary" disabled={!results.length} onClick={() => onOpen(results[Math.floor(Math.random() * results.length)])}>✦ Surprise me</button>
                  <button className="explorer-secondary" disabled={!results.length} onClick={() => download('csv')} aria-label="Export matching cameras as CSV">CSV</button>
                  <button className="explorer-secondary" disabled={!results.length} onClick={() => download('geojson')} aria-label="Export matching cameras as GeoJSON">GeoJSON</button>
                </div>
              </div>
              {tab === 'discover' && <p className="explorer-hint">Respects your country and source filters. Save places to revisit later.</p>}
              {captureMessage && <p role="status" className="explorer-hint">{captureMessage}</p>}
              {storageError && <p role="status" className="explorer-hint">Browser storage is unavailable. Saved cameras will last for this session only.</p>}
              <ul className="explorer-results" aria-label={tab === 'saved' ? 'Saved cameras' : 'Camera results'}>
                {results.slice(0, 100).map(camera => {
                  const key = cameraKey(camera);
                  const isSaved = savedKeys.has(key);
                  return (
                    <li key={key}>
                      <div className="explorer-camera-title">
                        <button className="explorer-open" onClick={() => onOpen(camera)}>{camera.title}</button>
                        <span className="camera-media-indicator">{camera.embedUrl ? 'PLAYER LINK' : camera.imageUrl ? 'SNAPSHOT' : 'SOURCE LINK'}</span>
                        <button className="explorer-icon" aria-label={`${isSaved ? 'Unsave' : 'Save'} ${camera.title}`} aria-pressed={isSaved} onClick={() => toggleSaved(camera)}>{isSaved ? '★' : '☆'}</button>
                      </div>
                      <div className="explorer-camera-meta">
                        <span>{[camera.city, camera.country, camera.source ?? 'Webcam'].filter(Boolean).join(' · ')} · {camera.lat.toFixed(2)}, {camera.lon.toFixed(2)}</span>
                        <span className="explorer-camera-links">
                          <button onClick={() => { onLocate(camera); setOpen(false); }} aria-label={`Locate ${camera.title} on map`}>Locate</button>
                          {camera.imageUrl && <button onClick={() => void downloadSnapshot(camera)} aria-label={`Download timestamped snapshot of ${camera.title}`}>Capture</button>}
                          <a href={cameraContextUrls(camera.lat, camera.lon).googleMaps} target="_blank" rel="noopener noreferrer" aria-label={`Open ${camera.title} in Google Maps`}>Maps ↗</a>
                          <a href={cameraContextUrls(camera.lat, camera.lon).streetView} target="_blank" rel="noopener noreferrer" aria-label={`Open Street View near ${camera.title}`}>Street View ↗</a>
                        </span>
                      </div>
                      <div className="explorer-freshness">
                        {camera.captureAt && Number.isFinite(Date.parse(camera.captureAt))
                          ? <span>Captured {new Date(camera.captureAt).toLocaleString()}</span>
                          : <span>Capture time not supplied</span>}
                        {camera.checkedAt && <span className={Date.now() - camera.checkedAt > LISTING_STALE_MS ? 'is-stale' : ''}>
                          Listing checked {Math.max(0, Math.floor((Date.now() - camera.checkedAt) / 60000))}m ago{Date.now() - camera.checkedAt > LISTING_STALE_MS ? ' · check is old' : ''}
                        </span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {results.length > 100 && <p className="explorer-hint">Showing the first 100. Narrow your search for more specific results.</p>}
              {!results.length && <p className="explorer-empty">{query ? 'No cameras match your search.' : tab === 'saved' ? 'Your next favorite view is out there. Save a camera with ☆ to keep it here.' : loading ? 'Finding your next view… Sources are still loading.' : 'No cameras match your filters. Try another country or enable more sources.'}</p>}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
