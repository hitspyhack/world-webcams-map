import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CameraTools from '../components/CameraTools';
import WindyCatalog from '../components/WindyCatalog';
import CameraExplorer from '../components/CameraExplorer';
import { FEEDS, type FeedState, type FeedStates } from '../hooks/useWebcamFeeds';

const camera = { webcamId: '42', location: { latitude: 0, longitude: 0 }, title: 'Harbour' };
const response = (data: unknown) => ({ ok: true, json: async () => data });

describe('Windy catalog controls', () => {
  it('loads the next page and resets offsets when the query changes', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ webcams: [camera], nextOffset: 50, total: 100 }))
      .mockResolvedValueOnce(response({ webcams: [camera], nextOffset: null, total: 100 }));
    vi.stubGlobal('fetch', fetchMock);
    const onBatch = vi.fn(); render(<WindyCatalog onBatch={onBatch} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load 50 Windy cameras' }));
    expect(onBatch).toHaveBeenCalledWith([camera]);
    await user.click(screen.getByRole('button', { name: 'Load next 50 cameras' }));
    expect(fetchMock.mock.calls[1][0]).toContain('offset=50');
    expect(screen.getByRole('button', { name: 'All pages loaded' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Region'), 'africa');
    expect(screen.getByRole('button', { name: 'Load 50 Windy cameras' })).toBeEnabled();
  });
  it('shows a configuration hint rather than inventing Windy data without a key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ missingKey: true })));
    const onBatch = vi.fn(); render(<WindyCatalog onBatch={onBatch} />);
    await userEvent.click(screen.getByRole('button', { name: 'Load 50 Windy cameras' }));
    expect(screen.getByRole('status')).toHaveTextContent('WINDY_WEBCAMS_API_KEY');
    expect(onBatch).not.toHaveBeenCalled();
  });
});

describe('Google geographic context', () => {
  it('provides no-key context links and explains the optional embed key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ configured: false })));
    render(<CameraTools entry={{ source: 'global', title: 'Polar webcam', lat: -90, lon: 0 }} />);
    expect(screen.getByRole('link', { name: /Earth/ })).toHaveAttribute('href', expect.stringContaining('earth.google.com'));
    await userEvent.click(screen.getByRole('button', { name: 'Google satellite' }));
    expect(await screen.findByRole('status')).toHaveTextContent('GOOGLE_MAPS_EMBED_BROWSER_KEY');
    expect(screen.queryByTitle(/Google satellite context/)).not.toBeInTheDocument();
  });
  it('only embeds official configured Google map URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ configured: true, url: 'https://untrusted.example/' })));
    render(<CameraTools entry={{ source: 'global', title: 'Harbour', lat: 0, lon: 0 }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Google Street View' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Embedded Google view needs');
    expect(screen.queryByTitle(/Google streetview context/)).not.toBeInTheDocument();
  });
});

describe('discovery media filters', () => {
  it('does not classify timelapses, snapshots, or directories as provider-reported live', async () => {
    const feeds = Object.fromEntries(Object.keys(FEEDS).map(key => [key, { data: [], status: 'ready' } as FeedState])) as FeedStates;
    render(<CameraExplorer feeds={feeds} onRefresh={vi.fn()} onLocate={vi.fn()} onOpen={vi.fn()} cameras={[
      { title: 'Live harbour', lat: 0, lon: 0, color: '#123456', mediaKind: 'live' },
      { title: 'Daily timelapse', lat: 0, lon: 0, color: '#123456', mediaKind: 'timelapse' },
      { title: 'Regional directory', lat: 0, lon: 0, color: '#123456', mediaKind: 'directory' },
    ]} />);
    await userEvent.click(screen.getByRole('button', { name: /Explore cameras/ }));
    fireEvent.change(screen.getByLabelText('Media'), { target: { value: 'live' } });
    expect(screen.getByRole('button', { name: 'Live harbour' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Daily timelapse' })).not.toBeInTheDocument();
  });
});
