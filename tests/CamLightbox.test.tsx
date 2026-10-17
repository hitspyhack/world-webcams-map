import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CamLightbox from '../components/CamLightbox';

const entry = { source: 'earthcam', title: 'Lisbon', imageUrl: 'https://example.com/cam.jpg', linkUrl: 'https://example.com' };

describe('webcam viewer', () => {
  it('opens a native modal, focuses close, locks scrolling, and restores focus', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    document.body.style.overflow = 'auto';
    const { rerender } = render(<CamLightbox entry={entry} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Close lightbox' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<CamLightbox entry={null} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('auto');
    expect(trigger).toHaveFocus();
    trigger.remove();
    document.body.style.overflow = '';
  });

  it('handles native Escape cancellation, backdrop clicks, and close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CamLightbox entry={entry} onClose={onClose} />);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await user.click(screen.getByRole('img'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('dialog'));
    await user.click(screen.getByRole('button', { name: 'Close lightbox' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('shows an actionable snapshot error and retries loading', async () => {
    render(<CamLightbox entry={entry} onClose={vi.fn()} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('status')).toHaveTextContent('Snapshot unavailable');
    expect(screen.getByRole('link', { name: /Open source/ })).toHaveAttribute('href', entry.linkUrl);
    await userEvent.click(screen.getByRole('button', { name: 'Retry snapshot' }));
    expect(screen.getByRole('img')).toHaveAttribute('src', entry.imageUrl);
  });

  it('resets snapshot errors when a different camera opens', () => {
    const { rerender } = render(<CamLightbox entry={entry} onClose={vi.fn()} />);
    fireEvent.error(screen.getByRole('img'));
    rerender(<CamLightbox entry={{ ...entry, imageUrl: 'https://example.com/other.jpg' }} onClose={vi.fn()} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('lets users switch from a blocked player to its snapshot', async () => {
    render(<CamLightbox entry={{ ...entry, embedUrl: 'https://example.com/player' }} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show snapshot' }));
    expect(screen.getByRole('img')).toHaveAttribute('src', entry.imageUrl);
    expect(screen.queryByTitle('Lisbon')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show player' }));
    expect(screen.getByTitle('Lisbon')).toBeInTheDocument();
  });

  it('prefers the embedded player and explains the provider fallback', () => {
    render(<CamLightbox entry={{ ...entry, embedUrl: 'https://example.com/player' }} onClose={vi.fn()} />);
    expect(screen.getByTitle('Lisbon')).toHaveAttribute('src', 'https://example.com/player');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/Feed not playing/)).toBeInTheDocument();
  });
});
