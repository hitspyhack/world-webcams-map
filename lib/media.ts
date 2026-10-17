import type { GlobeCam } from '../components/GlobeView';

export function videoUrl(url?: string): string | undefined {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return;
    if (/\.(m3u8|mp4|webm)$/i.test(parsed.pathname)) return url;
  } catch { /* not a URL */ }
}
export function mediaLabel(camera: Pick<GlobeCam, 'mediaKind' | 'imageUrl' | 'embedUrl' | 'videoUrl'>): string {
  if (camera.mediaKind === 'directory') return 'DIRECTORY';
  if (camera.mediaKind === 'live') return 'LIVE · PROVIDER REPORTED';
  if (camera.mediaKind === 'timelapse') return 'TIMELAPSE';
  if (camera.videoUrl) return 'VIDEO / HLS';
  if (camera.embedUrl) return 'PLAYER LINK';
  return camera.imageUrl ? 'SNAPSHOT' : 'SOURCE LINK';
}
