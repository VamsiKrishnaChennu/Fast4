import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext.jsx';
import { ThemeProvider } from '../../src/context/ThemeContext.jsx';
import AppRoutes from '../../src/routes.jsx';

export function renderApp(path = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}
