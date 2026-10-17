import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CameraExplorer from '../components/CameraExplorer';
import { FEEDS, type FeedState, type FeedStates } from '../hooks/useWebcamFeeds';

const cameras = [
  { title: 'São Paulo skyline', lat: -23, lon: -46, color: '#aabbcc', source: 'earthcam' },
  { title: 'Lisbon river', lat: 38, lon: -9, color: '#aabbcc', source: 'osm' },
];
const feeds = Object.fromEntries(Object.keys(FEEDS).map(key => [key, { data: [], status: 'ready' } as FeedState])) as FeedStates;
const storageKey = 'world-webcams:saved:v1';
function setup(cameraList = cameras) {
  const onOpen = vi.fn();
  const onLocate = vi.fn();
  const onRefresh = vi.fn();
  const view = render(<CameraExplorer cameras={cameraList} feeds={feeds} onOpen={onOpen} onLocate={onLocate} onRefresh={onRefresh} />);
  return { user: userEvent.setup(), onOpen, onLocate, onRefresh, ...view };
}
beforeEach(() => localStorage.clear());

describe('camera explorer', () => {
  it('searches accent-insensitively and opens a random matching view', async () => {
    const { user, onOpen } = setup();
    await user.click(screen.getByRole('button', { name: /Explore cameras/ }));
    await user.type(screen.getByRole('searchbox'), 'sao');
    expect(screen.queryByRole('button', { name: 'Lisbon river' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Surprise me/ }));
    expect(onOpen).toHaveBeenCalledWith(cameras[0]);
  });
  it('filters cameras around geographic coordinates', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Explore cameras/ }));
    await user.type(screen.getByLabelText('Latitude'), '38');
    await user.type(screen.getByLabelText('Longitude'), '-9');
    expect(screen.getByRole('button', { name: 'Lisbon river' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'São Paulo skyline' })).not.toBeInTheDocument();
  });
  it('creates and saves cameras into named local collections', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Explore cameras/ }));
    await user.type(screen.getByLabelText('New collection name'), 'Coast');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await user.click(screen.getByRole('button', { name: 'Save Lisbon river' }));
    await user.click(screen.getByRole('button', { name: 'Saved (1)' }));
    expect(screen.getByRole('button', { name: 'Lisbon river' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(storageKey)!)[0]).toMatchObject({ collection: 'Coast' });
    expect(JSON.parse(localStorage.getItem('world-webcams:collections:v1')!)).toContain('Coast');
  });
  it('does not proxy snapshot downloads when the provider blocks browser access', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('CORS blocked'));
    vi.stubGlobal('fetch', fetchMock);
    const snapshotCamera = { ...cameras[0], imageUrl: 'https://camera.example/snapshot.jpg' };
    const { user } = setup([snapshotCamera]);
    await user.click(screen.getByRole('button', { name: /Explore cameras/ }));
    await user.click(screen.getByRole('button', { name: 'Download timestamped snapshot of São Paulo skyline' }));
    expect(fetchMock).toHaveBeenCalledWith('https://camera.example/snapshot.jpg', { mode: 'cors', credentials: 'omit' });
    expect(await screen.findByText(/provider may block browser capture/)).toBeInTheDocument();
  });
  it('saves across remounts and allows removal', async () => {
    const first = setup();
    await first.user.click(screen.getByRole('button', { name: /Explore cameras/ }));
    await first.user.click(screen.getByRole('button', { name: 'Save Lisbon river' }));
    first.unmount();
    const second = setup();
    await second.user.click(screen.getByRole('button', { name: /Explore cameras/ }));
    await second.user.click(screen.getByRole('button', { name: 'Saved (1)' }));
    expect(screen.getByRole('button', { name: 'Lisbon river' })).toBeInTheDocument();
    await second.user.click(screen.getByRole('button', { name: 'Unsave Lisbon river' }));
    expect(screen.getByText(/Your next favorite view/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([]);
  });
  it('locates cameras and closes the explorer to reveal the map', async () => {
    const { user, onLocate } = setup();
    await user.click(screen.getByRole('button', { name: /Explore cameras/ }));
    await user.click(screen.getByRole('button', { name: 'Locate Lisbon river on map' }));
    expect(onLocate).toHaveBeenCalledWith(cameras[1]);
    expect(screen.getByRole('button', { name: /Explore cameras/ })).toHaveAttribute('aria-expanded', 'false');
  });
  it('provides source-specific refresh and exposes missing configuration', async () => {
    const { user, onRefresh, rerender } = setup();
    rerender(<CameraExplorer cameras={[]} feeds={{ ...feeds, windy: { data: [], status: 'unconfigured' } }} onOpen={vi.fn()} onLocate={vi.fn()} onRefresh={onRefresh} />);
    await user.click(screen.getByRole('button', { name: /Explore cameras/ }));
    await user.click(screen.getByRole('button', { name: 'Sources' }));
    expect(screen.getByText('API key not configured')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh Windy' }));
    expect(onRefresh).toHaveBeenCalledWith('windy');
  });
  it('syncs saved cameras when another tab updates local storage', async () => {
    const { user } = setup();
    fireEvent(window, new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify([cameras[0]]) }));
    await user.click(screen.getByRole('button', { name: /Explore cameras/ }));
    expect(screen.getByRole('button', { name: 'Saved (1)' })).toBeInTheDocument();
  });
  it('keeps a session copy if browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Explore cameras/ }));
    await user.click(screen.getByRole('button', { name: 'Save Lisbon river' }));
    expect(screen.getByText(/Saved cameras will last for this session/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saved (1)' })).toBeInTheDocument();
  });
});
