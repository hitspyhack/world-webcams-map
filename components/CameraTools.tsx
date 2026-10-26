'use client';

import { useEffect, useState } from 'react';
import type { CamLightboxEntry } from './CamLightbox';
import { cameraContextUrls, hasCoordinates } from '../lib/cameras';
import { buildCapture, downloadBlob } from '../lib/capture';
import { mediaLabel } from '../lib/media';

export default function CameraTools({ entry }: { entry: CamLightboxEntry }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState<'satellite' | 'streetview' | null>(null);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState('');
  const coords = hasCoordinates(entry);
  const links = coords ? cameraContextUrls(entry.lat!, entry.lon!) : null;
  useEffect(() => {
    if (!google || !coords) return;
    const controller = new AbortController();
    setGoogleUrl(null); setGoogleStatus('Loading map configuration…');
    void fetch(`/api/google-view?lat=${entry.lat}&lon=${entry.lon}&mode=${google}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Map configuration unavailable'); return response.json(); })
      .then(json => {
        if (controller.signal.aborted) return;
        if (json.configured && typeof json.url === 'string' && json.url.startsWith('https://www.google.com/maps/embed/v1/')) {
          setGoogleUrl(json.url); setGoogleStatus('Google imagery is geographic context, not live webcam footage. Street View may not be available here.');
        } else setGoogleStatus('Embedded Google view needs GOOGLE_MAPS_EMBED_BROWSER_KEY. Use the Google Maps, Earth, and Street View links below without a key.');
      }).catch(() => { if (!controller.signal.aborted) setGoogleStatus('Google view unavailable. Use the external map links.'); });
    return () => controller.abort();
  }, [google, coords, entry.lat, entry.lon]);

  // Native iOS shell bridge: the shell saves the snapshot to the Photos
  // library and reports back with a result event shown in the status line.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ ok: boolean; message: string }>).detail;
      if (detail && typeof detail.message === 'string') setMessage(detail.message);
    };
    window.addEventListener('world-webcams:saveToPhotos:result', handler);
    return () => window.removeEventListener('world-webcams:saveToPhotos:result', handler);
  }, []);

  // Native iOS shell bridge: results of handing a capture ZIP to the shell
  // (failures surface here; success presents a share/save sheet).
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ ok: boolean; message: string }>).detail;
      if (detail && typeof detail.message === 'string') setMessage(detail.message);
    };
    window.addEventListener('world-webcams:captureZIP:result', handler);
    return () => window.removeEventListener('world-webcams:captureZIP:result', handler);
  }, []);

  type NativeCaptureBridge = { postMessage(message: unknown): void };
  const nativeCaptureBridge = (): NativeCaptureBridge | null => {
    const webkitBridge = (window as unknown as {
      webkit?: { messageHandlers?: { worldWebcamsCameras?: NativeCaptureBridge } };
    }).webkit;
    return webkitBridge?.messageHandlers?.worldWebcamsCameras ?? null;
  };

  const capture = async () => {
    setBusy(true); setMessage('Retrieving image and calculating SHA-256…');
    try {
      const built = await buildCapture(entry, AbortSignal.timeout(20_000));
      const bridge = nativeCaptureBridge();
      if (bridge) {
        // Native shell: WKWebView can't trigger browser downloads, so hand
        // the ZIP over base64-encoded for the share/save sheet.
        const bytes = built.archive;
        let binary = '';
        const chunkSize = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize) as unknown as number[]);
        }
        bridge.postMessage({
          kind: 'captureZIP',
          fileName: built.filename,
          base64: btoa(binary),
        });
        setMessage('Capture ready — choose where to save it.');
      } else {
        downloadBlob(new Blob([built.archive], { type: 'application/zip' }), built.filename);
        setMessage(`Capture ZIP downloaded · SHA-256 ${built.manifest.file.sha256}. Retrieval time is not scene time.`);
      }
    } catch (error) { setMessage(`Capture unavailable: ${error instanceof Error ? error.message : 'Browser or provider restrictions'}. No restrictions are bypassed.`); }
    finally { setBusy(false); }
  };
  return (
    <section className="camera-workspace" aria-label="Camera investigation tools">
      <div className="workspace-meta"><span className="camera-media-indicator">{mediaLabel(entry)}</span>
        {coords && <span>{entry.lat!.toFixed(5)}, {entry.lon!.toFixed(5)} · {entry.positionPrecision ?? 'unspecified'} position</span>}
      </div>
      {entry.description && <p>{entry.description}</p>}
      <div className="workspace-actions">
        {entry.imageUrl && <button disabled={busy} onClick={() => void capture()}>{busy ? 'Capturing…' : 'Capture image + SHA-256 manifest'}</button>}
        {entry.imageUrl && (
          <button onClick={() => {
            window.dispatchEvent(new CustomEvent('world-webcams:saveToPhotos', {
              detail: { imageUrl: entry.imageUrl },
            }));
            setMessage('Saving snapshot to Photos…');
          }}>Save to Photos</button>
        )}
        {typeof navigator.share === 'function' && (
          <button onClick={() => {
            void navigator.share({
              title: entry.title,
              url: entry.linkUrl ?? window.location.href,
            }).catch(() => {});
          }}>Share camera link</button>
        )}
        {links && <>
          <button onClick={() => {
            void navigator.clipboard?.writeText(`${entry.title}\n${entry.lat}, ${entry.lon}\n${entry.linkUrl ?? ''}`)
              .then(() => setMessage('Location and source copied.'))
              .catch(() => setMessage('Clipboard access denied. Copy the displayed coordinates and source link manually.'));
            if (!navigator.clipboard) setMessage('Clipboard unavailable. Copy the displayed coordinates and source link manually.');
          }}>Copy location + source</button>
          <button aria-pressed={google === 'satellite'} onClick={() => setGoogle(google === 'satellite' ? null : 'satellite')}>Google satellite</button>
          <button aria-pressed={google === 'streetview'} onClick={() => setGoogle(google === 'streetview' ? null : 'streetview')}>Google Street View</button>
          <a href={links.googleMaps} target="_blank" rel="noopener noreferrer">Maps ↗</a>
          <a href={links.googleEarth} target="_blank" rel="noopener noreferrer">Earth ↗</a>
          <a href={links.streetView} target="_blank" rel="noopener noreferrer">Street View ↗</a>
        </>}
      </div>
      {google && <div><p role="status">{googleStatus}</p>{googleUrl && <iframe className="google-context-frame" title={`Google ${google} context for ${entry.title}`} src={googleUrl} referrerPolicy="no-referrer-when-downgrade" allowFullScreen />}</div>}
      {message && <p role="status" className="capture-status">{message}</p>}
      <small>Only intentionally public sources. Provider terms apply. Player links and catalog retrieval do not verify a live stream.</small>
    </section>
  );
}
