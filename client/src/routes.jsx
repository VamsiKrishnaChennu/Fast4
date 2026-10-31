import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute, TabsLayout } from './components/layout/RouteGuards.jsx';
import ComingSoonPage from './pages/ComingSoonPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import SignupPage from './pages/SignupPage.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/terms" element={<ComingSoonPage />} />
      <Route path="/privacy" element={<ComingSoonPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<TabsLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/ranks" element={<ComingSoonPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="/single" element={<ComingSoonPage />} />
        <Route path="/group" element={<ComingSoonPage />} />
      </Route>
      <Route path="/index.html" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
