import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { setSessionHint } from '../src/api/axiosClient.js';
import { renderApp } from './helpers/renderApp.jsx';
import { apiError, installFakeServer, sampleUser } from './helpers/fakeServer.js';

const meta = {
  'GET /meta/config': () => ({
    data: { data: { appVersion: '1.2.3', supportEmail: 'help@example.com' } },
  }),
};

async function fillSignup(
  user,
  { nickname = 'Maya', email = 'maya@example.com', password = 'Test1234', agree = true } = {},
) {
  await user.type(screen.getByLabelText('Nickname'), nickname);
  if (email) await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  if (agree) await user.click(screen.getByRole('checkbox'));
}

describe('route protection and session restore', () => {
  test('an anonymous visitor on /home is sent to the log in page', async () => {
    installFakeServer(meta);
    renderApp('/home');
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
  });

  test('a returning player is restored silently with the refresh cookie', async () => {
    setSessionHint(true);
    const server = installFakeServer({
      ...meta,
      'POST /auth/refresh': () => ({ data: { accessToken: 'tok' } }),
      'GET /auth/me': () => ({ data: { user: sampleUser() } }),
    });
    renderApp('/');
    expect(await screen.findByText('Ready, Maya?')).toBeInTheDocument();
    expect(server.calls.find((c) => c.key === 'GET /auth/me').auth).toBe('Bearer tok');
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
  });

  test('a rejected refresh falls back to the welcome page', async () => {
    setSessionHint(true);
    installFakeServer({
      ...meta,
      'POST /auth/refresh': () => apiError(401, 'UNAUTHENTICATED', 'no'),
    });
    renderApp('/');
    expect(await screen.findByText('Create account')).toBeInTheDocument();
    expect(localStorage.getItem('ff-session')).toBeNull();
  });

  test('anonymous visitors make no refresh request', async () => {
    const server = installFakeServer(meta);
    renderApp('/');
    await screen.findByText(/One letter/);
    expect(server.calls.some((c) => c.key === 'POST /auth/refresh')).toBe(false);
  });

  test('unknown addresses show the not found page', async () => {
    installFakeServer(meta);
    renderApp('/nowhere');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});

describe('sign up', () => {
  test('shows every problem and sends nothing when the form is empty', async () => {
    const server = installFakeServer(meta);
    const user = userEvent.setup();
    renderApp('/signup');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/at least 3 characters/)).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Please tick the box to continue.')).toBeInTheDocument();
    expect(server.calls.some((c) => c.key === 'POST /auth/signup')).toBe(false);
  });

  test('rejects a weak password before calling the server', async () => {
    installFakeServer(meta);
    const user = userEvent.setup();
    renderApp('/signup');
    await fillSignup(user, { password: 'weakpass' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Include at least one number.')).toBeInTheDocument();
  });

  test('creates the account with the age and terms confirmation and opens Home', async () => {
    const server = installFakeServer({
      ...meta,
      'POST /auth/signup': () => ({
        status: 201,
        data: { user: sampleUser(), accessToken: 'tok' },
      }),
    });
    const user = userEvent.setup();
    renderApp('/signup');
    await fillSignup(user);
    await user.click(screen.getByRole('radio', { name: 'Colour 3' }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Ready, Maya?')).toBeInTheDocument();
    const call = server.calls.find((c) => c.key === 'POST /auth/signup');
    expect(call.body).toEqual({
      nickname: 'Maya',
      email: 'maya@example.com',
      password: 'Test1234',
      avatarColor: '#1FA463',
      ageConfirmed: true,
      termsAccepted: true,
    });
    expect(localStorage.getItem('ff-session')).toBe('1');
  });

  test('signs up with a phone number and clears the contact when switching', async () => {
    const server = installFakeServer({
      ...meta,
      'POST /auth/signup': () => ({
        status: 201,
        data: { user: sampleUser(), accessToken: 'tok' },
      }),
    });
    const user = userEvent.setup();
    renderApp('/signup');
    await user.type(screen.getByLabelText('Email'), 'typed@example.com');
    await user.click(screen.getByRole('radio', { name: 'Phone' }));
    expect(screen.getByLabelText('Phone')).toHaveValue('');
    await user.type(screen.getByLabelText('Nickname'), 'Maya');
    await user.type(screen.getByLabelText('Phone'), '+14155552671');
    await user.type(screen.getByLabelText('Password'), 'Test1234');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Ready, Maya?');
    expect(server.calls.find((c) => c.key === 'POST /auth/signup').body.phone).toBe('+14155552671');
  });

  test('shows which field the server says is taken', async () => {
    installFakeServer({
      ...meta,
      'POST /auth/signup': () =>
        apiError(409, 'CONFLICT', 'That email address is already in use.', [
          { field: 'email', message: 'That email address is already in use.' },
        ]),
    });
    const user = userEvent.setup();
    renderApp('/signup');
    await fillSignup(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('That email address is already in use.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('shows a friendly message when the server cannot be reached', async () => {
    const server = installFakeServer(meta);
    server.routes['POST /auth/signup'] = () => {
      throw Object.assign(new Error('Network Error'), { isAxiosError: true });
    };
    const user = userEvent.setup();
    renderApp('/signup');
    await fillSignup(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We can't reach the server");
  });

  test('links to the terms and privacy pages', () => {
    installFakeServer(meta);
    renderApp('/signup');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});

describe('log in and log out', () => {
  test('wrong credentials show the generic message', async () => {
    installFakeServer({
      ...meta,
      'POST /auth/login': () => apiError(401, 'UNAUTHENTICATED', 'Invalid credentials.'),
    });
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(screen.getByLabelText('Email or phone'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials.');
  });

  test('asks for both fields', async () => {
    installFakeServer(meta);
    const user = userEvent.setup();
    renderApp('/login');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Enter your email or phone number.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
  });

  test('logs in, shows Home, then logs out from Profile', async () => {
    installFakeServer({
      ...meta,
      'POST /auth/login': () => ({ data: { user: sampleUser(), accessToken: 'tok' } }),
      'POST /auth/logout': () => ({ status: 204, data: null }),
    });
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(screen.getByLabelText('Email or phone'), 'maya@example.com');
    await user.type(screen.getByLabelText('Password'), 'Test1234');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByText('Ready, Maya?');

    await user.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: /Profile/,
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
    expect(localStorage.getItem('ff-session')).toBeNull();

    await user.type(screen.getByLabelText('Email or phone'), 'maya@example.com');
    await user.type(screen.getByLabelText('Password'), 'Test1234');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Ready, Maya?')).toBeInTheDocument();
  });

  test('the password can be shown and hidden', async () => {
    installFakeServer(meta);
    const user = userEvent.setup();
    renderApp('/login');
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  test('keeps the visitor on their way after logging in', async () => {
    installFakeServer({
      ...meta,
      'POST /auth/login': () => ({ data: { user: sampleUser(), accessToken: 'tok' } }),
    });
    const user = userEvent.setup();
    renderApp('/profile');
    await user.type(await screen.findByLabelText('Email or phone'), 'maya@example.com');
    await user.type(screen.getByLabelText('Password'), 'Test1234');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Dark mode')).toBeInTheDocument();
  });
});

describe('forgot and reset password', () => {
  test('rejects an invalid email', async () => {
    installFakeServer(meta);
    const user = userEvent.setup();
    renderApp('/forgot-password');
    await user.type(screen.getByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  });

  test('says to check the email and mentions support for phone-only accounts', async () => {
    const server = installFakeServer({
      ...meta,
      'POST /auth/forgot': () => ({ status: 204, data: null }),
    });
    const user = userEvent.setup();
    renderApp('/forgot-password');
    await screen.findByText(/help@example.com/);
    await user.type(screen.getByLabelText('Email'), 'Maya@Example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('maya@example.com');
    expect(server.calls.find((c) => c.key === 'POST /auth/forgot').body).toEqual({
      email: 'maya@example.com',
    });
    expect(screen.getByRole('link', { name: 'help@example.com' })).toHaveAttribute(
      'href',
      'mailto:help@example.com',
    );
  });

  test('shows a message when the request fails', async () => {
    installFakeServer({
      ...meta,
      'POST /auth/forgot': () => apiError(429, 'RATE_LIMITED', 'Too many requests.'),
    });
    const user = userEvent.setup();
    renderApp('/forgot-password');
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests.');
  });

  test('a reset link without a token explains it is invalid', async () => {
    installFakeServer(meta);
    renderApp('/reset-password');
    expect(await screen.findByText('This link has expired')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  test('saves a new password and offers to log in', async () => {
    const server = installFakeServer({
      ...meta,
      'POST /auth/reset': () => ({ status: 204, data: null }),
    });
    const user = userEvent.setup();
    renderApp(`/reset-password?token=${'t'.repeat(43)}`);
    await user.type(screen.getByLabelText('New password'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText(/at least 8 characters/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'NewPass99');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('Password updated')).toBeInTheDocument();
    expect(server.calls.find((c) => c.key === 'POST /auth/reset').body).toEqual({
      token: 't'.repeat(43),
      password: 'NewPass99',
    });
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  test('an expired token from the server shows the expired state', async () => {
    installFakeServer({
      ...meta,
      'POST /auth/reset': () =>
        apiError(400, 'VALIDATION_ERROR', 'This reset link is invalid or has expired.', [
          { field: 'token', message: 'This reset link is invalid or has expired.' },
        ]),
    });
    const user = userEvent.setup();
    renderApp(`/reset-password?token=${'t'.repeat(43)}`);
    await user.type(screen.getByLabelText('New password'), 'NewPass99');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('This link has expired')).toBeInTheDocument();
  });
});

describe('dark mode switch', () => {
  async function openProfile() {
    installFakeServer({
      ...meta,
      'POST /auth/login': () => ({ data: { user: sampleUser(), accessToken: 'tok' } }),
    });
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(screen.getByLabelText('Email or phone'), 'maya@example.com');
    await user.type(screen.getByLabelText('Password'), 'Test1234');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByText('Ready, Maya?');
    await user.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: /Profile/,
      }),
    );
    return user;
  }

  test('flips the theme, remembers it and shows the app version', async () => {
    const user = await openProfile();
    const toggle = await screen.findByRole('switch', { name: 'Dark mode' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.bsTheme).toBe('dark');
    expect(localStorage.getItem('ff-theme')).toBe('dark');
    await waitFor(() => expect(screen.getByText('Fast Four version 1.2.3')).toBeInTheDocument());
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('ff-theme')).toBe('light');
  });

  test('starts dark when the phone is in dark mode and nothing is saved', async () => {
    window.matchMedia = (query) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    });
    const user = await openProfile();
    expect(await screen.findByRole('switch', { name: 'Dark mode' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(user).toBeTruthy();
  });

  test('a saved choice beats the phone setting', async () => {
    localStorage.setItem('ff-theme', 'light');
    window.matchMedia = (query) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    });
    await openProfile();
    expect(await screen.findByRole('switch', { name: 'Dark mode' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
