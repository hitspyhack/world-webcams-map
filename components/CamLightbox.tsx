'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CameraTools from './CameraTools';
import VideoPreview from './VideoPreview';
import { mediaLabel } from '../lib/media';
import type { GlobeCam } from './GlobeView';

export interface CamLightboxEntry extends Partial<Pick<GlobeCam, 'lat' | 'lon' | 'positionPrecision' | 'description' | 'mediaKind' | 'videoUrl'>> {
  source: string;      // 'windy' | 'skyline' | 'earthcam' | 'osm' | 'deckchair' | 'eu' | 'asia'
  title: string;
  embedUrl?: string;   // iframe src — Windy player, EarthCam, Deckchair, EU/Asia sourceUrl
  imageUrl?: string;   // full-size static image — Skyline snapshot, EU/Asia imageUrl
  linkUrl?: string;    // external link fallback
  linkLabel?: string;
  captureAt?: string;
}

const SOURCE_COLORS: Record<string, string> = {
  global: '#2dd4bf',
  windy:     '#60a5fa',
  skyline:   '#f87171',
  earthcam:  '#fb923c',
  osm:       '#4ade80',
  deckchair: '#c084fc',
  eu:        '#818cf8',
  asia:      '#fbbf24',
};

interface Props {
  entry: CamLightboxEntry | null;
  onClose: () => void;
}

