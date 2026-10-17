import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEEDS, FEED_TIMEOUT_MS, useWebcamFeeds } from '../hooks/useWebcamFeeds';

const jsonResponse = (data: unknown, status = 200) => ({ ok: status === 200, status, json: async () => data }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => vi.useRealTimers());

describe('progressive source loading', () => {
  it('publishes fast sources while slow sources remain pending', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => url === FEEDS.earthcam.url
      ? Promise.resolve(jsonResponse([{ title: 'Lisbon' }])) : new Promise(() => {})));
    const { result } = renderHook(() => useWebcamFeeds());
    await waitFor(() => expect(result.current.feeds.earthcam.status).toBe('ready'));
    expect(result.current.feeds.earthcam.data).toEqual([{ title: 'Lisbon' }]);
    expect(result.current.feeds.osm.status).toBe('loading');
    expect(result.current.loading).toBe(true);
  });

  it('reports timeouts and finishes loading rather than hanging forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const { result } = renderHook(() => useWebcamFeeds());
    await act(async () => { await vi.advanceTimersByTimeAsync(FEED_TIMEOUT_MS); });
    expect(result.current.feeds.osm).toMatchObject({ status: 'error', error: 'Request timed out. Try again.' });
    expect(result.current.loading).toBe(false);
  });

  it('aborts superseded refreshes and ignores their late responses', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    let earthRequests = 0;
    const fetchMock = vi.fn((url: string) => url === FEEDS.earthcam.url
      ? (++earthRequests === 1 ? first.promise : second.promise) : Promise.resolve(jsonResponse([])));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useWebcamFeeds());
    act(() => result.current.refresh('earthcam'));
    expect(fetchMock.mock.calls.filter(([url]) => url === FEEDS.earthcam.url)).toHaveLength(2);
    await act(async () => { second.resolve(jsonResponse(['new'])); });
    await act(async () => { first.resolve(jsonResponse(['old'])); });
    expect(result.current.feeds.earthcam.data).toEqual(['new']);
    expect(result.current.feeds.earthcam.status).toBe('ready');
  });

  it('preserves previously loaded cameras when a refresh fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(['camera']));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useWebcamFeeds());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const updatedAt = result.current.feeds.earthcam.updatedAt;
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));
    act(() => result.current.refresh('earthcam'));
    await waitFor(() => expect(result.current.feeds.earthcam.status).toBe('error'));
    expect(result.current.feeds.earthcam).toMatchObject({ data: ['camera'], updatedAt, error: 'Provider returned HTTP 503' });
  });

  it('distinguishes missing configuration, empty feeds, and malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(jsonResponse(
      url === FEEDS.windy.url ? { missingKey: true } : url === FEEDS.osm.url ? { unexpected: true } : [],
    ))));
    const { result } = renderHook(() => useWebcamFeeds());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.feeds.windy.status).toBe('unconfigured');
    expect(result.current.feeds.osm.status).toBe('error');
    expect(result.current.feeds.earthcam).toMatchObject({ status: 'ready', data: [] });
  });

  it('cleans up pending requests on unmount', () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
      signals.push(options.signal!);
      return new Promise(() => {});
    }));
    const { unmount } = renderHook(() => useWebcamFeeds());
    unmount();
    expect(signals).toHaveLength(Object.keys(FEEDS).length);
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });
});
