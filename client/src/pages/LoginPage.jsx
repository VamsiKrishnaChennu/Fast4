import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema } from '@fastfour/shared';
import { readApiError } from '../api/axiosClient.js';
import BoardLogo from '../components/common/BoardLogo.jsx';
import Button from '../components/common/Button.jsx';
import TextField from '../components/common/TextField.jsx';
import TopBar from '../components/common/TopBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { issuesToFields } from '../utils/formErrors.js';
import { S } from '../utils/strings.js';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setErrors(issuesToFields(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await login(parsed.data);
      navigate(location.state?.from ?? '/home', { replace: true });
    } catch (err) {
      setFormError(readApiError(err, S.errors.network, S.errors.generic).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="ff-page">
      <TopBar title={S.login.title} to="/" />
      <form
        onSubmit={onSubmit}
        noValidate
        className="ff-grow"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div className="ff-hero" style={{ marginTop: 0 }}>
          <BoardLogo size={112} />
        </div>
        <h2 className="ff-title ff-center" style={{ fontSize: 30, marginTop: 0 }}>
          {S.login.welcome}
        </h2>
        <p className="ff-muted ff-center" style={{ marginBottom: 24 }}>
          {S.login.sub}
        </p>
        {formError && (
          <p className="ff-alert" role="alert">
            {formError}
          </p>
        )}
        <TextField
          label={S.login.identifier}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={errors.identifier}
          autoComplete="username"
          autoCapitalize="none"
          inputMode="email"
        />
        <TextField
          label={S.login.password}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="current-password"
        />
        <p style={{ textAlign: 'right', margin: '-4px 0 0' }}>
          <Link className="ff-link" to="/forgot-password">
            {S.login.forgot}
          </Link>
        </p>
        <div className="ff-grow" style={{ minHeight: 24 }} />
        <Button type="submit" disabled={busy}>
          {busy ? S.login.submitting : S.login.submit}
        </Button>
        <p className="ff-center ff-muted" style={{ margin: '16px 0 0', fontWeight: 600 }}>
          {S.login.newHere}{' '}
          <Link className="ff-link" to="/signup">
            {S.login.create}
          </Link>
        </p>
      </form>
    </main>
  );
}
