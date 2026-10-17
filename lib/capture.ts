import { zipSync, strToU8 } from 'fflate';
import { isPublicWebUrl, timestampedCaptureFilename } from './cameras';

export interface CaptureTarget {
  title: string; source?: string; imageUrl?: string; linkUrl?: string;
  lat?: number; lon?: number; captureAt?: string; positionPrecision?: string;
}
const MAX_BYTES = 20 * 1024 * 1024;

/** Client-only, direct CORS capture. Deliberately not an arbitrary-URL server proxy. */
export async function buildCapture(target: CaptureTarget, signal?: AbortSignal) {
  if (!isPublicWebUrl(target.imageUrl)) throw new Error('No public snapshot URL is available.');
  const response = await fetch(target.imageUrl, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal });
  if (!response.ok) throw new Error('Provider refused the image request.');
  const mime = response.headers.get('content-type')?.split(';')[0].toLowerCase();
  if (!mime || !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Capture supports JPEG, PNG, and WebP snapshots only.');
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Snapshot exceeds the 20 MB capture limit.');
  if (!response.body) throw new Error('Snapshot has no readable body.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw new Error('Snapshot exceeds the 20 MB capture limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const valid = mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/png' ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!valid) throw new Error('The downloaded bytes are not a supported image.');
  if (!crypto.subtle) throw new Error('Capture hashing requires a secure browser context (HTTPS).');
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  const retrievedAt = new Date().toISOString();
  const filename = timestampedCaptureFilename(target, new Date(retrievedAt), mime);
  const manifest = {
    schema: 'world-webcams-capture/v1', title: target.title, source: target.source ?? 'unknown',
    sourceUrl: target.linkUrl ?? null, requestedImageUrl: target.imageUrl,
    retrievedAt, providerCaptureAt: target.captureAt ?? null,
    coordinates: typeof target.lat === 'number' && typeof target.lon === 'number' ? { latitude: target.lat, longitude: target.lon, precision: target.positionPrecision ?? 'unspecified' } : null,
    file: { name: filename, mimeType: mime, bytes: length, sha256 },
    note: 'Retrieved directly from the provider by this browser. Retrieval time is not proof of scene time or authenticity. SHA-256 identifies these bytes only. Respect provider terms and attribution.',
  };
  const archive = zipSync({ [filename]: bytes, 'manifest.json': strToU8(JSON.stringify(manifest, null, 2)) }, { level: 0 });
  return { archive, manifest, filename: filename.replace(/\.[^.]+$/, '.zip') };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCapture(target: CaptureTarget, signal?: AbortSignal) {
  const capture = await buildCapture(target, signal);
  downloadBlob(new Blob([capture.archive], { type: 'application/zip' }), capture.filename);
  return capture.manifest;
}