export default function CamLightbox({ entry, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const isOpen = !!entry;
  const [snapshotEntry, setSnapshotEntry] = useState<CamLightboxEntry | null>(null);

  // Native modal dialogs make the background inert and contain keyboard focus,
  // including when the webcam is a cross-origin iframe.
  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    closeBtnRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!entry) return null;

  const accentColor = SOURCE_COLORS[entry.source] ?? '#8b949e';
  const sourceLabel = entry.source.toUpperCase();

  const hasVideo = !!entry.videoUrl && snapshotEntry !== entry;
  const hasEmbed = !!entry.embedUrl && snapshotEntry !== entry && !hasVideo;
  const hasImage = !!entry.imageUrl;

  const content = (
    <dialog
      ref={dialogRef}
      onCancel={e => { e.preventDefault(); onClose(); }}
      aria-modal="true"
      aria-label={`Webcam workspace: ${entry.title}`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        margin: 0, border: 0, width: '100%', height: '100%',
        maxWidth: 'none', maxHeight: 'none', color: '#e6edf3',
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px 16px',
        animation: 'lb-fade-in 0.18s ease',
      }}
    >
      {/* ── Modal card ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'rgba(13,17,23,0.98)',
          border: `1px solid ${accentColor}55`,
          borderRadius: 14,
          boxShadow: `0 0 0 1px ${accentColor}22, 0 24px 64px rgba(0,0,0,0.8)`,
          width: '100%',
          maxWidth: 860,
          maxHeight: 'calc(100dvh - 64px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'lb-slide-up 0.22s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px 10px',
          borderBottom: '1px solid #21262d',
          background: 'rgba(22,27,34,0.95)',
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
            color: accentColor, fontFamily: 'monospace',
            background: `${accentColor}18`, border: `1px solid ${accentColor}40`,
            borderRadius: 4, padding: '2px 6px', flexShrink: 0,
          }}>{sourceLabel}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#9fb0ba', maxWidth: 125 }}>{mediaLabel(entry)}</span>
          <span style={{
            flex: 1, fontSize: 14, fontWeight: 600,
            color: '#e6edf3', fontFamily: 'system-ui',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{entry.title}</span>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close lightbox"
            style={{
              background: 'rgba(48,54,61,0.7)', border: '1px solid #30363d',
              color: '#8b949e', borderRadius: 7, width: 30, height: 30,
              fontSize: 16, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f8717130'; e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(48,54,61,0.7)'; e.currentTarget.style.color = '#8b949e'; }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ position: 'relative', flexGrow: 1, overflowY: 'auto', minHeight: 0 }}>
          {hasVideo && <VideoPreview src={entry.videoUrl!} title={entry.title} />}
          {hasEmbed && (
            <div style={{ position: 'relative', paddingBottom: '56.25%' /* 16:9 */ }}>
              <iframe
                src={entry.embedUrl}
                title={entry.title}
                allow="autoplay; fullscreen; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  border: 'none', background: '#0d1117',
                }}
              />
            </div>
          )}

          {!hasVideo && !hasEmbed && hasImage && (
            <ImagePreview key={entry.imageUrl} src={entry.imageUrl!} title={entry.title} />
          )}

          {!hasVideo && !hasEmbed && !hasImage && (
            <div style={{
              padding: '40px 24px', textAlign: 'center',
              color: '#8b949e', fontFamily: 'system-ui', fontSize: 14,
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔗</div>
              <div>No embeddable content available for this source.</div>
            </div>
          )}
          <CameraTools key={`${entry.source}-${entry.title}-${entry.lat}-${entry.lon}`} entry={entry} />
        </div>

        {/* Footer */}
        {(entry.linkUrl || ((entry.embedUrl || entry.videoUrl) && entry.imageUrl) || entry.captureAt) && (
          <div style={{
            padding: '8px 16px',
            borderTop: '1px solid #21262d',
            background: 'rgba(22,27,34,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            flexShrink: 0, gap: 12, flexWrap: 'wrap',
          }}>
            {hasEmbed && <span style={{ flex: 1, fontSize: 11, color: '#8b949e' }}>Feed not playing? The provider may require opening its website.</span>}
            {entry.captureAt && Number.isFinite(Date.parse(entry.captureAt)) && <span style={{ flex: 1, fontSize: 10, color: '#8b949e' }}>Provider capture: {new Date(entry.captureAt).toLocaleString()}</span>}
            {(entry.embedUrl || entry.videoUrl) && entry.imageUrl && (
              <button type="button" className="explorer-secondary" onClick={() => setSnapshotEntry(hasEmbed || hasVideo ? entry : null)}>
                {hasEmbed || hasVideo ? 'Show snapshot' : 'Show player'}
              </button>
            )}
            {entry.linkUrl && <a
              href={entry.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12, color: accentColor,
                textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {entry.linkLabel ?? 'Open source'} ↗
            </a>}
          </div>
        )}
      </div>

      {/* Dismiss hint */}
      <div style={{
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace',
        pointerEvents: 'none', letterSpacing: '0.06em',
      }}>ESC or click outside to close</div>

      <style>{`
        @keyframes lb-fade-in  { from { opacity:0 } to { opacity:1 } }
        @keyframes lb-slide-up { from { opacity:0; transform:translateY(18px) scale(0.97) } to { opacity:1; transform:none } }
      `}</style>
    </dialog>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(content, document.body);
}

function ImagePreview({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [auto, setAuto] = useState(false);
  const [received, setReceived] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState('');
  const objectUrl = useRef<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const refresh = async () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Not an image');
      if (Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('Too large');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (blob.size > 20 * 1024 * 1024) throw new Error('Too large');
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setCurrentSrc(objectUrl.current); setFailed(false); setRefreshMessage('Snapshot re-requested. Scene freshness depends on the provider.');
    } catch { if (!controller.signal.aborted) { setAuto(false); setRefreshMessage('Browser refresh is blocked or unavailable. The existing preview may be cached. Use the provider website.'); } }
    finally { clearTimeout(timer); }
  };
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => { if (!document.hidden) void refreshRef.current(); }, 30_000);
    return () => clearInterval(timer);
  }, [auto]);
  useEffect(() => () => { active.current?.abort(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  return (
    <div style={{ background: '#0d1117', minHeight: 220, display: 'grid', placeItems: 'center' }}>
      <div className="snapshot-controls"><button onClick={() => void refresh()}>Refresh snapshot</button><label><input type="checkbox" checked={auto} onChange={event => setAuto(event.target.checked)} /> Refresh every 30s</label></div>
      {failed ? (
        <div role="status" style={{ padding: 24, textAlign: 'center', fontFamily: 'system-ui', color: '#8b949e' }}>
          <p>Snapshot unavailable. Try again, or use the source link if available.</p>
          <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}
            style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #30363d', background: '#21262d', color: '#e6edf3', cursor: 'pointer' }}>
            Retry snapshot
          </button>
        </div>
      ) : (
        <img key={attempt} src={currentSrc} alt={title} onLoad={() => setReceived(new Date().toISOString())} onError={() => setFailed(true)}
          style={{ maxWidth: '100%', maxHeight: '65dvh', objectFit: 'contain', display: 'block' }} />
      )}
      {received && <small className="snapshot-observation">Image received by browser: {received}. Not a verified scene timestamp.</small>}
      {refreshMessage && <p role="status" className="snapshot-observation">{refreshMessage}</p>}
    </div>
  );
}
