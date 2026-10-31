import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { passwordSchema } from '@fastfour/shared';
import { reset } from '../api/authApi.js';
import { readApiError } from '../api/axiosClient.js';
import Button from '../components/common/Button.jsx';
import Icon from '../components/common/Icon.jsx';
import PasswordStrength from '../components/common/PasswordStrength.jsx';
import TextField from '../components/common/TextField.jsx';
import TopBar from '../components/common/TopBar.jsx';
import { S } from '../utils/strings.js';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [state, setState] = useState(token ? 'form' : 'bad');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await reset({ token, password });
      setState('done');
    } catch (err) {
      const e = readApiError(err, S.errors.network, S.errors.generic);
      if (e.fields.token) setState('bad');
      else if (e.fields.password) setError(e.fields.password);
      else setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'done' || state === 'bad') {
    const done = state === 'done';
    return (
      <main className="ff-page">
        <TopBar title={S.reset.title} to="/login" />
        <div className="ff-grow ff-center" style={{ paddingTop: 32 }}>
          <div className="ff-hero" style={{ color: done ? 'var(--ff-place)' : 'var(--ff-thing)' }}>
            <Icon name={done ? 'check' : 'inbox'} size={72} />
          </div>
          <h2 className="ff-title">{done ? S.reset.doneTitle : S.reset.badTitle}</h2>
          <p className="ff-muted" role="status">
            {done ? S.reset.doneBody : S.reset.badBody}
          </p>
        </div>
        <Button to={done ? '/login' : '/forgot-password'}>
          {done ? S.login.submit : S.reset.newLink}
        </Button>
      </main>
    );
  }

  return (
    <main className="ff-page">
      <TopBar title={S.reset.title} to="/login" />
      <form
        onSubmit={onSubmit}
        noValidate
        className="ff-grow"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <h2 className="ff-title ff-center" style={{ fontSize: 28 }}>
          {S.reset.heading}
        </h2>
        <div style={{ height: 16 }} />
        {formError && (
          <p className="ff-alert" role="alert">
            {formError}
          </p>
        )}
        <TextField
          label={S.reset.password}
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError('');
          }}
          error={error}
          autoComplete="new-password"
        />
        <PasswordStrength password={password} />
        <div className="ff-grow" style={{ minHeight: 16 }} />
        <Button type="submit" disabled={busy}>
          {busy ? S.reset.submitting : S.reset.submit}
        </Button>
      </form>
    </main>
  );
}
