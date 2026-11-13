import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setSessionHint } from '../src/api/axiosClient.js';
import { apiError, installFakeServer, sampleUser } from './helpers/fakeServer.js';
import { createFakeSocket, sampleRoom, samplePlayer } from './helpers/fakeSocket.js';
import { renderApp } from './helpers/renderApp.jsx';

const meta = () => ({ data: { data: { appVersion: '1', supportEmail: 'help@fastfour.test' } } });
const authed = (extra = {}) => ({
  'GET /meta/config': meta,
  'POST /auth/refresh': () => ({ data: { accessToken: 'tok' } }),
  'GET /auth/me': () => ({ data: { user: sampleUser({ id: 'u1', nickname: 'Maya' }) } }),
  'GET /blocks': () => ({ data: { blocks: [] } }),
  'GET /users/me/games': () => ({ data: { games: [], nextCursor: null } }),
  ...extra,
});

beforeEach(() => setSessionHint(false));
afterEach(() => vi.restoreAllMocks());

describe('public legal pages', () => {
  test('the privacy policy opens without logging in and names the contact', async () => {
    installFakeServer({ 'GET /meta/config': meta });
    renderApp('/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    const doc = screen.getByTestId('privacy');
    expect(within(doc).getByRole('heading', { name: 'What we collect and why' })).toBeVisible();
    expect(
      within(doc).getByRole('heading', { name: 'Deleting your account and data' }),
    ).toBeVisible();
    expect(doc).toHaveTextContent('help@fastfour.test');
    expect(doc).toHaveTextContent('13 and over');
  });

  test('the terms open without logging in', async () => {
    installFakeServer({ 'GET /meta/config': meta });
    renderApp('/terms');
    expect(await screen.findByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
    expect(
      within(screen.getByTestId('terms')).getByRole('heading', { name: 'Community rules' }),
    ).toBeVisible();
  });
});

describe('delete account page', () => {
  test('without a login it explains and offers log in and the support email', async () => {
    installFakeServer({ 'GET /meta/config': meta });
    renderApp('/delete-account');
    const page = await screen.findByTestId('delete-account');
    expect(within(page).getByRole('heading', { name: 'What is deleted' })).toBeVisible();
    expect(within(page).getByRole('heading', { name: 'What stays' })).toBeVisible();
    expect(within(page).getByRole('link', { name: 'Log in to delete my account' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(page).toHaveTextContent('help@fastfour.test');
    expect(within(page).queryByRole('button', { name: 'Delete my account' })).toBeNull();
  });

  test('signed in: asks for the password, shows a wrong password, then deletes', async () => {
    const user = userEvent.setup();
    setSessionHint(true);
    let attempts = 0;
    const server = installFakeServer(
      authed({
        'DELETE /users/me': (config, body) => {
          attempts += 1;
          return body.password === 'Test1234'
            ? { status: 204, data: undefined }
            : apiError(400, 'VALIDATION_ERROR', 'That password is not right.', [
                { field: 'password', message: 'That password is not right.' },
              ]);
        },
      }),
    );
    renderApp('/delete-account');
    await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });

    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter your password.');
    expect(attempts).toBe(0);

    await user.type(within(dialog).getByLabelText('Password'), 'Wrong9999');
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('not right');

    await user.clear(within(dialog).getByLabelText('Password'));
    await user.type(within(dialog).getByLabelText('Password'), 'Test1234');
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
    expect(
      await screen.findByRole('heading', { name: 'Your account has been deleted' }),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(server.calls.filter((c) => c.key === 'DELETE /users/me')).toHaveLength(3 - 1);
    expect(localStorage.getItem('ff-session')).toBeNull();
  });

  test('an admin is told it is not possible here', async () => {
    setSessionHint(true);
    installFakeServer(
      authed({
        'GET /auth/me': () => ({ data: { user: sampleUser({ role: 'admin' }) } }),
      }),
    );
    renderApp('/delete-account');
    const page = await screen.findByTestId('delete-account');
    expect(await within(page).findByText('Admin accounts cannot be deleted here.')).toBeVisible();
  });
});

describe('profile', () => {
  test('has a Delete account row that opens the confirmation, and legal links', async () => {
    const user = userEvent.setup();
    setSessionHint(true);
    installFakeServer(authed());
    renderApp('/profile');
    await user.click(await screen.findByRole('button', { name: 'Delete account' }));
    expect(await screen.findByRole('dialog', { name: 'Delete your account?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep my account' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms');
  });
});

describe('Android back button in a room', () => {
  test('asks "Leave this room?" instead of leaving, and Stay keeps the player there', async () => {
    const user = userEvent.setup();
    setSessionHint(true);
    installFakeServer(authed());
    const room = sampleRoom({
      players: [samplePlayer(1), samplePlayer(2)],
      status: 'lobby',
      phase: 'LOBBY',
    });
    const socket = createFakeSocket({
      'room:join': () => ({ ok: true, data: { room, rejoined: true } }),
      'room:leave': () => ({ ok: true, data: {} }),
    });
    renderApp('/room/K7Q2MX', { socket });
    await screen.findByRole('heading', { name: 'Lobby' });

    act(() => window.history.back());
    const dialog = await screen.findByRole('dialog', { name: 'Leave this room?' });
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog', { name: 'Leave this room?' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Lobby' })).toBeVisible();

    // Back again asks again: the guard was put back.
    act(() => window.history.back());
    const again = await screen.findByRole('dialog', { name: 'Leave this room?' });
    await user.click(within(again).getByRole('button', { name: 'Leave room' }));
    await waitFor(() => expect(socket.calls('room:leave')).toHaveLength(1));
  });
});
