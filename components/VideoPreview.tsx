'use client';

import { useEffect, useRef, useState } from 'react';

export default function VideoPreview({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError(false);
    if (/\.m3u8(?:[?#]|$)/i.test(src) && !video.canPlayType('application/vnd.apple.mpegurl')) {
      void import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { setError(true); return; }
        const hls = new Hls({ autoStartLoad: false, maxBufferLength: 30 });
        hls.loadSource(src); hls.attachMedia(video);
        const start = () => hls.startLoad();
        video.addEventListener('play', start);
        hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) { setError(true); hls.destroy(); } });
        destroy = () => { video.removeEventListener('play', start); hls.destroy(); };
      }).catch(() => { if (!cancelled) setError(true); });
    } else video.src = src;
    return () => { cancelled = true; destroy?.(); video.pause(); video.removeAttribute('src'); video.load(); };
  }, [src]);
  return <div className="video-preview"><video ref={ref} controls playsInline preload="none" aria-label={title} onError={() => setError(true)} />
    {error && <p role="status">Video unavailable. This stream may be offline, unsupported, or blocked by its provider. Try the source website.</p>}
  </div>;
}
