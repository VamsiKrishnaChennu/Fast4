import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { S } from '../../utils/strings.js';
import BoardLogo from '../common/BoardLogo.jsx';
import BottomNav from './BottomNav.jsx';

function Splash() {
  return (
    <main className="ff-page ff-center" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <BoardLogo size={96} />
      <p className="ff-muted" role="status">
        {S.loading}
      </p>
    </main>
  );
}

/** Signed-in pages. Sends visitors to log in and remembers where they wanted to go. */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'anon')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Welcome, log in and sign up pages. Signed-in players go straight home. */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'authed') return <Navigate to="/home" replace />;
  return <Outlet />;
}

/** Signed-in pages that show the bottom tabs. */
export function TabsLayout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}
