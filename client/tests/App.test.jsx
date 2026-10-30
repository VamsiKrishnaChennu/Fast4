import { render, screen } from '@testing-library/react';
import App from '../src/App.jsx';

test('renders the app name', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Fast Four' })).toBeTruthy();
});
