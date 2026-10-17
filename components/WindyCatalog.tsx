'use client';

import { useEffect, useRef, useState } from 'react';
import { WINDY_REGIONS } from '../lib/windy';
import type { WindyWebcam } from '../types/webcam';

export default function WindyCatalog({ onBatch }: { onBatch: (cameras: WindyWebcam[]) => void }) {
  const [region, setRegion] = useState<keyof typeof WINDY_REGIONS>('world');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');
  const [offset, setOffset] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Load up to 50 cameras at a time. Each click uses one API request unless cached.');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const reset = () => {
    request.current?.abort(); setBusy(false); setOffset(0);
    setMessage('Query changed. Load the first page. Previously discovered cameras remain in your catalog.');
  };
  const load = async () => {
    if (offset === null || busy) return;
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    setBusy(true); setMessage('Querying Windy…');
    const query = new URLSearchParams({ bbox: WINDY_REGIONS[region].bbox, limit: '50', offset: String(offset) });
    if (country.trim()) query.set('countries', country.trim().toUpperCase());
    if (category) query.set('categories', category);
    try {
      const response = await fetch(`/api/windy-webcams?${query}`, { signal: controller.signal });
      const json = await response.json();
      if (controller.signal.aborted) return;
      if (json.missingKey) { setMessage('Windy requires WINDY_WEBCAMS_API_KEY on the server. Other public sources remain available.'); return; }
      if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
      if (!Array.isArray(json.webcams)) throw new Error('Unexpected provider response');
      onBatch(json.webcams);
      setOffset(typeof json.nextOffset === 'number' ? json.nextOffset : null);
      setMessage(`${json.webcams.length} cameras received${typeof json.total === 'number' ? ` · ${json.total.toLocaleString()} reported for this query` : ''}. ${json.nextOffset === null ? 'End of available pages.' : 'Load the next page to discover more.'}`);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Unable to load Windy.');
    } finally { if (request.current === controller) setBusy(false); }
  };
  return (
    <section className="windy-catalog" aria-label="Windy discovery">
      <h3>Windy worldwide catalog</h3>
      <p className="explorer-hint">Regional paging avoids limiting the globe to a single worldwide page. Access, offsets, categories, and coverage depend on your Windy plan.</p>
      <label>Region<select value={region} onChange={event => { reset(); setRegion(event.target.value as keyof typeof WINDY_REGIONS); }}>
        {Object.entries(WINDY_REGIONS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
      </select></label>
      <label>Country code (optional)<input placeholder="PT" maxLength={2} value={country} onChange={event => { reset(); setCountry(event.target.value); }} /></label>
      <label>Category<select value={category} onChange={event => { reset(); setCategory(event.target.value); }}>
        <option value="">All categories</option>
        {['beach', 'city', 'landscape', 'mountain', 'traffic', 'water', 'airport'].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <button className="explorer-secondary" disabled={busy || offset === null} onClick={() => void load()}>{busy ? 'Loading…' : offset === 0 ? 'Load 50 Windy cameras' : offset === null ? 'All pages loaded' : 'Load next 50 cameras'}</button>
      <button className="explorer-secondary" disabled={busy} onClick={reset}>Reset paging</button>
      <p role="status" className="explorer-hint">{message}</p>
      <a href="https://www.windy.com/webcams" target="_blank" rel="noopener noreferrer">Webcams provided by windy.com ↗</a>
    </section>
  );
}
