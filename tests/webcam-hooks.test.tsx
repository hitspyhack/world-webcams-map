import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSkylineWebcams } from '../hooks/useSkylineWebcams';
import { useWindyWebcams } from '../hooks/useWindyWebcams';

const { map, events } = vi.hoisted(() => ({
  map: { getBounds: () => ({ getNorth: () => 50, getEast: () => 10, getSouth: () => 30, getWest: () => -10 }) },
  events: { current: {} as Record<string, () => void> },
}));
vi.mock('react-leaflet', () => ({
  useMap: () => map,
  useMapEvents: (handlers: Record<string, () => void>) => { events.current = handlers; },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const response = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 502, json: async () => data }) as Response;

afterEach(() => vi.useRealTimers());

describe('Skyline requests', () => {
  it('ignores stale results and keeps loading until the latest request completes', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(({ location }) => useSkylineWebcams({ location }), { initialProps: { location: 'Paris' } });
    rerender({ location: 'Lisbon' });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { first.resolve(response([{ title: 'Old camera' }])); });
    expect(result.current.webcams).toEqual([]);
    expect(result.current.loading).toBe(true);
    await act(async () => { second.resolve(response([{ title: 'New camera' }])); });
    expect(result.current.webcams).toEqual([{ title: 'New camera' }]);
    expect(result.current.loading).toBe(false);
  });

  it('cancels on disable and clears results without showing an abort error', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(({ enabled }) => useSkylineWebcams({ enabled }), { initialProps: { enabled: true } });
    rerender({ enabled: false });
    await act(async () => { pending.resolve(response([{ title: 'Late camera' }])); });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(result.current).toMatchObject({ webcams: [], loading: false, error: null });
  });

  it('aborts superseded manual refreshes and cancels on unmount', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = renderHook(() => useSkylineWebcams());
    act(() => { result.current.refetch('Lisbon'); });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ location: 'Lisbon' });
    unmount();
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  });
});

describe('Windy requests', () => {
  it('ignores stale viewport responses and their loading updates', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(({ forceBbox }) => useWindyWebcams({ forceBbox }), { initialProps: { forceBbox: '50,10,30,-10' } });
    rerender({ forceBbox: '40,0,30,-10' });
    await act(async () => { first.resolve(response({ webcams: [{ id: 'old' }] })); });
    expect(result.current.webcams).toEqual([]);
    expect(result.current.loading).toBe(true);
    await act(async () => { second.resolve(response({ webcams: [{ id: 'new' }] })); });
    expect(result.current.webcams).toEqual([{ id: 'new' }]);
    expect(result.current.loading).toBe(false);
  });

  it('debounces viewport events and aborts as soon as a new viewport is scheduled', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderHook(() => useWindyWebcams());
    act(() => { events.current.moveend(); events.current.zoomend(); });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(599); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => events.current.moveend());
    unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cancels pending debounce when a fixed country bbox is selected', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = renderHook(({ forceBbox }: { forceBbox: string | null }) => useWindyWebcams({ forceBbox }), { initialProps: { forceBbox: null as string | null } });
    act(() => events.current.moveend());
    rerender({ forceBbox: '40,0,30,-10' });
    act(() => events.current.moveend());
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('bbox=40%2C0%2C30%2C-10');
  });

  it('cancels on disable and does not allow late data to repopulate the layer', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(({ enabled }) => useWindyWebcams({ enabled }), { initialProps: { enabled: true } });
    rerender({ enabled: false });
    await act(async () => { pending.resolve(response({ webcams: [{ id: 'late' }] })); });
    expect(result.current).toMatchObject({ webcams: [], loading: false, error: null });
    act(() => events.current.moveend());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops requesting when the server reports a missing API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ missingKey: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(({ enabled }) => useWindyWebcams({ enabled }), { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.missingKey).toBe(true));
    rerender({ enabled: false });
    rerender({ enabled: true });
    act(() => events.current.moveend());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('surfaces real API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Provider unavailable' }, false)));
    const { result } = renderHook(() => useWindyWebcams());
    await waitFor(() => expect(result.current.error).toBe('Provider unavailable'));
    expect(result.current.loading).toBe(false);
  });
});
