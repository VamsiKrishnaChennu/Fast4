import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext.jsx';
import { RealtimeProvider } from '../../src/context/RealtimeContext.jsx';
import { ThemeProvider } from '../../src/context/ThemeContext.jsx';
import { createFakeSocket } from './fakeSocket.js';
import AppRoutes from '../../src/routes.jsx';

/**
 * Renders the whole app. The socket is a fake that connects at once; pass your own to control it.
 * @param {string} path
 * @param {{ socket?: ReturnType<typeof createFakeSocket> }} [options]
 */
export function renderApp(path = '/', { socket = createFakeSocket() } = {}) {
  const socketFactory = () => {
    queueMicrotask(() => socket.open());
    return socket;
  };
  const result = render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <RealtimeProvider socketFactory={socketFactory}>
            <AppRoutes />
          </RealtimeProvider>
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
  return { ...result, socket };
}
