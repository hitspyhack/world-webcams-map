import { NextResponse } from 'next/server';

/** Call local providers directly, not through a request Host or a public URL. */
export async function aggregateCameras(request: Request, providers: Record<string, () => Promise<Response>>) {
  const raw = new URL(request.url).searchParams.get('countries');
  const wanted = [...new Set(raw === null ? Object.keys(providers) : raw.toUpperCase().split(',').map(value => value.trim()))]
    .filter(key => Object.hasOwn(providers, key));
  if (!wanted.length) return NextResponse.json({ error: 'No supported country codes were requested.' }, { status: 400 });

  const settled = await Promise.allSettled(wanted.map(async key => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        providers[key](),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Provider timed out')), 30_000); }),
      ]);
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid provider response');
      return data.filter(item => item && typeof item === 'object').map(item => ({ ...item, sourceCountry: key }));
    } finally { clearTimeout(timer); }
  }));
  const failed = wanted.filter((_key, index) => settled[index].status === 'rejected');
  if (failed.length === wanted.length) return NextResponse.json({ error: 'Traffic providers are unavailable. Try again later.' }, { status: 502 });
  return NextResponse.json(settled.flatMap(result => result.status === 'fulfilled' ? result.value : []), {
    headers: failed.length ? { 'X-Webcam-Failed-Countries': failed.join(',') } : {},
  });
}
