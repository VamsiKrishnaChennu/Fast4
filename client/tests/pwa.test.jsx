import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ErrorBoundary from '../src/components/common/ErrorBoundary.jsx';
import OfflineBanner from '../src/components/common/OfflineBanner.jsx';
import { useWakeLock } from '../src/hooks/useWakeLock.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete navigator.wakeLock;
});

function fakeWakeLock() {
  const locks = [];
  navigator.wakeLock = {
    request: vi.fn(async () => {
      const lock = { released: false, release: vi.fn(async () => (lock.released = true)) };
      locks.push(lock);
      return lock;
    }),
  };
  return locks;
}

describe('wake lock', () => {
  test('is taken while active and released afterwards', async () => {
    const locks = fakeWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(locks).toHaveLength(1));
    unmount();
    expect(locks[0].release).toHaveBeenCalled();
  });

  test('is taken again when the player comes back to the tab', async () => {
    const locks = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(locks).toHaveLength(1));
    locks[0].released = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await vi.waitFor(() => expect(locks).toHaveLength(2));
  });

  test('does nothing when inactive, unsupported or refused', async () => {
    const locks = fakeWakeLock();
    renderHook(() => useWakeLock(false));
    expect(locks).toHaveLength(0);
    delete navigator.wakeLock;
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    navigator.wakeLock = { request: vi.fn(async () => Promise.reject(new Error('no'))) };
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await vi.waitFor(() => expect(navigator.wakeLock.request).toHaveBeenCalled());
  });
});

describe('offline banner', () => {
  test('appears when the browser goes offline and goes away when it is back', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('You are offline');
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('error boundary', () => {
  test('shows a reload screen instead of a blank page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const Boom = () => {
      throw new Error('boom');
    };
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }));
    expect(assign).toHaveBeenCalledWith('/');
    vi.unstubAllGlobals();
  });

  test('renders its children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
