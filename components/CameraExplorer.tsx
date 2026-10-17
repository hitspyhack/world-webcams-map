'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { GlobeCam } from './GlobeView';
import { cameraKey, normalizeSearch, readSavedCameras } from '../lib/cameras';
import { FEEDS, type FeedKey, type FeedStates } from '../hooks/useWebcamFeeds';

const STORAGE_KEY = 'world-webcams:saved:v1';

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
  const [storageError, setStorageError] = useState(false);
  const panelId = useId();

  useEffect(() => {
    try { setSaved(readSavedCameras(localStorage.getItem(STORAGE_KEY))); }
    catch { setStorageError(true); }
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setSaved(readSavedCameras(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const toggleSaved = (camera: GlobeCam) => {
    const key = cameraKey(camera);
    const next = saved.some(item => cameraKey(item) === key)
      ? saved.filter(item => cameraKey(item) !== key) : [...saved, camera].slice(-500);
    setSaved(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  };

  const savedKeys = useMemo(() => new Set(saved.map(cameraKey)), [saved]);
  const results = useMemo(() => {
    const needle = normalizeSearch(query);
    const unique = new Map<string, GlobeCam>();
    for (const camera of tab === 'saved' ? saved : cameras) {
      if (!normalizeSearch(`${camera.title} ${camera.source ?? ''}`).includes(needle)) continue;
      unique.set(cameraKey(camera), camera);
    }
    return [...unique.values()];
  }, [cameras, query, saved, tab]);
  const loading = Object.values(feeds).some(feed => feed.status === 'loading');
  const failures = Object.values(feeds).filter(feed => feed.status === 'error' || feed.warning).length;

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
                <input type="search" placeholder="Search a place or source…" value={query} onChange={event => setQuery(event.target.value)} />
              </label>
              <div className="explorer-toolbar">
                <span role="status">{results.length.toLocaleString()} {tab === 'saved' ? 'saved' : 'matching'} cameras</span>
                <button className="explorer-secondary" disabled={!results.length} onClick={() => onOpen(results[Math.floor(Math.random() * results.length)])}>✦ Surprise me</button>
              </div>
              {tab === 'discover' && <p className="explorer-hint">Respects your country and source filters. Save places to revisit later.</p>}
              {storageError && <p role="status" className="explorer-hint">Browser storage is unavailable. Saved cameras will last for this session only.</p>}
              <ul className="explorer-results" aria-label={tab === 'saved' ? 'Saved cameras' : 'Camera results'}>
                {results.slice(0, 100).map(camera => {
                  const key = cameraKey(camera);
                  const isSaved = savedKeys.has(key);
                  return (
                    <li key={key}>
                      <div className="explorer-camera-title">
                        <button className="explorer-open" onClick={() => onOpen(camera)}>{camera.title}</button>
                        <button className="explorer-icon" aria-label={`${isSaved ? 'Unsave' : 'Save'} ${camera.title}`} aria-pressed={isSaved} onClick={() => toggleSaved(camera)}>{isSaved ? '★' : '☆'}</button>
                      </div>
                      <div className="explorer-camera-meta"><span>{camera.source ?? 'Webcam'} · {camera.lat.toFixed(2)}, {camera.lon.toFixed(2)}</span>
                        <button onClick={() => { onLocate(camera); setOpen(false); }} aria-label={`Locate ${camera.title} on map`}>Locate ↗</button>
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
